import { describe, expect, it } from 'vitest';
import { nominatimAddress } from '../src/lib/geo.js';

describe('nominatimAddress', () => {
  it('builds Korean-order addresses from Nominatim parts (Seoul)', () => {
    // 실제 응답 (37.5444, 127.0374 — 서울숲)
    const a = nominatimAddress({ road: '서울숲 남산길', quarter: '성수동1가', suburb: '성수1가1동', borough: '성동구', city: '서울특별시', postcode: '04769', country_code: 'kr' });
    expect(a).toMatchObject({ road: '서울특별시 성동구 서울숲 남산길', jibun: '서울특별시 성동구 성수동1가', postal_code: '04769', region_1: '서울특별시', region_2: '성동구', country_code: 'KR', source: 'osm' });
  });
  it('keeps province and city for non-metropolitan areas', () => {
    const a = nominatimAddress({ road: '중앙로', house_number: '12', city: '수원시', borough: '팔달구', province: '경기도', country_code: 'kr' });
    expect(a.road).toBe('경기도 수원시 팔달구 중앙로 12');
  });
  it('returns null road when only area is known', () => {
    expect(nominatimAddress({ city: '서울특별시', borough: '중구' }).road).toBeNull();
  });
});
