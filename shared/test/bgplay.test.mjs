// bgplay.js 동작 검증 (Playwright + Chromium).
// 실행: node bgplay/shared/test/bgplay.test.mjs
//
// 헤드리스 Chromium에서는 "진짜" 백그라운드 전환을 만들 수 없으므로, bgplay.js보다 먼저
// Document.prototype.visibilityState 를 제어 가능한 가짜로 바꿔 엔진 역할을 흉내 낸다.
// 엔진 주도 정지(WebKit/Chromium이 직접 멈추는 경우)는 bgplay.js가 감싸기 전의 원본
// HTMLMediaElement.prototype.pause 를 호출해 흉내 낸다.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(path.join(here, '../js/bgplay.js'), 'utf8');

const HARNESS = `
  window.__fakeVis = 'visible';
  Object.defineProperty(Document.prototype, 'visibilityState', {
    configurable: true, enumerable: true, get() { return window.__fakeVis; }
  });
  Object.defineProperty(Document.prototype, 'hidden', {
    configurable: true, enumerable: true, get() { return window.__fakeVis !== 'visible'; }
  });
  window.__enginePause = HTMLMediaElement.prototype.pause;
  window.__msgs = [];
  window.BgPlayNative = { postMessage(s) { window.__msgs.push(JSON.parse(s)); } };
  window.__goHidden = () => { window.__fakeVis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); };
  window.__goVisible = () => { window.__fakeVis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); };
`;

