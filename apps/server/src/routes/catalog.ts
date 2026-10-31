import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.js';
import type { Config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { deeplinkFor } from '../lib/geo.js';
import { iconOf } from '../lib/places.js';
import { idList, parse, parseBBox, uuid } from '../lib/validate.js';

const KR_BBOX = [124.5, 33.0, 132.0, 38.9];
const OSM_ATTRIBUTION = '© OpenStreetMap contributors · © OpenFreeMap';

export function mapConfig(config: Config, platform: 'web' | 'ios' | 'android') {
  const maplibre =
    config.mapStyle === 'demo'
      ? {
          id: 'maplibre' as const,
          public_key: null,
          style_url: `${config.publicWebUrl}/demo-basemap/style-light.json`,
          style_url_dark: `${config.publicWebUrl}/demo-basemap/style-dark.json`,
          attribution: '데모 지도 · 통계청/행정안전부 경계 데이터',
          search_provider: 'osm' as const,
        }
      : {
          id: 'maplibre' as const,
          public_key: null,
          style_url: 'https://tiles.openfreemap.org/styles/positron',
          style_url_dark: 'https://tiles.openfreemap.org/styles/dark',
          attribution: OSM_ATTRIBUTION,
          search_provider: 'osm' as const,
        };
  const regions = [];
  // 국내는 Kakao (키가 있고 웹일 때). 모바일 네이티브 모듈은 P1
  if (config.kakaoJsKey && platform === 'web') {
    regions.push({
      name: 'KR',
      bbox: KR_BBOX,
      provider: { id: 'kakao' as const, public_key: config.kakaoJsKey, style_url: null, attribution: '© Kakao', search_provider: 'kakao' as const },
    });
  }
  return {
    default_provider: maplibre,
    regions,
    clustering: { server_threshold: 5000, radius_px: 60 },
    initial_camera: { center: { lat: 37.5446, lng: 127.0559 }, zoom: 12 },
  };
}

export function catalogRoutes(app: FastifyInstance, ctx: Ctx) {
  const { sql } = ctx;

  app.get('/icons', async (_req, reply) => {
    const rows = await sql<any[]>`SELECT key, group_key, label_ko AS label, svg_url FROM icons ORDER BY sort_order`;
    reply.header('cache-control', 'public, max-age=3600');
    return { version: '1', items: rows };
  });

  app.get('/map/config', async (req) => {
    const q = parse(z.object({ platform: z.enum(['web', 'ios', 'android']), app_version: z.string().optional() }), req.query);
    return mapConfig(ctx.config, q.platform);
  });

  /** 서버 클러스터: 줌별 격자(EPSG:3857)로 묶는다 */
  app.get('/map/clusters', async (req) => {
    const { userId } = await ctx.auth(req);
    const q = parse(
      z.object({
        bbox: z.string(),
        zoom: z.coerce.number().min(0).max(22),
        category_id: uuid.optional(),
        tag: idList.optional(),
        scope: z.enum(['own', 'shared', 'all']).default('own'),
        radius_px: z.coerce.number().int().min(10).max(200).default(60),
      }),
      req.query,
    );
    const b = parseBBox(q.bbox);
    const cell = (40075016.686 / 2 ** q.zoom / 256) * q.radius_px;
    const tags = q.tag ?? [];
    const rows = await sql<any[]>`
      WITH acc AS (
        SELECT id AS place_id FROM places WHERE ${q.scope !== 'shared' ? sql`owner_id = ${userId}` : sql`false`}
        UNION SELECT place_id FROM shared_places(${userId}) WHERE ${q.scope !== 'own' ? sql`true` : sql`false`}
      ), pts AS (
        SELECT p.id, p.title, p.updated_at, p.owner_id, p.icon_key, p.color, category_icon(c.id) AS cat_icon, category_color(c.id) AS cat_color,
               ST_Transform(p.location::geometry, 3857) AS g
          FROM acc JOIN places p ON p.id = acc.place_id
          LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
         WHERE p.deleted_at IS NULL
           AND ST_Intersects(p.location, ST_MakeEnvelope(${b[0]}, ${b[1]}, ${b[2]}, ${b[3]}, 4326)::geography)
           ${q.category_id ? sql`AND p.category_id IN (SELECT c2.id FROM categories c2 JOIN categories r ON r.id = ${q.category_id} WHERE c2.path <@ r.path)` : sql``}
           ${tags.length ? sql`AND EXISTS (SELECT 1 FROM place_tags pt WHERE pt.place_id = p.id AND pt.deleted_at IS NULL AND pt.tag_id = ANY(${tags}::uuid[]))` : sql``}
      )
      SELECT count(*)::int AS count,
             ST_Y(ST_Transform(ST_Centroid(ST_Collect(g)), 4326)) AS lat,
             ST_X(ST_Transform(ST_Centroid(ST_Collect(g)), 4326)) AS lng,
             (array_agg(id ORDER BY updated_at DESC))[1] AS id,
             (array_agg(title ORDER BY updated_at DESC))[1] AS title,
             (array_agg(owner_id ORDER BY updated_at DESC))[1] AS owner_id,
             (array_agg(icon_key ORDER BY updated_at DESC))[1] AS icon_key,
             (array_agg(color ORDER BY updated_at DESC))[1] AS color,
             (array_agg(cat_icon ORDER BY updated_at DESC))[1] AS cat_icon,
             (array_agg(cat_color ORDER BY updated_at DESC))[1] AS cat_color,
             (array_agg(updated_at ORDER BY updated_at DESC))[1] AS updated_at,
             ST_XMin(ST_Transform(ST_Envelope(ST_Collect(g)), 4326)) AS w, ST_YMin(ST_Transform(ST_Envelope(ST_Collect(g)), 4326)) AS s,
             ST_XMax(ST_Transform(ST_Envelope(ST_Collect(g)), 4326)) AS e, ST_YMax(ST_Transform(ST_Envelope(ST_Collect(g)), 4326)) AS n
        FROM pts GROUP BY ST_SnapToGrid(g, ${cell})`;
    const clusters = rows.filter((r) => r.count > 1);
    const singles = rows.filter((r) => r.count === 1);
    return {
      clusters: clusters.map((r, i) => ({
        id: `c${q.zoom}:${i}`,
        lat: r.lat,
        lng: r.lng,
        count: r.count,
        top_icon: iconOf(r),
        expansion_zoom: Math.min(q.zoom + 2, 20),
        bbox: [r.w, r.s, r.e, r.n],
      })),
      places: singles.map((r) => ({
        id: r.id,
        title: r.title,
        lat: r.lat,
        lng: r.lng,
        icon: iconOf(r),
        owner_id: r.owner_id,
        tag_ids: [],
        note_count: 0,
        updated_at: r.updated_at,
      })),
    };
  });

  app.get('/geo/search', async (req) => {
    const { userId } = await ctx.auth(req);
    const q = parse(
      z.object({ q: z.string().trim().min(1).max(100), near: z.string().optional(), page: z.coerce.number().int().min(1).max(3).default(1) }),
      req.query,
    );
    const near = q.near ? (([lat, lng]) => ({ lat: lat!, lng: lng! }))(q.near.split(',').map(Number)) : null;
    let result;
    try {
      result = await ctx.geo.search(q.q, near, q.page);
    } catch (e: any) {
      if (e?.status === 429) throw new HttpError(429, 'PROVIDER_QUOTA', '검색 사용량이 많아요. 잠시 후 다시 시도해 주세요');
      throw new HttpError(502, 'PROVIDER_UNAVAILABLE', '지도 검색 서비스에 연결할 수 없어요');
    }
    const saved = result.items.length
      ? await sql<{ provider: string; external_id: string; place_id: string }[]>`
          SELECT r.provider, r.external_id, r.place_id FROM provider_refs r JOIN places p ON p.id = r.place_id
           WHERE p.owner_id = ${userId} AND p.deleted_at IS NULL
             AND (r.provider || ':' || r.external_id) = ANY(${result.items.map((i) => `${i.provider}:${i.externalId}`)}::text[])`
      : [];
    return {
      provider: ctx.geo.id,
      attribution: ctx.geo.attribution,
      items: result.items.map((i) => ({
        provider_ref: { provider: i.provider, external_id: i.externalId },
        name: i.name,
        location: { lat: i.lat, lng: i.lng },
        address: i.address,
        category_label: i.categoryLabel,
        suggested_icon_key: suggestIcon(i.categoryLabel),
        distance_m: i.distanceM,
        already_saved_place_id: saved.find((s) => s.provider === i.provider && s.external_id === i.externalId)?.place_id ?? null,
      })),
      has_more: result.hasMore,
    };
  });

  app.get('/geo/reverse', async (req) => {
    await ctx.auth(req);
    const q = parse(z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), req.query);
    const a = await ctx.geo.reverse(q.lat, q.lng).catch(() => null);
    return a ?? { road: null, jibun: null, postal_code: null, region_1: null, region_2: null, region_3: null, country_code: null, source: 'user' };
  });

  app.get<{ Params: { provider: string; externalId: string } }>('/geo/provider-place/:provider/:externalId', async (req) => {
    await ctx.auth(req);
    const provider = parse(z.enum(['kakao', 'naver', 'google', 'osm']), req.params.provider);
    const link = deeplinkFor(provider, req.params.externalId);
    if (!link) throw new HttpError(404, 'NOT_FOUND', '장소를 찾을 수 없어요');
    // 상세 정보는 저장 금지 정책상 공급자 페이지로 연결 (P1: 실시간 상세 조회)
    return { provider, external_id: req.params.externalId, deeplink_url: link, attribution: provider === 'osm' ? '© OpenStreetMap contributors' : `© ${provider}` };
  });

}

/** 외부 카테고리 라벨 → 시스템 아이콘 제안 */
export function suggestIcon(label: string | null): string | null {
  if (!label) return null;
  const rules: [RegExp, string][] = [
    [/카페|cafe|coffee/i, 'cafe'],
    [/빵|베이커리|bakery/i, 'bakery'],
    [/술|바|pub|bar|wine/i, 'bar'],
    [/음식|식당|맛집|restaurant|food/i, 'food'],
    [/숙박|호텔|hotel|guest/i, 'hotel'],
    [/공원|park|nature|숲/i, 'nature'],
    [/해수욕|beach|바다/i, 'beach'],
    [/산|mountain|peak/i, 'mountain'],
    [/쇼핑|마트|백화점|shop|mall/i, 'shopping'],
    [/미술|전시|gallery|museum|art/i, 'art'],
    [/관광|문화|명소|attraction|tourism/i, 'culture'],
    [/병원|약국|hospital|clinic|pharmacy/i, 'health'],
    [/학교|school|university/i, 'school'],
    [/주차|parking/i, 'parking'],
  ];
  return rules.find(([re]) => re.test(label))?.[1] ?? null;
}
