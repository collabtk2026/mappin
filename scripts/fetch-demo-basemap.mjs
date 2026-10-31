// 오프라인/제한 네트워크 환경용 데모 배경지도: 서울 자치구·행정동 + 전국 시도 경계 (공공 통계 데이터, southkorea/*-maps)
// 실행: pnpm demo:basemap  → apps/web/public/demo-basemap/ 생성 (git 제외)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/public/demo-basemap');
const SRC = {
  'provinces.json': 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_provinces_geo_simple.json',
  'seoul-gu.json': 'https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo_simple.json',
  'seoul-dong.json': 'https://raw.githubusercontent.com/southkorea/seoul-maps/master/juso/2015/json/seoul_neighborhoods_geo_simple.json',
};

function style(theme) {
  const c =
    theme === 'dark'
      ? { bg: '#0F1216', land: '#171B21', gu: '#1C2129', dongLine: '#252B34', guLine: '#323A46', prov: '#2A313B', water: '#0B0E12' }
      : { bg: '#E9ECEF', land: '#F4F5F7', gu: '#F7F8FA', dongLine: '#E4E7EB', guLine: '#CDD3DA', prov: '#D5DAE0', water: '#DCE3EA' };
  return {
    version: 8,
    name: `mappin-demo-${theme}`,
    sources: {
      provinces: { type: 'geojson', data: '/demo-basemap/provinces.json' },
      gu: { type: 'geojson', data: '/demo-basemap/seoul-gu.json' },
      dong: { type: 'geojson', data: '/demo-basemap/seoul-dong.json' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.water } },
      { id: 'province-fill', type: 'fill', source: 'provinces', paint: { 'fill-color': c.land } },
      { id: 'province-line', type: 'line', source: 'provinces', paint: { 'line-color': c.prov, 'line-width': 1 } },
      { id: 'gu-fill', type: 'fill', source: 'gu', paint: { 'fill-color': c.gu } },
      { id: 'dong-line', type: 'line', source: 'dong', minzoom: 11, paint: { 'line-color': c.dongLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 15, 1.2] } },
      { id: 'gu-line', type: 'line', source: 'gu', paint: { 'line-color': c.guLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 2] } },
    ],
  };
}

await mkdir(out, { recursive: true });
for (const [name, url] of Object.entries(SRC)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  await writeFile(path.join(out, name), await res.text());
  console.log('saved', name);
}
await writeFile(path.join(out, 'style-light.json'), JSON.stringify(style('light')));
await writeFile(path.join(out, 'style-dark.json'), JSON.stringify(style('dark')));
console.log('demo basemap ready →', out);
