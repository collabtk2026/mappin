// 지도 매핑 검증 (실제 타일 + 실제 지오코딩). 서버(8080)와 웹(3000)이 MAP_STYLE=openfreemap으로 떠 있어야 한다.
// 실행: node scripts/verify-map.mjs   → e2e-artifacts/map-*.png
//
// 확인하는 것
//  1. 배경지도 스타일·타일·글꼴이 오류 없이 로드되는가
//  2. 라벨이 한국어 한 줄로 나오는가 (영문 병기 제거)
//  3. 알려진 장소의 핀 끝이 정확한 화면 좌표에 꽂히는가 (지도 투영과 비교, 허용 오차 1.5px)
//  4. 지도를 길게 누른(우클릭) 지점이 그대로 저장되는가 (허용 오차 ≈1m)
//  5. 역지오코딩 주소가 실제 행정구역과 맞는가
//  6. 장소 검색 결과로 저장하면 실제 위치에 저장되는가 (허용 오차 300m)
//  7. 다크 모드에서 다크 지도 스타일로 바뀌는가
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.WEB_URL ?? 'http://localhost:3000';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e-artifacts');
const RUN = Date.now().toString(36);
const USER = { email: `mapcheck-${RUN}@example.com`, password: 'correct-horse-1', name: '지도검증' };

