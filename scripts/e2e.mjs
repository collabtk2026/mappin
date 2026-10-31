// Mappin 웹 E2E (Playwright). 서버(8080)와 웹(3000)이 떠 있어야 한다.
// 실행: node scripts/e2e.mjs   → e2e-artifacts/*.png
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.WEB_URL ?? 'http://localhost:3000';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e-artifacts');
const RUN = Date.now().toString(36);
const OWNER = { email: `owner-${RUN}@example.com`, password: 'correct-horse-1', name: '하늘' };
const FRIEND = { email: `friend-${RUN}@example.com`, password: 'correct-horse-1', name: '바다' };

let step = 0;
const results = [];
async function check(name, fn) {
  step++;
  const t = Date.now();
  try {
    await fn();
    results.push({ ok: true, name });
    console.log(`  ✓ ${step}. ${name} (${Date.now() - t}ms)`);
  } catch (e) {
    results.push({ ok: false, name, error: String(e?.message ?? e).split('\n')[0] });
    console.log(`  ✗ ${step}. ${name}\n      ${String(e?.message ?? e).split('\n').slice(0, 3).join('\n      ')}`);
  }
}
const assert = (c, msg) => {
  if (!c) throw new Error(msg);
};

/** 앱 바깥(API 직접)에서 데이터 시드: 모바일 클라이언트처럼 토큰으로 호출 */
async function apiLogin(u) {
  const r = await fetch(`${BASE}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.password, client: { type: 'ios' } }) });
  const body = await r.json();
  const token = body.access_token;
  const call = async (method, p, b) => {
    const res = await fetch(`${BASE}/v1${p}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text}`);
    return text ? JSON.parse(text) : undefined;
  };
  return { call, user: body.user };
}

function watchErrors(page, bag) {
  page.on('pageerror', (e) => bag.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // 외부 지도 검색이 이 환경에서 차단된 경우(502)는 예상된 실패
    if (/502|Bad Gateway/.test(t)) return;
    bag.push(`console: ${t}`);
  });
}

async function signupUI(page, u) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('이름').fill(u.name);
  await page.getByLabel('이메일').fill(u.email);
  await page.getByLabel('비밀번호').fill(u.password);
  await page.getByText('모두 동의').click();
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await page.waitForURL(`${BASE}/`);
  await page.getByTestId('map').locator('canvas').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];

console.log(`\nMappin E2E — ${BASE}\n`);
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR', colorScheme: 'light', geolocation: { latitude: 37.5446, longitude: 127.0559 }, permissions: ['geolocation'] });
const page = await desktop.newPage();
watchErrors(page, errors);

await check('로그인 페이지 렌더링', async () => {
  await page.goto(`${BASE}/`);
  await page.waitForURL(`${BASE}/login`);
  await page.getByRole('button', { name: '로그인' }).waitFor();
  await shot(page, '01-login');
});

await check('필수 약관 미동의 시 가입 차단', async () => {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('이름').fill('x');
  await page.getByLabel('이메일').fill(`x-${RUN}@example.com`);
  await page.getByLabel('비밀번호').fill('correct-horse-1');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await page.getByRole('alert').filter({ hasText: '필수 약관' }).waitFor();
});

await check('회원가입 → 빈 지도 화면', async () => {
  await signupUI(page, OWNER);
  await page.getByText('아직 저장한 장소가 없어요').waitFor();
  await shot(page, '02-empty-map');
});

await check('카테고리 만들기 (맛집 › 성수, 아이콘·색)', async () => {
  await page.getByRole('tab', { name: '카테고리' }).click();
  await page.getByRole('button', { name: '새 카테고리' }).click();
  await page.getByLabel('이름').fill('맛집');
  await page.getByRole('button', { name: '음식점' }).click();
  await page.getByRole('button', { name: '#E4572E' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '저장' }).click();
  await page.getByTestId('category-tree').getByText('맛집').waitFor();
  await page.getByRole('button', { name: '맛집에 하위 카테고리' }).click({ force: true });
  await page.getByLabel('이름').fill('성수');
  await page.getByRole('dialog').getByRole('button', { name: '저장' }).click();
  await page.getByTestId('category-tree').getByText('성수').waitFor();
});

await check('지도 우클릭(길게 누르기)으로 장소 저장 — 태그·첫 메모', async () => {
  await page.getByRole('tab', { name: '장소' }).click();
  await page.mouse.click(900, 460, { button: 'right' });
  await page.getByLabel('장소 이름').fill('성수 라멘');
  await page.getByLabel('카테고리').selectOption({ label: ' 성수' });
  const tag = page.getByLabel('태그', { exact: true });
  await tag.fill('데이트');
  await tag.press('Enter');
  await tag.fill('웨이팅');
  await tag.press('Enter');
  await page.getByLabel('첫 메모').fill('첫 방문. 국물이 진하고 차슈가 두툼하다');
  await shot(page, '03-create-form');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const detail = page.getByTestId('place-detail');
  await detail.getByRole('heading', { name: '성수 라멘' }).waitFor();
  await detail.locator('.chip', { hasText: '#데이트' }).waitFor();
  await detail.getByText('첫 방문. 국물이 진하고').waitFor();
  assert(await detail.locator('.breadcrumb').innerText().then((t) => t.includes('맛집') && t.includes('성수')), '카테고리 경로가 보여야 함');
});

const owner = await apiLogin(OWNER);
await check('시드 데이터 (API: 카테고리·장소 12곳)', async () => {
  const cats = await owner.call('GET', '/categories?format=flat');
  const food = cats.items.find((c) => c.name === '맛집').id;
  const seongsu = cats.items.find((c) => c.name === '성수').id;
  const cafe = (await owner.call('POST', '/categories', { name: '카페', icon_key: 'cafe', color: '#9C6B4E' })).id;
  const walk = (await owner.call('POST', '/categories', { name: '산책', icon_key: 'nature', color: '#2E9F6B' })).id;
  const art = (await owner.call('POST', '/categories', { name: '전시', icon_key: 'art', color: '#7B61FF' })).id;
  const seed = [
    ['어니언 성수', 37.5447, 127.0581, cafe, ['데이트'], '붉은 벽돌 공장 카페. 빵이 맛있다'],
    ['대림창고', 37.5419, 127.0566, cafe, ['사진'], null],
    ['서울숲', 37.5444, 127.0374, walk, ['산책', '데이트'], '은행나무길이 예쁜 계절에 다시'],
    ['뚝섬 한강공원', 37.5297, 127.0669, walk, ['산책'], null],
    ['성수 쭈꾸미', 37.5463, 127.0532, seongsu, ['웨이팅'], '저녁 7시엔 30분 대기'],
    ['을지로 노가리골목', 37.5664, 126.9915, food, ['술'], null],
    ['광장시장 빈대떡', 37.5701, 126.9996, food, ['데이트'], '녹두빈대떡 + 막걸리'],
    ['리움미술관', 37.5384, 126.9990, art, ['전시'], null],
    ['국립현대미술관 서울', 37.5787, 126.9800, art, ['전시', '데이트'], '주말 오전이 한산'],
    ['남산 산책로', 37.5512, 126.9882, walk, ['산책'], null],
    ['연남동 카페거리', 37.5627, 126.9255, cafe, [], null],
    ['성수 수제버거', 37.5431, 127.0548, seongsu, [], null],
  ];
  for (const [title, lat, lng, category_id, new_tags, note] of seed) {
    await owner.call('POST', '/places', { title, location: { lat, lng }, category_id, new_tags, first_note: note ? { body: note } : undefined });
  }
  await page.reload();
  await page.getByTestId('place-list').waitFor();
  const n = await page.getByTestId('place-list').locator('.place-row').count();
  assert(n === 13, `13곳이어야 함 (실제 ${n})`);
});

await check('지도 마커·클러스터 렌더링', async () => {
  await page.getByRole('button', { name: '축소' }).click();
  await page.waitForTimeout(900);
  const pins = await page.locator('.pin').count();
  const clusters = await page.locator('.cluster').count();
  assert(pins + clusters > 3, `마커가 보여야 함 (pin ${pins}, cluster ${clusters})`);
  await shot(page, '04-map-list');
});

await check('카테고리 칩 필터 (하위 포함)', async () => {
  await page.getByRole('group', { name: '카테고리 필터' }).getByRole('button', { name: /^맛집/ }).click();
  await page.waitForTimeout(500);
  const n = await page.getByTestId('place-list').locator('.place-row').count();
  assert(n === 5, `맛집(하위 포함) 5곳 (실제 ${n})`);
  await page.getByRole('group', { name: '카테고리 필터' }).getByRole('button', { name: '전체' }).click();
});

await check('태그 칩 필터', async () => {
  await page.getByRole('group', { name: '태그 필터' }).getByRole('button', { name: '#데이트' }).click();
  await page.waitForTimeout(500);
  const n = await page.getByTestId('place-list').locator('.place-row').count();
  assert(n === 5, `#데이트 5곳 (실제 ${n})`);
  await page.getByRole('group', { name: '태그 필터' }).getByRole('button', { name: '#데이트' }).click();
});

