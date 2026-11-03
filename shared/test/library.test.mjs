// 보관함(빠른 저장 → 나중에 분류) 테스트: core.js 단위 테스트 + UI(Playwright/Chromium) 시나리오.
// 실행: node shared/test/library.test.mjs   (스크린샷: SHOTS=<dir> 환경변수)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(here, '../web/library');
const C = require(path.join(LIB, 'core.js'));
const { chromium } = require('playwright');

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log('ok   -', name); }
  catch (e) { results.push(false); console.log('FAIL -', name, '\n      ', e.stack.split('\n').slice(0, 3).join('\n       ')); }
}
function assert(c, m) { if (!c) throw new Error(m); }
function eq(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m || ''} expected ${y} got ${x}`); }

const T = (id, title, extra = {}) => ({ url: `https://m.youtube.com/watch?v=${id}`, title, artist: 'Artist ' + title, ...extra });
const IDS = ['aaaaaaaaaa1', 'bbbbbbbbbb2', 'cccccccccc3', 'dddddddddd4', 'eeeeeeeeee5'];

// ============================================================ core.js

console.log('# core');

await test('parseVideo: watch / music / youtu.be / shorts / live / 비YouTube', () => {
  eq(C.parseVideo('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), { videoId: 'dQw4w9WgXcQ', source: 'youtube' });
  eq(C.parseVideo('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD'), { videoId: 'dQw4w9WgXcQ', source: 'music' });
  eq(C.parseVideo('https://youtu.be/dQw4w9WgXcQ?si=abc'), { videoId: 'dQw4w9WgXcQ', source: 'youtube' });
  eq(C.parseVideo('https://www.youtube.com/shorts/dQw4w9WgXcQ'), { videoId: 'dQw4w9WgXcQ', source: 'youtube' });
  eq(C.parseVideo('https://www.youtube.com/live/dQw4w9WgXcQ?feature=share'), { videoId: 'dQw4w9WgXcQ', source: 'youtube' });
  eq(C.parseVideo('https://m.youtube.com/'), null);
  eq(C.parseVideo('https://evil.com/watch?v=dQw4w9WgXcQ'), null);
  eq(C.parseVideo('https://notyoutube.com/watch?v=dQw4w9WgXcQ'), null);
});

await test('quickSave: 임시함에 추가, 중복은 위치만 알려줌, 제목 정리', () => {
  const d = C.empty(1);
  const r1 = C.quickSave(d, T(IDS[0], 'Song A - YouTube'), 10);
  eq(r1.status, 'added'); eq(d.items[IDS[0]].title, 'Song A');
  eq(C.inbox(d).length, 1);
  C.classify(d, [IDS[0]], { categoryIds: ['c_default_1'] });
  const r2 = C.quickSave(d, { url: `https://youtu.be/${IDS[0]}` }, 20);
  eq(r2.status, 'duplicate'); eq(r2.where, ['운동']);
  eq(C.quickSave(d, { url: 'https://m.youtube.com/' }).status, 'invalid');
});

await test('saveClassified + classify: 소속 추가/이동, 태그 정규화, MRU, 지난 선택', () => {
  const d = C.empty(1);
  C.saveClassified(d, T(IDS[0], 'A'), { categoryIds: ['c_default_1', 'c_default_2'], tags: ['#Chill', 'chill', ' 밤 '] }, 100);
  eq(C.categoryNamesOf(d, IDS[0]), ['운동', '집중']);
  eq(d.items[IDS[0]].tags, ['chill', '밤']);
  eq(C.categoriesByRecent(d)[0].lastUsedAt, 100);
  eq(d.prefs.lastSelection, { categoryIds: ['c_default_1', 'c_default_2'], tags: ['chill', '밤'] });
  C.classify(d, [IDS[0]], { categoryIds: ['c_default_3'], move: true });
  eq(C.categoryNamesOf(d, IDS[0]), ['드라이브']);
  eq(C.inbox(d).length, 0);
});

await test('카테고리: 이름 중복 방지, 삭제하면 곡은 임시함으로', () => {
  const d = C.empty(1);
  const c = C.createCategory(d, '새벽 감성', '🌙', 5);
  eq(C.createCategory(d, '  새벽   감성 ', '🎵', 6).id, c.id);
  C.quickSave(d, T(IDS[0], 'A'));
  C.classify(d, [IDS[0]], { categoryIds: [c.id] });
  eq(C.inbox(d).length, 0);
  C.deleteCategory(d, c.id);
  eq(C.inbox(d).length, 1);
  eq(d.items[IDS[0]].title, 'A');
});

await test('load: 깨진 데이터 복구 (없는 곡 참조 제거, 잘못된 ID 버림)', () => {
  const d = C.load(JSON.stringify({
    items: { x: { videoId: 'bad' }, [IDS[0]]: { videoId: IDS[0], title: 'A', tags: ['A', 'a'] } },
    categories: [{ id: 'k', name: 'K', items: [IDS[0], IDS[0], 'ghost'] }, { id: 'k', name: 'dup' }],
  }));
  eq(Object.keys(d.items), [IDS[0]]);
  eq(d.categories.length, 1); eq(d.categories[0].items, [IDS[0]]);
  eq(d.items[IDS[0]].tags, ['a']);
  eq(C.load('not json').categories.length, 4);
});

await test('queueOf: 순서/시작 위치, 셔플은 고른 곡이 첫 곡', () => {
  const list = IDS.map((id, i) => ({ videoId: id, source: i % 2 ? 'music' : 'youtube', title: 't' + i }));
  const q = C.queueOf(list, 2, false);
  eq(q.index, 2); eq(q.items[1].url, `https://music.youtube.com/watch?v=${IDS[1]}`);
  let seed = 0.3; const rand = () => (seed = (seed * 9301 + 0.49297) % 1);
  const s = C.queueOf(list, 3, true, rand);
  eq(s.index, 0); eq(s.items[0].videoId, IDS[3]); eq(s.items.map((x) => x.videoId).sort(), [...IDS].sort());
  assert(C.youtubePlaylistUrl(list).endsWith(IDS.join(',')), 'playlist url');
});

await test('내보내기 → 가져오기(합치기/덮어쓰기)', () => {
  const a = C.empty(1);
  C.saveClassified(a, T(IDS[0], 'A'), { categoryIds: ['c_default_0'], tags: ['x'] });
  const c = C.createCategory(a, '로파이', '🎧');
  C.saveClassified(a, T(IDS[1], 'B'), { categoryIds: [c.id] });
  const json = C.exportJson(a);
  const b = C.empty(1);
  C.saveClassified(b, T(IDS[0], 'A'), { tags: ['y'] });
  const r = C.importJson(b, json, false);
  assert(r.ok, r.error); eq(r.added, 1);
  eq(b.items[IDS[0]].tags, ['y', 'x']);
  eq(C.categoryNamesOf(b, IDS[1]), ['로파이']);
  eq(C.importJson(C.empty(), json, true).data.categories.length, 5);
  eq(C.importJson(C.empty(), '{"hello":1}', false).ok, false);
});

// ============================================================ UI

console.log('# ui');

const browser = await chromium.launch();
const FILES = { 'index.html': 'text/html', 'core.js': 'text/javascript', 'ui.js': 'text/javascript', 'style.css': 'text/css' };

async function open(initial, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: opts.shots ? 2 : 1, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.route('https://ytimg.test/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: svgThumb(r.request().url()) }));
  await page.route('https://appassets.test/library/**', (r) => {
    const f = new URL(r.request().url()).pathname.split('/').pop();
    r.fulfill({ contentType: FILES[f] || 'text/plain', body: readFileSync(path.join(LIB, f), 'utf8') });
  });
  await page.addInitScript(() => {
    window.__out = [];
    window.BgLibNative = { postMessage: (s) => window.__out.push(JSON.parse(s)) };
  });
  page.on('pageerror', (e) => { throw e; });
  await page.goto('https://appassets.test/library/index.html');
  await page.waitForFunction(() => window.__out.some((m) => m.type === 'ready'));
  await page.evaluate((d) => window.__bglib.boot(d), initial ?? null);
  return { page, close: () => context.close() };
}

function svgThumb(url) {
  const hue = [...url].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="hsl(${hue},45%,35%)"/><text x="160" y="100" font-size="40" text-anchor="middle" fill="#fff">♪</text></svg>`;
}

const track = (i, title, artist) => ({ url: `https://m.youtube.com/watch?v=${IDS[i]}`, title, artist, artwork: `https://ytimg.test/${i}.svg`, duration: 200 + i });
const out = (page, type) => page.evaluate((t) => window.__out.filter((m) => !t || m.type === t), type);
const lastData = async (page) => C.load((await out(page, 'persist')).pop().data);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };

await test('상단 ＋(임시 저장): 결과 반환, 저장(persist)·배지(stats) 전송, 중복 표시', async () => {
  const { page, close } = await open();
  const r1 = JSON.parse(await page.evaluate((t) => __bglib.quickSave(t), track(0, '밤편지', '아이유')));
  eq(r1.status, 'added'); eq(r1.inbox, 1);
  const r2 = JSON.parse(await page.evaluate((t) => __bglib.quickSave(t), track(0, '밤편지', '아이유')));
  eq(r2.status, 'duplicate');
  eq((await out(page, 'stats')).pop(), { type: 'stats', inbox: 1, total: 1 });
  const d = await lastData(page);
  eq(d.items[IDS[0]].thumb, 'https://ytimg.test/0.svg');
  eq(JSON.parse(await page.evaluate(() => __bglib.quickSave({ url: 'https://m.youtube.com/' }))).status, 'invalid');
  await close();
});

await test('상단 분류 버튼: 카테고리 선택 + 태그 입력 → 저장, 토스트·닫기 요청', async () => {
  const { page, close } = await open();
  await page.evaluate((t) => __bglib.openSave(t), track(1, 'Hype Boy', 'NewJeans'));
  await page.getByRole('button', { name: '🏃 운동' }).click();
  await page.fill('#taginput', '신남, 아침');
  await page.press('#taginput', 'Enter');
  await shot(page, '1-save-sheet');
  await page.getByRole('button', { name: '1개 카테고리에 저장' }).click();
  eq((await out(page, 'toast')).pop().text, '🏃 운동에 저장했어요');
  assert((await out(page, 'close')).length === 1, 'close');
  const d = await lastData(page);
  eq(C.categoryNamesOf(d, IDS[1]), ['운동']); eq(d.items[IDS[1]].tags, ['신남', '아침']);
  // 다시 열면 현재 소속/태그가 선택돼 있고, 해제하면 빠진다(소속 편집)
  await page.evaluate((t) => __bglib.openSave(t), track(1, 'Hype Boy', 'NewJeans'));
  assert(await page.locator('.chip.on', { hasText: '운동' }).count() === 1, 'preselected');
  await page.getByRole('button', { name: '지난번처럼' }).isVisible();
  await page.getByRole('button', { name: '🏃 운동' }).click();
  await page.getByRole('button', { name: '임시함에 저장' }).click();
  eq(C.inbox(await lastData(page)).length, 1);
  await close();
});

await test('분류 시트 안에서 새 카테고리 만들고 바로 선택', async () => {
  const { page, close } = await open();
  await page.evaluate((t) => __bglib.openSave(t), track(2, 'Lofi', 'ChilledCow'));
  await page.getByRole('button', { name: '＋ 새 카테고리' }).click();
  await page.getByRole('button', { name: '🎧' }).click();
  await page.fill('#newcat', '로파이');
  await page.press('#newcat', 'Enter');
  assert(await page.locator('.chip.on', { hasText: '로파이' }).count() === 1, 'new cat selected');
  await page.getByRole('button', { name: '1개 카테고리에 저장' }).click();
  const d = await lastData(page);
  eq(C.categoryNamesOf(d, IDS[2]), ['로파이']);
  eq(C.categoriesByRecent(d)[0].emoji, '🎧');
  await close();
});

function seeded() {
  const d = C.empty(1);
  const names = [['밤편지', '아이유'], ['Hype Boy', 'NewJeans'], ['Lofi beats', 'ChilledCow'], ['Dynamite', 'BTS'], ['Spring Day', 'BTS']];
  names.forEach(([t, a], i) => C.quickSave(d, track(i, t, a), Date.now() - (i + 1) * 60000 * (i * 7 + 1)));
  return JSON.stringify(d);
}

await test('보관함 임시함: 빠른 이동 칩 → 되돌리기', async () => {
  const { page, close } = await open(seeded());
  await page.evaluate(() => __bglib.openLibrary());
  assert(await page.locator('.tabs .badge').innerText() === '5', 'badge 5');
  await page.evaluate(() => __bglib.nowPlaying({ url: 'https://m.youtube.com/watch?v=ffffffffff6', title: '지금 재생 중인 곡' }));
  await shot(page, '2-inbox');
  await page.locator(`[data-row="${IDS[0]}"] [data-act="quick-move"]`, { hasText: '운동' }).click();
  assert(await page.locator(`[data-row="${IDS[0]}"]`).count() === 0, 'moved out of inbox');
  assert((await page.locator('#toast').textContent()).includes('운동'), 'toast');
  await page.locator('#toast button').click();
  assert(await page.locator(`[data-row="${IDS[0]}"]`).count() === 1, 'undo restored');
  eq(C.inbox(await lastData(page)).length, 5);
  await close();
});

await test('하나씩 분류: 탭=분류 후 다음, 여러 개 선택, 건너뛰기, 삭제, 되돌리기, 완료', async () => {
  const { page, close } = await open(seeded());
  await page.evaluate(() => __bglib.openLibrary('inbox'));
  await page.getByRole('button', { name: '하나씩 분류' }).click();
  await page.getByRole('button', { name: '#' }).count(); // no-op
  await shot(page, '3-triage');
  // 1: 운동
  await page.locator('.cat-btn', { hasText: '운동' }).click();
  // 2: 되돌리기 -> 다시 1번
  await page.getByRole('button', { name: '↶ 되돌리기' }).click();
  assert((await page.locator('h2').innerText()).startsWith('분류하기 1 /'), 'undo pos');
  await page.locator('.cat-btn', { hasText: '운동' }).click();
  // 2: 여러 개 선택 (집중 + 드라이브)
  await page.getByRole('button', { name: '여러 개 선택' }).click();
  await page.locator('.cat-btn', { hasText: '집중' }).click();
  await page.locator('.cat-btn', { hasText: '드라이브' }).click();
  await page.getByRole('button', { name: '확인 → 다음' }).click();
  // 3: 건너뛰기, 4: 삭제, 5: 즐겨찾기 (여러 개 모드 끄고)
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.getByRole('button', { name: '삭제' }).click();
  await page.getByRole('button', { name: /여러 개 선택/ }).click();
  await page.locator('.cat-btn', { hasText: '즐겨찾기' }).click();
  assert(await page.getByText('모두 분류했어요').isVisible(), 'done');
  const d = await lastData(page);
  const ordered = C.allItems(C.load(seeded())).map((x) => x.videoId);
  eq(C.categoryNamesOf(d, ordered[0]), ['운동']);
  eq(C.categoryNamesOf(d, ordered[1]).sort(), ['드라이브', '집중'].sort());
  eq(C.categoryNamesOf(d, ordered[2]), []);
  assert(!d.items[ordered[3]], 'deleted');
  eq(C.categoryNamesOf(d, ordered[4]), ['즐겨찾기']);
  eq(C.inbox(d).map((x) => x.videoId), [ordered[2]]);
  await close();
});

await test('길게 눌러 여러 곡 선택 → 한 번에 분류', async () => {
  const { page, close } = await open(seeded());
  await page.evaluate(() => __bglib.openLibrary('inbox'));
  const row = page.locator(`[data-row="${IDS[1]}"] .meta`);
  const box = await row.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  assert(await page.locator('.bottombar').isVisible(), 'select mode');
  await page.locator(`[data-row="${IDS[2]}"] .meta`).click();
  assert((await page.locator('.bottombar .grow').innerText()) === '2개 선택', 'count');
  await page.getByRole('button', { name: '분류', exact: true }).click();
  await page.getByRole('button', { name: '📚 집중' }).click();
  await page.getByRole('button', { name: '1개 카테고리에 저장' }).click();
  const d = await lastData(page);
  eq(C.itemsOf(d, 'c_default_2').map((x) => x.videoId).sort(), [IDS[1], IDS[2]].sort());
  await close();
});

await test('카테고리 상세: 전체 재생 큐 / 곡 탭은 그 위치부터 / 셔플', async () => {
  const d = C.load(seeded());
  C.classify(d, [IDS[0], IDS[1], IDS[2]], { categoryIds: ['c_default_1'] });
  const { page, close } = await open(JSON.stringify(d));
  await page.evaluate(() => __bglib.openLibrary('categories'));
  await shot(page, '4-categories');
  await page.locator('[data-act="open-cat"]', { hasText: '운동' }).click();
  await shot(page, '5-category-detail');
  await page.getByRole('button', { name: '▶ 전체 재생' }).click();
  let q = (await out(page, 'playQueue')).pop();
  eq(q.name, '🏃 운동'); eq(q.index, 0); eq(q.items.map((x) => x.videoId), [IDS[0], IDS[1], IDS[2]]);
  await page.evaluate(() => __bglib.openLibrary('categories'));
  await page.locator('[data-act="open-cat"]', { hasText: '운동' }).click();
  await page.locator(`[data-row="${IDS[1]}"] .meta`).click();
  q = (await out(page, 'playQueue')).pop();
  eq(q.index, 1);
  await close();
});

await test('카테고리 삭제(확인 시트) → 곡은 임시함으로, 되돌리기', async () => {
  const d = C.load(seeded());
  C.classify(d, [IDS[0]], { categoryIds: ['c_default_1'] });
  const { page, close } = await open(JSON.stringify(d));
  await page.evaluate(() => __bglib.openLibrary('categories'));
  await page.locator('[data-act="open-cat"]', { hasText: '운동' }).click();
  await page.getByRole('button', { name: '편집' }).click();
  await page.getByRole('button', { name: '카테고리 삭제' }).click();
  await page.locator('.sheet').getByRole('button', { name: '삭제' }).click();
  let data = await lastData(page);
  assert(!C.findCategory(data, 'c_default_1'), 'deleted'); eq(C.inbox(data).length, 5);
  await page.locator('#toast button').click();
  data = await lastData(page);
  assert(C.findCategory(data, 'c_default_1'), 'restored');
  await close();
});

await test('전체 탭 검색 + 태그 필터', async () => {
  const d = C.load(seeded());
  C.setTags(d, IDS[3], ['kpop']); C.setTags(d, IDS[4], ['kpop', '봄']);
  const { page, close } = await open(JSON.stringify(d));
  await page.evaluate(() => __bglib.openLibrary('all'));
  await page.fill('#search', 'bts');
  eq(await page.locator('#list [data-row]').count(), 2);
  await page.fill('#search', '');
  await page.locator('.filter .chip', { hasText: '#봄' }).click();
  eq(await page.locator('#list [data-row]').count(), 1);
  await close();
});

await test('back(): 시트 → 상세 → 닫기 순서', async () => {
  const { page, close } = await open(seeded());
  await page.evaluate(() => __bglib.openLibrary('categories'));
  await page.locator('[data-act="open-cat"]', { hasText: '운동' }).click();
  await page.getByRole('button', { name: '편집' }).click();
  eq(await page.evaluate(() => [__bglib.back(), !!__bglib._state().sheet, !!__bglib._state().cat]), [true, false, true]);
  eq(await page.evaluate(() => [__bglib.back(), !!__bglib._state().cat]), [true, false]);
  eq(await page.evaluate(() => [__bglib.back(), __bglib._state().mode, __bglib.back()]), [true, 'hidden', false]);
  assert((await out(page, 'close')).length === 1, 'close posted');
  await close();
});

await test('XSS: 제목/태그의 HTML은 그대로 문자로 표시', async () => {
  const { page, close } = await open();
  await page.evaluate(() => __bglib.quickSave({ url: 'https://m.youtube.com/watch?v=aaaaaaaaaa1', title: '<img src=x onerror="window.pwned=1">' }));
  await page.evaluate(() => __bglib.openLibrary('inbox'));
  eq(await page.evaluate(() => window.pwned), undefined);
  assert((await page.locator('.row .title').innerText()).includes('<img'), 'escaped text');
  await close();
});

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
