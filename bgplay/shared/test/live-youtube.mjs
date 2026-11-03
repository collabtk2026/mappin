// 실제 YouTube 대상 bgplay.js 검증 (데스크톱 Chromium + 모바일 에뮬레이션).
//
// ⚠️ 개발 환경(2026-11-03)에서는 youtube.com 접속이 막혀 한 번도 실행하지 못했다.
//    YouTube에 접속되는 PC에서 실행하고 결과를 DOCS/LOG.md 에 기록한다. (DOCS/ENV_PENDING.md E-04)
//
// 실행:
//   node bgplay/shared/test/live-youtube.mjs                 # 헤드리스: 메타데이터·핸들러·폴리필 확인
//   HEADED=1 node bgplay/shared/test/live-youtube.mjs        # 창 표시: 실제 탭 숨김(백그라운드) 테스트 포함
//   VIDEO=<11자 ID> MUSIC=1 node ...                          # 다른 영상 / music.youtube.com 도 확인
//   CHROME=/path/to/chrome node ...                           # 다른 Chromium 실행 파일
//
// 결과: 콘솔 요약 + bgplay/shared/test/live-report.json (커밋하지 않음)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(path.join(here, '../js/bgplay.js'), 'utf8');

const VIDEO = process.env.VIDEO || 'dQw4w9WgXcQ';
const HEADED = process.env.HEADED === '1';
const HIDDEN_WAIT_MS = Number(process.env.HIDDEN_WAIT_MS || 20000);
const report = { at: new Date().toISOString(), video: VIDEO, headed: HEADED, runs: [] };

const browser = await chromium.launch({
  headless: !HEADED,
  executablePath: process.env.CHROME || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

/**
 * @param name           결과 이름
 * @param url            열 주소
 * @param opts.bg        backgroundPlay 설정
 * @param opts.noSession navigator.mediaSession 을 지워 Android WebView 를 흉내 (폴리필 경로)
 * @param opts.hide      HEADED 일 때 새 탭을 앞으로 가져와 이 탭을 실제로 hidden 으로 만든다
 */
async function run(name, url, opts) {
  const r = { name, url, ok: false, notes: [] };
  report.runs.push(r);
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'ko-KR' });
  const page = await context.newPage();
  try {
    if (opts.noSession) {
      await page.addInitScript(() => { delete Navigator.prototype.mediaSession; delete window.MediaMetadata; delete window.MediaSession; });
    }
    await page.addInitScript(() => {
      window.__msgs = [];
      window.BgPlayNative = { postMessage: (s) => { try { window.__msgs.push(JSON.parse(s)); } catch (e) {} } };
    });
    await page.addInitScript(`window.__BGPLAY_CONFIG={backgroundPlay:${opts.bg},platform:"live-test"};`);
    await page.addInitScript(SCRIPT);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissConsent(page, r);
    r.finalUrl = page.url();

    // 자동재생이 안 되면 플레이어를 한 번 탭
    const started = await waitPlaying(page, 15000);
    if (!started) {
      await page.locator('video, #player, .html5-video-player').first().click({ timeout: 5000 }).catch(() => {});
      if (!(await waitPlaying(page, 15000))) r.notes.push('재생이 시작되지 않음 (자동재생 차단/봇 확인/로그인 요구 가능)');
    }

    const st = await lastState(page);
    r.state = st && pick(st, ['playing', 'title', 'artist', 'album', 'artwork', 'duration', 'canNext', 'canPrev', 'url']);
    r.nativeMediaSession = await page.evaluate(() => !!window.MediaSession);
    r.selectors = await page.evaluate(() => {
      const q = (s) => !!document.querySelector(s);
      return {
        'video.html5-main-video': q('video.html5-main-video'),
        '.ytp-next-button': q('.ytp-next-button'),
        'button.player-control-next': q('button.player-control-next'),
        'ytmusic-player-bar .next-button': q('ytmusic-player-bar .next-button'),
        '#movie_player': q('#movie_player'),
      };
    });
    r.documentTitle = await page.title();

    if (opts.hide) {
      if (!HEADED) {
        r.notes.push('숨김 테스트는 HEADED=1 에서만 의미 있음 (헤드리스는 탭이 hidden 이 되지 않을 수 있음) → 건너뜀');
      } else {
        const other = await context.newPage();
        await other.goto('about:blank');
        await other.bringToFront();
        await page.waitForTimeout(1500);
        // reported: 페이지가 보는 값(BG 켬이면 위장돼 'visible'), real: bgplay.js 가 받은 실제 전환 기록
        r.visibilityAfterHide = await page.evaluate(() => ({
          reported: document.visibilityState,
          real: window.__msgs.filter((m) => m.type === 'visibility').map((m) => m.state),
        }));
        await page.waitForTimeout(HIDDEN_WAIT_MS);
        r.playingAfterHidden = await page.evaluate(() => { const v = document.querySelector('video'); return !!v && !v.paused && !v.ended; });
        r.autoResumes = await page.evaluate(() => window.__msgs.filter((m) => m.type === 'autoResume').length);
        await page.bringToFront();
      }
    }
    r.ok = true;
  } catch (e) {
    r.error = String(e && e.message || e).split('\n')[0];
  } finally {
    await context.close();
  }
  console.log(`\n## ${name}\n` + JSON.stringify(r, null, 2));
}

async function dismissConsent(page, r) {
  if (!/consent\./.test(page.url())) return;
  const btn = page.getByRole('button', { name: /Accept all|Reject all|모두 수락|모두 거부/ }).first();
  if (await btn.count()) { await btn.click(); await page.waitForLoadState('domcontentloaded'); r.notes.push('쿠키 동의 화면 처리함'); }
}

async function waitPlaying(page, ms) {
  try {
    await page.waitForFunction(() => window.__msgs.some((m) => m.type === 'state' && m.playing), null, { timeout: ms });
    return true;
  } catch { return false; }
}

const lastState = (page) => page.evaluate(() => window.__msgs.filter((m) => m.type === 'state').pop() || null);
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

const watch = `https://m.youtube.com/watch?v=${VIDEO}`;
await run('A. m.youtube.com — 메타데이터·핸들러 (네이티브 Media Session)', watch, { bg: true });
await run('B. m.youtube.com — Android WebView 흉내 (Media Session 없음 → 폴리필)', watch, { bg: true, noSession: true });
await run('C. 실제 탭 숨김 — BG 켬 (계속 재생돼야 함)', watch, { bg: true, hide: true });
await run('D. 실제 탭 숨김 — BG 끔 (대조군: YouTube가 멈추는지)', watch, { bg: false, hide: true });
if (process.env.MUSIC === '1') {
  await run('E. music.youtube.com — 메타데이터', `https://music.youtube.com/watch?v=${VIDEO}`, { bg: true });
}

await browser.close();
const out = path.join(here, 'live-report.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\n보고서: ${out}`);
console.log('판정 가이드: DOCS/ENV_PENDING.md 의 E-04 항목 참고');