await check('검색: 메모 내용으로 내 장소 찾기', async () => {
  await page.getByLabel('검색').fill('빈대떡');
  await page.waitForTimeout(700);
  const rows = page.getByTestId('place-list').locator('.place-row');
  assert((await rows.count()) === 1, '검색 결과 1곳');
  assert((await rows.first().innerText()).includes('광장시장'), '광장시장이어야 함');
  await page.getByLabel('검색어 지우기').click();
});

await check('메모 추가 → 수정 → 수정 이력', async () => {
  await page.getByTestId('place-list').getByText('성수 라멘').click();
  const d = page.getByTestId('place-detail');
  await d.getByLabel('새 메모').fill('재방문: 웨이팅 30분');
  await d.getByRole('button', { name: '남기기' }).click();
  await d.getByText('재방문: 웨이팅 30분').waitFor();
  await d.locator('.tl-item.note', { hasText: '재방문' }).getByRole('button', { name: '편집' }).click();
  await d.getByLabel('메모 수정').fill('재방문: 웨이팅 40분, 그래도 맛있다');
  await d.getByRole('button', { name: '저장' }).click();
  await d.getByText('재방문: 웨이팅 40분, 그래도 맛있다').waitFor();
  await d.getByLabel('수정 이력 보기').click();
  const dlg = page.getByRole('dialog', { name: '메모 수정 이력' });
  await dlg.getByText('재방문: 웨이팅 30분').waitFor();
  await shot(page, '05-revisions');
  await dlg.getByLabel('닫기').click();
  await d.getByLabel('나만 보기').check();
  await d.getByLabel('새 메모').fill('비밀: 사장님이 단골에겐 계란 서비스');
  await d.getByRole('button', { name: '남기기' }).click();
  await d.getByText('비밀: 사장님이').waitFor();
  const tl = await d.getByTestId('timeline').innerText();
  assert(tl.includes('#데이트 태그를 붙였어요') && tl.includes('장소를 저장했어요'), '타임라인에 이벤트가 보여야 함');
  await shot(page, '06-detail-timeline');
});

