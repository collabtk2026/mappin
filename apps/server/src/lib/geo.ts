/**
 * 외부 지오 공급자 어댑터. 응답은 저장하지 않는다 (docs/02 §4).
 * - Kakao Local (KAKAO_REST_KEY 설정 시, 국내 기본)
 * - Nominatim (OSM, 키 없음 — 개발/해외 폴백. 운영 트래픽은 자체 호스팅 필요)
 */
export interface GeoCandidate {
  provider: 'kakao' | 'naver' | 'google' | 'osm';
  externalId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  categoryLabel: string | null;
  distanceM: number | null;
}
export interface GeoAddress {
  road: string | null;
  jibun: string | null;
  postal_code: string | null;
  region_1: string | null;
  region_2: string | null;
  region_3: string | null;
  country_code: string | null;
  source: 'juso' | 'vworld' | 'kakao' | 'naver' | 'google' | 'osm' | 'user';
}
export interface GeoProvider {
  id: 'kakao' | 'osm' | 'none';
  attribution: string;
  search(q: string, near: { lat: number; lng: number } | null, page: number): Promise<{ items: GeoCandidate[]; hasMore: boolean }>;
  reverse(lat: number, lng: number): Promise<GeoAddress | null>;
}

const TIMEOUT = 4000;

export class KakaoGeo implements GeoProvider {
  id = 'kakao' as const;
  attribution = '© Kakao';
  constructor(private restKey: string, private fetchImpl: typeof fetch = fetch) {}
  private async get(path: string, params: Record<string, string>) {
    const url = `https://dapi.kakao.com${path}?${new URLSearchParams(params)}`;
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `KakaoAK ${this.restKey}` },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status === 429) throw Object.assign(new Error('quota'), { status: 429 });
    if (!res.ok) throw new Error(`kakao ${res.status}`);
    return res.json() as Promise<any>;
  }
  async search(q: string, near: { lat: number; lng: number } | null, page: number) {
    const params: Record<string, string> = { query: q, page: String(page), size: '15' };
    if (near) Object.assign(params, { x: String(near.lng), y: String(near.lat), sort: 'accuracy' });
    const body = await this.get('/v2/local/search/keyword.json', params);
    return {
      items: (body.documents as any[]).map((d) => ({
        provider: 'kakao' as const,
        externalId: String(d.id),
        name: d.place_name,
        lat: Number(d.y),
        lng: Number(d.x),
        address: d.road_address_name || d.address_name || null,
        categoryLabel: d.category_group_name || d.category_name || null,
        distanceM: d.distance ? Number(d.distance) : null,
      })),
      hasMore: body.meta?.is_end === false,
    };
  }
  async reverse(lat: number, lng: number): Promise<GeoAddress | null> {
    const body = await this.get('/v2/local/geo/coord2address.json', { x: String(lng), y: String(lat) });
    const d = body.documents?.[0];
    if (!d) return null;
    return {
      road: d.road_address?.address_name ?? null,
      jibun: d.address?.address_name ?? null,
      postal_code: d.road_address?.zone_no ?? null,
      region_1: d.address?.region_1depth_name ?? null,
      region_2: d.address?.region_2depth_name ?? null,
      region_3: d.address?.region_3depth_name ?? null,
      country_code: 'KR',
      source: 'kakao',
    };
  }
}

export class NominatimGeo implements GeoProvider {
  id = 'osm' as const;
  attribution = '© OpenStreetMap contributors';
  constructor(private base = 'https://nominatim.openstreetmap.org', private fetchImpl: typeof fetch = fetch) {}
  private async get(path: string, params: Record<string, string>) {
    const res = await this.fetchImpl(`${this.base}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`, {
      headers: { 'User-Agent': 'mappin/0.1 (dev)', 'Accept-Language': 'ko,en' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    return res.json() as Promise<any>;
  }
  async search(q: string, near: { lat: number; lng: number } | null, page: number) {
    const params: Record<string, string> = { q, limit: '15', addressdetails: '1' };
    if (near) {
      const d = 0.3;
      params.viewbox = `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
    }
    if (page > 1) return { items: [], hasMore: false };
    const rows = (await this.get('/search', params)) as any[];
    return {
      items: rows.map((r) => ({
        provider: 'osm' as const,
        externalId: `${r.osm_type?.[0] ?? 'N'}${r.osm_id}`,
        name: r.name || String(r.display_name).split(',')[0],
        lat: Number(r.lat),
        lng: Number(r.lon),
        address: r.display_name ?? null,
        categoryLabel: r.type ?? null,
        distanceM: null,
      })),
      hasMore: false,
    };
  }
  async reverse(lat: number, lng: number): Promise<GeoAddress | null> {
    const r = await this.get('/reverse', { lat: String(lat), lon: String(lng), addressdetails: '1' });
    if (!r?.address) return null;
    const a = r.address;
    return {
      road: r.display_name ?? null,
      jibun: null,
      postal_code: a.postcode ?? null,
      region_1: a.state ?? a.city ?? null,
      region_2: a.city_district ?? a.borough ?? a.county ?? null,
      region_3: a.quarter ?? a.suburb ?? a.neighbourhood ?? null,
      country_code: a.country_code ? String(a.country_code).toUpperCase() : null,
      source: 'osm',
    };
  }
}

export function deeplinkFor(provider: string, externalId: string): string | null {
  switch (provider) {
    case 'kakao':
      return `https://place.map.kakao.com/${encodeURIComponent(externalId)}`;
    case 'naver':
      return `https://map.naver.com/p/entry/place/${encodeURIComponent(externalId)}`;
    case 'google':
      return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(externalId)}`;
    case 'osm': {
      const m = /^([NWR])(\d+)$/.exec(externalId);
      if (!m) return null;
      const t = { N: 'node', W: 'way', R: 'relation' }[m[1] as 'N' | 'W' | 'R'];
      return `https://www.openstreetmap.org/${t}/${m[2]}`;
    }
    default:
      return null;
  }
}