// 좌표 기준: OpenStreetMap 노드/중심점 (WGS84)
const LANDMARKS = [
  { title: 'N서울타워', lat: 37.551169, lng: 126.988227, expect: /용산구|중구/ },
  { title: '광화문', lat: 37.575929, lng: 126.976849, expect: /종로구/ },
  { title: '서울숲', lat: 37.544386, lng: 127.037441, expect: /성동구/ },
  { title: '해운대해수욕장', lat: 35.158698, lng: 129.160384, expect: /해운대구/ },
];

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ ok: false, name });
    console.log(`  ✗ ${name}\n      ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const meters = (a, b) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function api(method, p, body, token) {
  const r = await fetch(`${BASE}/v1${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${t}`);
  return t ? JSON.parse(t) : undefined;
}

await mkdir(OUT, { recursive: true });
const signup = await api('POST', '/auth/signup', {
  email: USER.email, password: USER.password, display_name: USER.name,
  agreements: { terms: true, privacy: true, location: true, age_14_or_over: true }, client: { type: 'ios' },
});
const token = signup.access_token;
const saved = {};
for (const l of LANDMARKS) saved[l.title] = await api('POST', '/places', { title: l.title, location: { lat: l.lat, lng: l.lng }, icon_key: 'star' }, token);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
const page = await ctx.newPage();
const tileErrors = [];
const tileOk = { style: 0, tiles: 0, glyphs: 0, dark: 0 };
page.on('response', (r) => {
  const u = r.url();
  if (!u.includes('tiles.openfreemap.org')) return;
  if (r.status() >= 400) tileErrors.push(`${r.status()} ${u}`);
  else if (u.includes('/styles/')) (tileOk.style++, u.includes('/styles/dark') && tileOk.dark++);
  else if (u.includes('/fonts/')) tileOk.glyphs++;
  else if (/\.pbf$/.test(u) || u.includes('/planet/')) tileOk.tiles++;
});
// 스타일 전환·지도 이동 때 MapLibre가 취소한 요청(ERR_ABORTED)은 오류가 아니다
page.on('requestfailed', (r) => r.url().includes('tiles.openfreemap.org') && !/ABORTED/i.test(r.failure()?.errorText ?? '') && tileErrors.push(`failed ${r.failure()?.errorText} ${r.url()}`));

console.log(`\nMappin 지도 매핑 검증 — ${BASE}\n`);
await page.goto(`${BASE}/login`);
await page.getByLabel('이메일').fill(USER.email);
await page.getByLabel('비밀번호').fill(USER.password);
await page.getByRole('button', { name: '로그인' }).click();
await page.waitForURL(`${BASE}/`);
await page.goto(`${BASE}/?debug=map`);
await page.waitForFunction(() => !!window.__mappinMap?._map?.loaded?.(), null, { timeout: 30000 });
const idle = () => page.evaluate(() => new Promise((res) => { const m = window.__mappinMap._map; m.loaded() && !m.isMoving() ? setTimeout(res, 300) : m.once('idle', () => setTimeout(res, 300)); }));
await idle();

await check('배경지도 스타일·타일·글꼴 로드', async () => {
  const style = await page.evaluate(() => window.__mappinMap._map.getStyle().sprite?.toString().split('/').slice(-2).join('/'));
  assert(tileOk.style > 0 && tileOk.tiles > 0 && tileOk.glyphs > 0, `style ${tileOk.style}, tiles ${tileOk.tiles}, glyphs ${tileOk.glyphs}`);
  assert(tileErrors.length === 0, `실패한 요청 ${tileErrors.length}건: ${tileErrors[0]}`);
  return `스타일 positron (sprite ${style}), 타일 ${tileOk.tiles}개, 글꼴 ${tileOk.glyphs}개, 오류 0`;
});

await check('라벨 한국어 한 줄 표기', async () => {
  await page.evaluate(() => window.__mappinMap.setCamera({ center: { lat: 37.5446, lng: 127.0559 }, zoom: 15 }, { animate: false }));
  await idle();
  const labels = await page.evaluate(() => {
    const m = window.__mappinMap._map;
    const ids = m.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id);
    return m.queryRenderedFeatures({ layers: ids }).map((f) => f.layer.layout?.['text-field'] && (f.properties['name:ko'] ?? f.properties.name)).filter(Boolean);
  });
  const bilingual = await page.evaluate(() => {
    const m = window.__mappinMap._map;
    return m.getStyle().layers.filter((l) => l.type === 'symbol' && JSON.stringify(m.getLayoutProperty(l.id, 'text-field') ?? '').includes('concat')).length;
  });
  assert(bilingual === 0, `영문·한글 병기 레이어가 ${bilingual}개 남음`);
  assert(labels.length > 5, `보이는 라벨이 너무 적음 (${labels.length})`);
  const hangul = labels.filter((t) => /[가-힣]/.test(t)).length;
  assert(hangul / labels.length > 0.8, `한글 라벨 비율 ${hangul}/${labels.length}`);
  return `화면 라벨 ${labels.length}개 중 한글 ${hangul}개, 영문 병기 레이어 0개`;
});
await page.screenshot({ path: path.join(OUT, 'map-labels-ko.png') });

for (const l of LANDMARKS) {
  await check(`핀 위치 정확도: ${l.title}`, async () => {
    await page.evaluate((c) => window.__mappinMap.setCamera({ center: c, zoom: 16 }, { animate: false }), { lat: l.lat, lng: l.lng });
    await idle();
    const r = await page.evaluate((id) => {
      const el = document.querySelector(`.pin[data-place-id="${id}"]`);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const mapBox = document.querySelector('[data-testid="map"]').getBoundingClientRect();
      return { tipX: box.left + box.width / 2 - mapBox.left, tipY: box.bottom - mapBox.top };
    }, saved[l.title].id);
    assert(r, '핀이 화면에 없음');
    const exp = await page.evaluate((c) => window.__mappinMap.project(c), { lat: l.lat, lng: l.lng });
    const err = Math.hypot(r.tipX - exp.x, r.tipY - exp.y);
    assert(err <= 1.5, `핀 끝 오차 ${err.toFixed(2)}px`);
    return `핀 끝과 실제 좌표 차이 ${err.toFixed(2)}px (줌 16)`;
  });
}
await page.evaluate(() => window.__mappinMap.setCamera({ center: { lat: 37.544386, lng: 127.037441 }, zoom: 16 }, { animate: false }));
await idle();
await page.screenshot({ path: path.join(OUT, 'map-pin-seoulforest.png') });

await check('역지오코딩 주소 (실제 행정구역)', async () => {
  const lines = [];
  for (const l of LANDMARKS) {
    const p = await api('GET', `/places/${saved[l.title].id}`, null, token);
    const addr = p.address?.road ?? p.address?.jibun;
    assert(addr, `${l.title}: 주소 없음 (서버가 지오코딩 서버에 연결하지 못함)`);
    assert(l.expect.test(addr), `${l.title}: "${addr}"`);
    lines.push(`${l.title} → ${addr}`);
  }
  return '\n      ' + lines.join('\n      ');
});

let clicked;
await check('길게 누른(우클릭) 지점 그대로 저장', async () => {
  await page.evaluate(() => window.__mappinMap.setCamera({ center: { lat: 37.5446, lng: 127.0559 }, zoom: 17 }, { animate: false }));
  await idle();
  const mapBox = await page.getByTestId('map').boundingBox();
  const pt = { x: 1000, y: 380 };
  clicked = await page.evaluate((p) => window.__mappinMap.unproject(p), { x: pt.x - mapBox.x, y: pt.y - mapBox.y });
  await page.mouse.click(pt.x, pt.y, { button: 'right' });
  await page.getByLabel('장소 이름').fill('우클릭 지점');
  await idle();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByTestId('place-detail').getByRole('heading', { name: '우클릭 지점' }).waitFor();
  const list = await api('GET', '/places?q=' + encodeURIComponent('우클릭 지점'), null, token);
  const got = list.items[0];
  const d = meters(clicked, got);
  assert(d < 1, `오차 ${d.toFixed(2)}m`);
  return `누른 지점과 저장 좌표 차이 ${d.toFixed(2)}m`;
});

await check('장소 검색 → 저장 위치 (롯데월드타워)', async () => {
  await page.getByLabel('목록으로').click();
  await page.getByLabel('검색').fill('롯데월드타워');
  const row = page.locator('.section', { hasText: '새 장소 찾기' }).locator('.place-row').first();
  await row.waitFor({ timeout: 15000 });
  await row.click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByTestId('place-detail').waitFor();
  const list = await api('GET', '/places?q=' + encodeURIComponent('롯데월드'), null, token);
  assert(list.items.length, '저장된 장소가 없음');
  const d = meters({ lat: 37.51253, lng: 127.10252 }, list.items[0]);
  assert(d < 300, `실제 위치와 ${Math.round(d)}m 차이`);
  const p = await api('GET', `/places/${list.items[0].id}`, null, token);
  return `"${list.items[0].title}" 실제 위치와 ${Math.round(d)}m · 외부 참조 ${p.provider_refs.map((r) => `${r.provider}:${r.external_id}`).join(',')}`;
});
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, 'map-search-saved.png') });

await check('다크 모드 → 다크 지도 스타일', async () => {
  await page.getByLabel('계정 메뉴').click();
  await page.getByRole('menuitem', { name: '다크 모드' }).click();
  const lum = () =>
    page.evaluate(() => {
      const m = window.__mappinMap._map;
      const bg = m.getStyle().layers.find((l) => l.type === 'background');
      const c = String(m.getPaintProperty(bg.id, 'background-color') ?? '');
      const rgb = c.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
      const v = c.startsWith('hsl') ? rgb[2] / 100 : (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      return { c, v };
    });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  for (let i = 0; i < 30 && (await lum()).v > 0.4; i++) await page.waitForTimeout(500);
  await idle();
  const { c, v } = await lum();
  assert(tileOk.dark > 0, '다크 스타일 요청이 없음');
  assert(v < 0.4, `배경색이 어두워지지 않음 (${c})`);
  assert(tileErrors.length === 0, `실패한 타일 요청 ${tileErrors.length}건: ${tileErrors.join(' | ')}`);
  return `다크 스타일 로드, 배경색 ${c}`;
});
await page.screenshot({ path: path.join(OUT, 'map-dark.png') });

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과 · 스크린샷: ${OUT}/map-*.png`);
process.exit(failed ? 1 : 0);