await check('장소 수정 (아이콘·색 변경)', async () => {
  const d = page.getByTestId('place-detail');
  await d.getByRole('button', { name: '수정', exact: true }).click();
  await page.getByRole('button', { name: '하트' }).click();
  await page.getByRole('button', { name: '#E5487D' }).click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await d.getByText('아이콘을 바꿨어요').waitFor();
  assert(!(await d.getByTestId('timeline').innerText()).includes('정보를 수정했어요'), '바뀌지 않은 필드로 수정 이벤트가 생기면 안 됨');
});

let shareLink = '';
await check('카테고리 링크 공유 생성', async () => {
  await page.getByLabel('목록으로').click();
  await page.getByRole('tab', { name: '카테고리' }).click();
  await page.getByRole('button', { name: '맛집 공유' }).click({ force: true });
  await page.getByRole('button', { name: '링크 만들기' }).click();
  shareLink = await page.getByTestId('share-link').inputValue();
  assert(/\/s\/[\w-]{20,}$/.test(shareLink), `링크 형식 ${shareLink}`);
});

await check('친구에게 이메일 공유', async () => {
  await page.getByLabel('이메일로 초대').fill(FRIEND.email);
  await page.getByRole('button', { name: '초대하기' }).click();
  await page.getByText('공유 중인 사람').waitFor();
  await shot(page, '07-share-dialog');
  await page.getByRole('dialog').getByLabel('닫기').click();
});

