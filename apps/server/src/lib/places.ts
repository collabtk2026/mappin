import type { Sql } from '../db.js';
import { forbidden, notFound } from './errors.js';

export type Permission = 'owner' | 'editor' | 'viewer';
type Tx = Sql;

export const DEFAULT_ICON = 'pin.default';
export const DEFAULT_COLOR = '#3366FF';

export interface PlaceAccess {
  permission: Permission;
  shareId: string | null;
  ownerId: string;
  version: number;
  deleted: boolean;
  categoryId: string | null;
}

export async function placeAccess(
  sql: Tx,
  uid: string,
  placeId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<PlaceAccess> {
  const [p] = await sql<{ owner_id: string; version: number; deleted_at: Date | null; category_id: string | null }[]>`
    SELECT owner_id, version, deleted_at, category_id FROM places WHERE id = ${placeId}`;
  if (!p) throw notFound('장소');
  const base = { ownerId: p.owner_id, version: p.version, deleted: !!p.deleted_at, categoryId: p.category_id };
  if (p.owner_id === uid) {
    if (p.deleted_at && !opts.includeDeleted) throw notFound('장소');
    return { ...base, permission: 'owner', shareId: null };
  }
  const [s] = await sql<{ share_id: string; permission: 'editor' | 'viewer' }[]>`
    SELECT share_id, permission FROM shared_places(${uid}) WHERE place_id = ${placeId}
     ORDER BY (permission = 'editor') DESC LIMIT 1`;
  if (!s) throw notFound('장소');
  return { ...base, permission: s.permission, shareId: s.share_id };
}

export function requireWrite(a: PlaceAccess) {
  if (a.permission === 'viewer') throw forbidden('보기 권한만 있어요');
}
export function requireOwner(a: PlaceAccess) {
  if (a.permission !== 'owner') throw forbidden('장소 주인만 할 수 있어요');
}

export async function addEvent(sql: Tx, placeId: string, actorId: string, type: string, data: object = {}) {
  await sql`INSERT INTO place_events (place_id, actor_id, type, data)
            VALUES (${placeId}, ${actorId}, ${type}, ${sql.json(data as never)})`;
}

export function iconOf(r: { icon_key: string | null; color: string | null; cat_icon: string | null; cat_color: string | null }) {
  const color = r.color ?? r.cat_color ?? DEFAULT_COLOR;
  if (r.icon_key) return { key: r.icon_key, color, source: 'place' as const };
  if (r.cat_icon) return { key: r.cat_icon, color, source: 'category' as const };
  return { key: DEFAULT_ICON, color, source: 'default' as const };
}

export const userPublic = (r: { id: string; display_name: string; handle: string | null; avatar_url: string | null }) => ({
  id: r.id,
  display_name: r.display_name,
  handle: r.handle,
  avatar_url: r.avatar_url,
});

export function noteJson(n: any) {
  return {
    id: n.id,
    place_id: n.place_id,
    author_id: n.author_id,
    author: n.author_name ? { id: n.author_id, display_name: n.author_name, handle: n.author_handle ?? null, avatar_url: n.author_avatar ?? null } : undefined,
    body: n.body,
    is_private: n.is_private,
    noted_at: n.noted_at,
    revision: n.revision,
    edited: n.revision > 1,
    attachments: [],
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

/** 장소 상세 (태그·카테고리 경로·외부 참조·최근 메모 포함). 비소유자에게는 비공개 메모 제외 */
export async function loadPlaces(
  sql: Tx,
  viewerId: string | null,
  ids: string[],
  access: Map<string, { permission: Permission; shareId: string | null }> = new Map(),
) {
  if (ids.length === 0) return [];
  const rows = await sql<any[]>`
    SELECT p.id, p.owner_id, p.category_id, p.title,
           ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng,
           p.accuracy_m, p.altitude_m, p.address_road, p.address_jibun, p.address_detail, p.address_source,
           p.address_postal_code, p.country_code, p.icon_key, p.color, p.rating, p.visited_at, p.source,
           p.version, p.created_at, p.updated_at, p.deleted_at,
           category_icon(c.id) AS cat_icon, category_color(c.id) AS cat_color, c.path::text AS cat_path,
           u.display_name AS owner_name, u.handle AS owner_handle, u.avatar_url AS owner_avatar
      FROM places p
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
     WHERE p.id = ANY(${ids}::uuid[])`;
  const tags = await sql<any[]>`
    SELECT pt.place_id, pt.tag_id, t.name, t.color, pt.tagged_at, pt.tagged_by
      FROM place_tags pt JOIN tags t ON t.id = pt.tag_id AND t.deleted_at IS NULL
     WHERE pt.place_id = ANY(${ids}::uuid[]) AND pt.deleted_at IS NULL
     ORDER BY pt.tagged_at`;
  const refs = await sql<any[]>`SELECT place_id, provider, external_id FROM provider_refs WHERE place_id = ANY(${ids}::uuid[])`;
  const notes = await sql<any[]>`
    SELECT * FROM (
      SELECT n.*, u.display_name AS author_name, u.handle AS author_handle, u.avatar_url AS author_avatar,
             row_number() OVER (PARTITION BY n.place_id ORDER BY n.noted_at DESC, n.id DESC) AS rn,
             count(*) OVER (PARTITION BY n.place_id) AS cnt
        FROM notes n JOIN places p ON p.id = n.place_id JOIN users u ON u.id = n.author_id
       WHERE n.place_id = ANY(${ids}::uuid[]) AND n.deleted_at IS NULL
         AND (NOT n.is_private OR p.owner_id = ${viewerId} OR n.author_id = ${viewerId})
    ) x WHERE rn <= 3`;
  const catPaths = rows.map((r) => r.cat_path).filter(Boolean) as string[];
  const crumbs = catPaths.length
    ? await sql<any[]>`
        SELECT c.id, c.name, c.path::text AS path, nlevel(c.path) AS depth
          FROM categories c
         WHERE c.path @> ANY(${catPaths}::text[]::ltree[]) AND c.deleted_at IS NULL
         ORDER BY nlevel(c.path)`
    : [];

  const byId = new Map(
    rows.map((r) => {
      const a = access.get(r.id) ?? { permission: r.owner_id === viewerId ? 'owner' : 'viewer', shareId: null };
      const placeNotes = notes.filter((n) => n.place_id === r.id);
      return [
        r.id,
        {
          id: r.id,
          owner_id: r.owner_id,
          owner: userPublic({ id: r.owner_id, display_name: r.owner_name, handle: r.owner_handle, avatar_url: r.owner_avatar }),
          title: r.title,
          location: { lat: r.lat, lng: r.lng },
          accuracy_m: r.accuracy_m,
          altitude_m: r.altitude_m,
          address: {
            road: r.address_road,
            jibun: r.address_jibun,
            postal_code: r.address_postal_code,
            region_1: null,
            region_2: null,
            region_3: null,
            country_code: r.country_code,
            source: r.address_source ?? 'user',
          },
          address_detail: r.address_detail,
          icon_key: r.icon_key,
          color: r.color,
          icon: iconOf(r),
          category_id: r.cat_path ? r.category_id : null,
          category_path: r.cat_path
            ? crumbs.filter((c) => r.cat_path === c.path || r.cat_path.startsWith(c.path + '.')).map((c) => ({ id: c.id, name: c.name }))
            : [],
          tags: tags
            .filter((t) => t.place_id === r.id)
            .map((t) => ({ tag_id: t.tag_id, name: t.name, color: t.color, tagged_at: t.tagged_at, tagged_by: t.tagged_by })),
          rating: r.rating,
          visited_at: r.visited_at,
          source: r.source,
          provider_refs: refs.filter((x) => x.place_id === r.id).map((x) => ({ provider: x.provider, external_id: x.external_id })),
          recent_notes: placeNotes.map(noteJson),
          note_count: Number(placeNotes[0]?.cnt ?? 0),
          permission: a.permission,
          via_share_id: a.shareId,
          version: r.version,
          created_at: r.created_at,
          updated_at: r.updated_at,
          deleted_at: r.deleted_at,
        },
      ];
    }),
  );
  return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
}

export async function loadPlace(sql: Tx, viewerId: string, id: string, a: PlaceAccess) {
  const [p] = await loadPlaces(sql, viewerId, [id], new Map([[id, { permission: a.permission, shareId: a.shareId }]]));
  if (!p) throw notFound('장소');
  return p;
}