// 20초짜리 무음 WAV를 만들어 <video>에 넣고, YouTube처럼 visibilitychange로 스스로 멈추는 페이지.
const PAGE = `<!doctype html><html><head><title>Test Song - YouTube</title></head><body>
<video class="html5-main-video" playsinline></video>
<script>
  function wav(seconds) {
    const rate = 8000, n = rate * seconds, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  const video = document.querySelector('video');
  video.src = wav(20);
  window.pageVisCalls = 0;
  // YouTube 플레이어 흉내: 숨겨지면 스스로 멈춘다.
  document.addEventListener('visibilitychange', () => { window.pageVisCalls++; if (document.hidden) video.pause(); });
  window.addEventListener('visibilitychange', () => { window.pageVisCalls++; });
  document.onvisibilitychange = () => { window.pageVisCalls++; };
  window.nextCalls = 0;
  navigator.mediaSession.setActionHandler('nexttrack', () => { window.nextCalls++; });
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Test Song', artist: 'Test Artist', album: 'Test Album',
    artwork: [{ src: 'https://example.invalid/s.jpg', sizes: '96x96' }, { src: 'https://example.invalid/l.jpg', sizes: '512x512' }]
  });
</script></body></html>`;

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); console.log('ok   -', name); }
  catch (e) { results.push([false, name]); console.log('FAIL -', name, '\n      ', e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

async function open(backgroundPlay) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('http://bgplay.test/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.addInitScript(HARNESS);
  await page.addInitScript(`window.__BGPLAY_CONFIG = { backgroundPlay: ${backgroundPlay}, platform: 'test' };`);
  await page.addInitScript(SCRIPT);
  await page.goto('http://bgplay.test/watch?v=test');
  await page.evaluate(() => document.querySelector('video').play());
  await page.waitForFunction(() => !document.querySelector('video').paused);
  return { page, close: () => context.close() };
}

const paused = (page) => page.evaluate(() => document.querySelector('video').paused);

await test('가시성 위장: 숨겨져도 visible / hidden=false', async () => {
  const { page, close } = await open(true);
  const r = await page.evaluate(() => { __goHidden(); return [document.visibilityState, document.hidden]; });
  assert(r[0] === 'visible' && r[1] === false, JSON.stringify(r));
  await close();
});

await test('페이지의 visibilitychange 리스너(document/window/on-속성)는 호출되지 않음', async () => {
  const { page, close } = await open(true);
  await page.evaluate(() => __goHidden());
  await sleep(100);
  assert((await page.evaluate(() => window.pageVisCalls)) === 0, 'listener called');
  assert(!(await paused(page)), 'video paused by page listener');
  await close();
});

await test('hidden 직후 엔진이 멈추면 자동 재개', async () => {
  const { page, close } = await open(true);
  await page.evaluate(() => { __goHidden(); __enginePause.call(document.querySelector('video')); });
  await sleep(300);
  assert(!(await paused(page)), 'not resumed');
  assert((await page.evaluate(() => __msgs.some((m) => m.type === 'autoResume'))), 'no autoResume message');
  await close();
});

await test('엔진이 먼저 멈추고 2초 안에 hidden이 오면 자동 재개', async () => {
  const { page, close } = await open(true);
  await page.evaluate(() => __enginePause.call(document.querySelector('video')));
  await sleep(200);
  await page.evaluate(() => __goHidden());
  await sleep(300);
  assert(!(await paused(page)), 'not resumed');
  await close();
});

await test('사용자/사이트의 pause()는 재개하지 않음', async () => {
  const { page, close } = await open(true);
  await page.evaluate(() => { document.querySelector('video').pause(); __goHidden(); });
  await sleep(300);
  assert(await paused(page), 'resumed a user pause');
  await close();
});

await test('hidden 후 2초가 지난 엔진 정지(예: 통화)는 재개하지 않음', async () => {
  const { page, close } = await open(true);
  await page.evaluate(() => __goHidden());
  await sleep(2200);
  await page.evaluate(() => __enginePause.call(document.querySelector('video')));
  await sleep(300);
  assert(await paused(page), 'resumed outside window');
  await close();
});

await test('holdAutoResume 동안에는 재개하지 않음', async () => {
  const { page, close } = await open(true);
  await page.evaluate(() => {
    __bgplay.command('holdAutoResume', 5000);
    __goHidden(); __enginePause.call(document.querySelector('video'));
  });
  await sleep(300);
  assert(await paused(page), 'resumed during hold');
  await close();
});

await test('브리지: 상태/메타데이터 전송 (mediaSession 우선, 가장 큰 아트워크)', async () => {
  const { page, close } = await open(true);
  await sleep(200);
  const s = await page.evaluate(() => __msgs.filter((m) => m.type === 'state').pop());
  assert(s && s.playing === true, 'not playing: ' + JSON.stringify(s));
  assert(s.title === 'Test Song' && s.artist === 'Test Artist' && s.album === 'Test Album', 'metadata ' + JSON.stringify(s));
  assert(s.artwork === 'https://example.invalid/l.jpg', 'artwork ' + s.artwork);
  assert(s.duration > 19 && s.duration < 21, 'duration ' + s.duration);
  assert(s.canNext === true && s.canPrev === false, 'canNext/canPrev');
  await close();
});

await test('명령: next는 사이트 mediaSession 핸들러 호출, pause/seekto/play 동작', async () => {
  const { page, close } = await open(true);
  const r = await page.evaluate(async () => {
    const v = document.querySelector('video');
    __bgplay.command('next');
    const next = window.nextCalls;
    __bgplay.command('pause');
    const p1 = v.paused;
    __bgplay.command('seekto', 7.5);
    const t = v.currentTime;
    __bgplay.command('play');
    await new Promise((res) => setTimeout(res, 100));
    return { next, p1, t, p2: v.paused };
  });
  assert(r.next === 1, 'next ' + r.next);
  assert(r.p1 === true && r.p2 === false, 'pause/play ' + JSON.stringify(r));
  assert(Math.abs(r.t - 7.5) < 0.01, 'seek ' + r.t);
  await close();
});

await test('명령으로 멈춘 뒤 숨겨져도 재개하지 않음', async () => {
  const { page, close } = await open(true);
  await page.evaluate(() => { __bgplay.command('pause'); __goHidden(); });
  await sleep(300);
  assert(await paused(page), 'resumed');
  await close();
});

await test('backgroundPlay=false: 위장/자동재개 없음 (사이트 기본 동작)', async () => {
  const { page, close } = await open(false);
  await page.evaluate(() => __goHidden());
  await sleep(200);
  const r = await page.evaluate(() => [document.visibilityState, window.pageVisCalls, document.querySelector('video').paused]);
  assert(r[0] === 'hidden' && r[1] >= 2 && r[2] === true, JSON.stringify(r));
  await close();
});

await test('Media Session 이 없는 WebView(Android): 폴리필로 메타데이터·핸들러 수집', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('http://bgplay.test/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.addInitScript(() => { delete Navigator.prototype.mediaSession; delete window.MediaMetadata; delete window.MediaSession; });
  await page.addInitScript(HARNESS);
  await page.addInitScript(`window.__BGPLAY_CONFIG = { backgroundPlay: true, platform: 'android' };`);
  await page.addInitScript(SCRIPT);
  await page.goto('http://bgplay.test/watch?v=test');
  await page.evaluate(() => document.querySelector('video').play());
  await sleep(300);
  const s = await page.evaluate(() => __msgs.filter((m) => m.type === 'state').pop());
  assert(s.title === 'Test Song' && s.artist === 'Test Artist' && s.artwork === 'https://example.invalid/l.jpg', JSON.stringify(s));
  assert(s.canNext === true, 'canNext via polyfill handler');
  await page.evaluate(() => __bgplay.command('next'));
  assert((await page.evaluate(() => window.nextCalls)) === 1, 'next handler');
  await context.close();
});

await browser.close();
const failed = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