await check('공유 링크: 로그인 없이 읽기 전용 열람, 비공개 메모 숨김', async () => {
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  const p = await anon.newPage();
  watchErrors(p, errors);
  await p.goto(shareLink);
  await p.getByTestId('share-title').filter({ hasText: '맛집' }).waitFor();
  assert((await p.title()).includes('하늘님의 맛집'), `OG 제목 ${await p.title()}`);
  await p.waitForTimeout(1000);
  await shot(p, '08-shared-link');
  await p.getByText('성수 라멘').click();
  await p.getByText('재방문: 웨이팅 40분').waitFor();
  assert(!(await p.content()).includes('계란 서비스'), '비공개 메모가 보이면 안 됨');
  await anon.close();
});

await check('친구: 가입 → 받은 공유 수락 → 공유 레이어 표시', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  const p = await ctx.newPage();
  watchErrors(p, errors);
  await signupUI(p, FRIEND);
  await p.getByRole('tab', { name: /공유/ }).click();
  await p.getByTestId('pending-share').getByText('하늘님이').waitFor();
  await p.getByRole('button', { name: '지도에 추가' }).click();
  await p.getByText('받은 레이어').waitFor();
  await p.getByRole('tab', { name: '장소' }).click();
  await p.getByTestId('place-list').waitFor();
  const n = await p.getByTestId('place-list').locator('.place-row').count();
  assert(n === 5, `공유받은 맛집 5곳 (실제 ${n})`);
  await p.getByTestId('place-list').getByText('성수 라멘').click();
  await p.getByText('보기 전용').waitFor();
  assert(!(await p.content()).includes('계란 서비스'), '친구에게 비공개 메모가 보이면 안 됨');
  await p.getByRole('button', { name: '내 장소로' }).waitFor();
  await shot(p, '09-friend-shared-layer');
  await ctx.close();
});

await check('다크 모드', async () => {
  await page.getByRole('tab', { name: '장소' }).click();
  await page.getByLabel('계정 메뉴').click();
  await page.getByRole('menuitem', { name: '다크 모드' }).click();
  await page.keyboard.press('Escape');
  await page.mouse.click(1100, 120);
  await page.waitForTimeout(1200);
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'data-theme=dark');
  await shot(page, '10-dark');
  await page.getByLabel('계정 메뉴').click();
  await page.getByRole('menuitem', { name: '라이트 모드' }).click();
});

await check('모바일: 바텀시트 목록·상세', async () => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  const p = await m.newPage();
  watchErrors(p, errors);
  await p.goto(`${BASE}/login`);
  await p.getByLabel('이메일').fill(OWNER.email);
  await p.getByLabel('비밀번호').fill(OWNER.password);
  await p.getByRole('button', { name: '로그인' }).click();
  await p.waitForURL(`${BASE}/`);
  await p.getByTestId('sheet').waitFor();
  await p.getByTestId('place-list').waitFor();
  await p.waitForTimeout(900);
  await shot(p, '11-mobile-list');
  await p.getByTestId('place-list').getByText('성수 라멘').tap();
  await p.getByTestId('place-detail').getByRole('heading', { name: '성수 라멘' }).waitFor();
  await p.waitForTimeout(600);
  await shot(p, '12-mobile-detail');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, '가로 스크롤이 생기면 안 됨');
  await m.close();
});

await check('내보내기 (GeoJSON)', async () => {
  const job = await owner.call('POST', '/export', { format: 'geojson' });
  const res = await fetch(`${BASE}${job.result_url}`, { headers: { authorization: (await (async () => '')()) } });
  assert(res.status === 401, '토큰 없이 다운로드 불가');
});

await check('로그아웃 → 로그인 화면', async () => {
  await page.getByLabel('계정 메뉴').click();
  await page.getByRole('menuitem', { name: '로그아웃' }).click();
  await page.waitForURL(`${BASE}/login`);
  await page.reload();
  await page.waitForURL(`${BASE}/login`);
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n결과: ${results.length - failed.length}/${results.length} 통과`);
if (errors.length) {
  console.log(`브라우저 오류 ${errors.length}건:`);
  [...new Set(errors)].slice(0, 10).forEach((e) => console.log('  - ' + e.slice(0, 200)));
}
console.log(`스크린샷: ${OUT}`);
process.exit(failed.length || errors.length ? 1 : 0);
