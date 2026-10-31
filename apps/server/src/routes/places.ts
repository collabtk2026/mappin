import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { idempotent, type Ctx } from '../app.js';
import type { Sql } from '../db.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { HttpError, notFound, preconditionFailed } from '../lib/errors.js';
import type { GeoAddress } from '../lib/geo.js';
import { newId } from '../lib/ids.js';
import { addEvent, iconOf, loadPlace, noteJson, placeAccess, requireOwner, requireWrite, userPublic } from '../lib/places.js';
import { boolish, hexColor, idList, isoDate, latLng, parse, parseBBox, parseNear, uuid } from '../lib/validate.js';

type Tx = Sql;

const providerRef = z.object({ provider: z.enum(['kakao', 'naver', 'google', 'osm']), external_id: z.string().min(1).max(200) });
const noteCreate = z.object({
  id: uuid.optional(),
  body: z.string().trim().min(1).max(10000),
  is_private: z.boolean().default(false),
  noted_at: isoDate.optional(),
});
const placeCreate = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(100),
  location: latLng,
  accuracy_m: z.number().min(0).optional(),
  altitude_m: z.number().optional(),
  address_detail: z.string().max(200).optional(),
  resolve_address: z.boolean().default(true),
  icon_key: z.string().max(40).optional(),
  color: hexColor.optional(),
  category_id: uuid.nullable().optional(),
  tag_ids: z.array(uuid).max(30).default([]),
  new_tags: z.array(z.string().trim().min(1).max(30)).max(30).default([]),
  rating: z.number().int().min(1).max(5).optional(),
  visited_at: isoDate.optional(),
  source: z.enum(['manual', 'search', 'current_location', 'import']).default('manual'),
  provider_ref: providerRef.optional(),
  first_note: noteCreate.optional(),
});
const placeUpdate = z
  .object({
    title: z.string().trim().min(1).max(100),
    location: latLng,
    accuracy_m: z.number().min(0).nullable(),
    address_detail: z.string().max(200).nullable(),
    resolve_address: z.boolean(),
    icon_key: z.string().max(40).nullable(),
    color: hexColor.nullable(),
    category_id: uuid.nullable(),
    rating: z.number().int().min(1).max(5).nullable(),
    visited_at: isoDate.nullable(),
  })
  .partial();

export function requireIfMatch(req: FastifyRequest): number {
  const h = req.headers['if-match'];
  if (typeof h !== 'string') throw new HttpError(428, 'IF_MATCH_REQUIRED', 'If-Match 헤더가 필요해요');
  const v = Number(h.replace(/^W\//, '').replaceAll('"', ''));
  if (!Number.isInteger(v)) throw new HttpError(400, 'BAD_IF_MATCH', 'If-Match 형식이 잘못됐어요');
  return v;
}

async function safeReverse(ctx: Ctx, lat: number, lng: number): Promise<GeoAddress | null> {
  try {
    return await ctx.geo.reverse(lat, lng);
  } catch {
    return null;
  }
}

async function assertOwnCategory(tx: Tx | Sql, ownerId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const [c] = await tx`SELECT 1 FROM categories WHERE id = ${categoryId} AND owner_id = ${ownerId} AND deleted_at IS NULL`;
  if (!c) throw new HttpError(422, 'INVALID_CATEGORY', '카테고리를 찾을 수 없어요');
}

/** tag_ids 검증 + new_tags 이름으로 찾거나 생성 → 최종 태그 id 목록 */
export async function resolveTags(tx: Tx, ownerId: string, tagIds: string[], newTags: string[]) {
  const out: { id: string; name: string }[] = [];
  if (tagIds.length) {
    const rows = await tx<{ id: string; name: string }[]>`
      SELECT id, name FROM tags WHERE owner_id = ${ownerId} AND deleted_at IS NULL AND id = ANY(${tagIds}::uuid[])`;
    if (rows.length !== new Set(tagIds).size) throw new HttpError(422, 'INVALID_TAG', '태그를 찾을 수 없어요');
    out.push(...rows);
  }
  for (const name of new Set(newTags)) {
    const [existing] = await tx<{ id: string; name: string }[]>`
      SELECT id, name FROM tags WHERE owner_id = ${ownerId} AND deleted_at IS NULL AND lower(name) = lower(${name})`;
    if (existing) out.push(existing);
    else {
      const id = newId();
      await tx`INSERT INTO tags (id, owner_id, name) VALUES (${id}, ${ownerId}, ${name})`;
      out.push({ id, name });
    }
  }
  return [...new Map(out.map((t) => [t.id, t])).values()];
}

export async function attachTag(tx: Tx, placeId: string, tag: { id: string; name: string }, actorId: string) {
  const [cur] = await tx<{ deleted_at: Date | null }[]>`
    SELECT deleted_at FROM place_tags WHERE place_id = ${placeId} AND tag_id = ${tag.id}`;
  if (cur && !cur.deleted_at) return; // 이미 붙어 있음 (멱등)
  if (cur) {
    await tx`UPDATE place_tags SET deleted_at = NULL, tagged_at = now(), tagged_by = ${actorId}
              WHERE place_id = ${placeId} AND tag_id = ${tag.id}`;
  } else {
    await tx`INSERT INTO place_tags (place_id, tag_id, tagged_by) VALUES (${placeId}, ${tag.id}, ${actorId})`;
  }
  await addEvent(tx, placeId, actorId, 'tag.added', { tag_id: tag.id, name: tag.name });
}

export async function insertNote(tx: Tx, placeId: string, authorId: string, n: z.infer<typeof noteCreate>) {
  const id = n.id ?? newId();
  await tx`INSERT INTO notes (id, place_id, author_id, body, is_private, noted_at)
           VALUES (${id}, ${placeId}, ${authorId}, ${n.body}, ${n.is_private}, ${n.noted_at ? new Date(n.noted_at) : new Date()})`;
  await addEvent(tx, placeId, authorId, 'note.added', { note_id: id });
  return id;
}

function addressCols(a: GeoAddress | null) {
  return {
    address_road: a?.road ?? null,
    address_jibun: a?.jibun ?? null,
    address_postal_code: a?.postal_code ?? null,
    address_source: a?.source ?? null,
    country_code: a?.country_code ?? null,
  };
}

export function placeRoutes(app: FastifyInstance, ctx: Ctx) {
  const { sql } = ctx;

  app.get('/places', async (req) => {
    const { userId } = await ctx.auth(req);
    const q = parse(
      z.object({
        bbox: z.string().optional(),
        near: z.string().optional(),
        category_id: uuid.optional(),
        include_subcategories: boolish.default(true),
        uncategorized: boolish.optional(),
        tag: idList.optional(),
        tag_mode: z.enum(['any', 'all']).default('any'),
        q: z.string().trim().max(100).optional(),
        scope: z.enum(['own', 'shared', 'all']).default('own'),
        share_id: uuid.optional(),
        sort: z.enum(['updated_desc', 'created_desc', 'title_asc', 'distance']).default('updated_desc'),
        deleted: boolish.default(false),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      }),
      req.query,
    );
    const offset = decodeCursor<{ o: number }>(q.cursor)?.o ?? 0;
    const bbox = q.bbox ? parseBBox(q.bbox) : null;
    const near = q.near ? parseNear(q.near) : null;
    if (q.sort === 'distance' && !near) throw new HttpError(422, 'VALIDATION_FAILED', 'distance 정렬에는 near가 필요해요');
    const own = q.scope !== 'shared' && !q.share_id;
    const shared = q.scope !== 'own' && !q.deleted;
    const point = near ? sql`ST_SetSRID(ST_MakePoint(${near.lng}, ${near.lat}), 4326)::geography` : null;
    const tags = q.tag ?? [];

    const rows = await sql<any[]>`
      WITH acc AS (
        SELECT DISTINCT ON (place_id) place_id, permission, share_id FROM (
          SELECT id AS place_id, 'owner'::text AS permission, NULL::uuid AS share_id
            FROM places WHERE ${own ? sql`owner_id = ${userId}` : sql`false`}
          UNION ALL
          SELECT place_id, permission, share_id FROM shared_places(${userId})
           WHERE ${shared ? sql`true` : sql`false`} ${q.share_id ? sql`AND share_id = ${q.share_id}` : sql``}
        ) a
        ORDER BY place_id, (permission = 'owner') DESC, (permission = 'editor') DESC
      )
      SELECT p.id, p.title, ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng,
             p.icon_key, p.color, category_icon(c.id) AS cat_icon, category_color(c.id) AS cat_color,
             CASE WHEN c.id IS NULL THEN NULL ELSE p.category_id END AS category_id,
             p.owner_id, acc.share_id, p.updated_at, p.created_at,
             COALESCE((SELECT array_agg(pt.tag_id ORDER BY pt.tagged_at) FROM place_tags pt
                        WHERE pt.place_id = p.id AND pt.deleted_at IS NULL), '{}') AS tag_ids,
             (SELECT count(*)::int FROM notes n WHERE n.place_id = p.id AND n.deleted_at IS NULL
                 AND (NOT n.is_private OR p.owner_id = ${userId})) AS note_count,
             (SELECT max(n.noted_at) FROM notes n WHERE n.place_id = p.id AND n.deleted_at IS NULL
                 AND (NOT n.is_private OR p.owner_id = ${userId})) AS last_noted_at,
             ${point ? sql`ST_Distance(p.location, ${point})` : sql`NULL::float8`} AS distance_m
        FROM acc
        JOIN places p ON p.id = acc.place_id
        LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
       WHERE ${q.deleted ? sql`p.deleted_at IS NOT NULL` : sql`p.deleted_at IS NULL`}
         ${bbox ? sql`AND ST_Intersects(p.location, ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326)::geography)` : sql``}
         ${near?.radius && point ? sql`AND ST_DWithin(p.location, ${point}, ${near.radius})` : sql``}
         ${q.category_id
           ? q.include_subcategories
             ? sql`AND p.category_id IN (SELECT c2.id FROM categories c2 JOIN categories root ON root.id = ${q.category_id}
                                         WHERE c2.path <@ root.path AND c2.deleted_at IS NULL)`
             : sql`AND p.category_id = ${q.category_id}`
           : sql``}
         ${q.uncategorized ? sql`AND c.id IS NULL` : sql``}
         ${tags.length
           ? q.tag_mode === 'all'
             ? sql`AND (SELECT count(DISTINCT pt.tag_id) FROM place_tags pt WHERE pt.place_id = p.id
                         AND pt.deleted_at IS NULL AND pt.tag_id = ANY(${tags}::uuid[])) = ${new Set(tags).size}`
             : sql`AND EXISTS (SELECT 1 FROM place_tags pt WHERE pt.place_id = p.id AND pt.deleted_at IS NULL
                                AND pt.tag_id = ANY(${tags}::uuid[]))`
           : sql``}
         ${q.q
           ? sql`AND (p.title ILIKE ${'%' + q.q + '%'} OR p.address_road ILIKE ${'%' + q.q + '%'}
                      OR p.address_jibun ILIKE ${'%' + q.q + '%'}
                      OR EXISTS (SELECT 1 FROM notes n WHERE n.place_id = p.id AND n.deleted_at IS NULL
                                  AND (NOT n.is_private OR p.owner_id = ${userId}) AND n.body ILIKE ${'%' + q.q + '%'})
                      OR EXISTS (SELECT 1 FROM place_tags pt JOIN tags t ON t.id = pt.tag_id
                                  WHERE pt.place_id = p.id AND pt.deleted_at IS NULL AND t.name ILIKE ${'%' + q.q + '%'}))`
           : sql``}
       ORDER BY ${
         q.sort === 'created_desc'
           ? sql`p.created_at DESC`
           : q.sort === 'title_asc'
             ? sql`p.title ASC`
             : q.sort === 'distance'
               ? sql`distance_m ASC`
               : sql`p.updated_at DESC`
       }, p.id DESC
       LIMIT ${q.limit + 1} OFFSET ${offset}`;

    const hasMore = rows.length > q.limit;
    return {
      items: rows.slice(0, q.limit).map((r) => ({
        id: r.id,
        title: r.title,
        lat: r.lat,
        lng: r.lng,
        icon: iconOf(r),
        category_id: r.category_id,
        tag_ids: r.tag_ids,
        note_count: r.note_count,
        last_noted_at: r.last_noted_at,
        owner_id: r.owner_id,
        via_share_id: r.share_id,
        distance_m: r.distance_m,
        updated_at: r.updated_at,
      })),
      next_cursor: hasMore ? encodeCursor({ o: offset + q.limit }) : null,
    };
  });

  app.post('/places', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const body = parse(placeCreate, req.body);
    return idempotent(ctx, req, reply, userId, async () => {
      const address = body.resolve_address ? await safeReverse(ctx, body.location.lat, body.location.lng) : null;
      const id = body.id ?? newId();
      await sql.begin(async (tx) => {
        await assertOwnCategory(tx, userId, body.category_id);
        const [dup] = await tx`SELECT 1 FROM places WHERE id = ${id}`;
        if (dup) throw new HttpError(409, 'DUPLICATE_ID', '이미 있는 장소 ID예요');
        const ad = addressCols(address);
        await tx`
          INSERT INTO places (id, owner_id, category_id, title, location, accuracy_m, altitude_m, address_detail,
                              icon_key, color, rating, visited_at, source,
                              address_road, address_jibun, address_postal_code, address_source, country_code)
          VALUES (${id}, ${userId}, ${body.category_id ?? null}, ${body.title},
                  ST_SetSRID(ST_MakePoint(${body.location.lng}, ${body.location.lat}), 4326)::geography,
                  ${body.accuracy_m ?? null}, ${body.altitude_m ?? null}, ${body.address_detail ?? null},
                  ${body.icon_key ?? null}, ${body.color ?? null}, ${body.rating ?? null},
                  ${body.visited_at ? new Date(body.visited_at) : null}, ${body.source},
                  ${ad.address_road}, ${ad.address_jibun}, ${ad.address_postal_code}, ${ad.address_source}, ${ad.country_code})`;
        await addEvent(tx, id, userId, 'place.created', { title: body.title, source: body.source });
        if (body.provider_ref) {
          await tx`INSERT INTO provider_refs (place_id, provider, external_id)
                   VALUES (${id}, ${body.provider_ref.provider}, ${body.provider_ref.external_id})`;
        }
        for (const t of await resolveTags(tx, userId, body.tag_ids, body.new_tags)) await attachTag(tx, id, t, userId);
        if (body.first_note) await insertNote(tx, id, userId, body.first_note);
        if (body.source === 'current_location') {
          await tx`INSERT INTO location_access_logs (user_id, action, purpose) VALUES (${userId}, 'collect', 'save_current_location')`;
        }
      });
      const access = await placeAccess(sql, userId, id);
      const place = await loadPlace(sql, userId, id, access);
      return { status: 201, body: place, headers: { etag: `"${place.version}"` } };
    });
  });

  app.get<{ Params: { placeId: string } }>('/places/:placeId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.placeId);
    const a = await placeAccess(sql, userId, id, { includeDeleted: true });
    const place = await loadPlace(sql, userId, id, a);
    reply.header('etag', `"${place.version}"`);
    return place;
  });

  app.patch<{ Params: { placeId: string } }>('/places/:placeId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.placeId);
    const ifMatch = requireIfMatch(req);
    const body = parse(placeUpdate, req.body);
    const a = await placeAccess(sql, userId, id);
    requireWrite(a);
    if (a.version !== ifMatch) throw preconditionFailed();

    const [cur] = await sql<any[]>`
      SELECT title, icon_key, color, category_id, address_detail, rating, accuracy_m, visited_at,
             ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
        FROM places WHERE id = ${id}`;
    const moved = body.location && (body.location.lat !== cur.lat || body.location.lng !== cur.lng);
    const address = moved && body.resolve_address !== false ? await safeReverse(ctx, body.location!.lat, body.location!.lng) : null;

    await sql.begin(async (tx) => {
      if (body.category_id !== undefined) await assertOwnCategory(tx, a.ownerId, body.category_id);
      const { location, resolve_address, visited_at, ...rest } = body;
      const fields: Record<string, any> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (visited_at !== undefined) fields.visited_at = visited_at ? new Date(visited_at) : null;
      if (moved && (address || resolve_address !== false)) Object.assign(fields, addressCols(address));
      const [upd] = await tx`UPDATE places SET version = version + 1 WHERE id = ${id} AND version = ${ifMatch} RETURNING version`;
      if (!upd) throw preconditionFailed();
      if (Object.keys(fields).length) await tx`UPDATE places SET ${tx(fields)} WHERE id = ${id}`;
      if (location) {
        await tx`UPDATE places SET location = ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography
                  WHERE id = ${id}`;
      }
      if (moved) await addEvent(tx, id, userId, 'place.moved', { from: { lat: cur.lat, lng: cur.lng }, to: location });
      if (body.icon_key !== undefined && body.icon_key !== cur.icon_key)
        await addEvent(tx, id, userId, 'icon.changed', { from: cur.icon_key, to: body.icon_key });
      else if (body.color !== undefined && body.color !== cur.color)
        await addEvent(tx, id, userId, 'icon.changed', { color_from: cur.color, color_to: body.color });
      if (body.category_id !== undefined && body.category_id !== cur.category_id) {
        const [c] = body.category_id ? await tx<{ name: string }[]>`SELECT name FROM categories WHERE id = ${body.category_id}` : [];
        await addEvent(tx, id, userId, 'category.changed', { from: cur.category_id, to: body.category_id, name: c?.name ?? null });
      }
      const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).toISOString() : v);
      const other = Object.keys({ ...rest, ...(visited_at !== undefined ? { visited_at } : {}) }).filter(
        (k) => !['icon_key', 'color', 'category_id'].includes(k) && (body as any)[k] !== undefined && norm((body as any)[k]) !== norm(cur[k]),
      );
      if (other.length) {
        const data: Record<string, unknown> = { fields: other };
        if (body.title !== undefined && body.title !== cur.title) data.title = { from: cur.title, to: body.title };
        await addEvent(tx, id, userId, 'place.updated', data);
      }
    });
    const place = await loadPlace(sql, userId, id, await placeAccess(sql, userId, id));
    reply.header('etag', `"${place.version}"`);
    return place;
  });

  app.delete<{ Params: { placeId: string } }>('/places/:placeId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.placeId);
    const a = await placeAccess(sql, userId, id);
    requireOwner(a);
    await sql.begin(async (tx) => {
      await tx`UPDATE places SET deleted_at = now() WHERE id = ${id}`;
      await addEvent(tx, id, userId, 'place.deleted');
    });
    return reply.code(204).send();
  });

  app.post<{ Params: { placeId: string } }>('/places/:placeId/restore', async (req) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.placeId);
    const a = await placeAccess(sql, userId, id, { includeDeleted: true });
    requireOwner(a);
    if (a.deleted) {
      await sql.begin(async (tx) => {
        await tx`UPDATE places SET deleted_at = NULL WHERE id = ${id}`;
        await addEvent(tx, id, userId, 'place.restored');
      });
    }
    return loadPlace(sql, userId, id, await placeAccess(sql, userId, id));
  });

  app.get<{ Params: { placeId: string } }>('/places/:placeId/timeline', async (req) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.placeId);
    const q = parse(
      z.object({
        types: z.string().optional().transform((s) => (s ? s.split(',') : ['note', 'event'])),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req.query,
    );
    const a = await placeAccess(sql, userId, id, { includeDeleted: true });
    const offset = decodeCursor<{ o: number }>(q.cursor)?.o ?? 0;
    const take = offset + q.limit + 1;
    const notes = q.types.includes('note')
      ? await sql<any[]>`
          SELECT n.*, u.display_name AS author_name, u.handle AS author_handle, u.avatar_url AS author_avatar
            FROM notes n JOIN users u ON u.id = n.author_id
           WHERE n.place_id = ${id} AND n.deleted_at IS NULL
             AND (NOT n.is_private OR ${a.permission === 'owner'} OR n.author_id = ${userId})
           ORDER BY n.noted_at DESC, n.id DESC LIMIT ${take}`
      : [];
    const events = q.types.includes('event')
      ? await sql<any[]>`
          SELECT e.id, e.type, e.data, e.occurred_at, u.id AS actor_id, u.display_name, u.handle, u.avatar_url
            FROM place_events e JOIN users u ON u.id = e.actor_id
           WHERE e.place_id = ${id} AND e.type NOT LIKE 'note.%'
           ORDER BY e.occurred_at DESC, e.id DESC LIMIT ${take}`
      : [];
    const merged = [
      ...notes.map((n) => ({ kind: 'note' as const, at: n.noted_at as Date, note: noteJson(n) })),
      ...events.map((e) => ({
        kind: 'event' as const,
        at: e.occurred_at as Date,
        event: {
          id: Number(e.id),
          type: e.type,
          actor: userPublic({ id: e.actor_id, display_name: e.display_name, handle: e.handle, avatar_url: e.avatar_url }),
          data: e.data,
        },
      })),
    ].sort((x, y) => y.at.getTime() - x.at.getTime());
    const page = merged.slice(offset, offset + q.limit);
    return { items: page, next_cursor: merged.length > offset + q.limit ? encodeCursor({ o: offset + q.limit }) : null };
  });

  app.put<{ Params: { placeId: string; tagId: string } }>('/places/:placeId/tags/:tagId', async (req) => {
    const { userId } = await ctx.auth(req);
    const placeId = parse(uuid, req.params.placeId);
    const tagId = parse(uuid, req.params.tagId);
    requireOwner(await placeAccess(sql, userId, placeId));
    await sql.begin(async (tx) => {
      const [tag] = await resolveTags(tx, userId, [tagId], []);
      await attachTag(tx, placeId, tag!, userId);
    });
    const [row] = await sql<any[]>`
      SELECT pt.tag_id, t.name, t.color, pt.tagged_at, pt.tagged_by
        FROM place_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.place_id = ${placeId} AND pt.tag_id = ${tagId}`;
    return row;
  });

  app.delete<{ Params: { placeId: string; tagId: string } }>('/places/:placeId/tags/:tagId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const placeId = parse(uuid, req.params.placeId);
    const tagId = parse(uuid, req.params.tagId);
    requireOwner(await placeAccess(sql, userId, placeId));
    await sql.begin(async (tx) => {
      const [row] = await tx<{ name: string }[]>`
        UPDATE place_tags pt SET deleted_at = now() FROM tags t
         WHERE pt.place_id = ${placeId} AND pt.tag_id = ${tagId} AND pt.deleted_at IS NULL AND t.id = pt.tag_id
         RETURNING t.name`;
      if (row) await addEvent(tx, placeId, userId, 'tag.removed', { tag_id: tagId, name: row.name });
    });
    return reply.code(204).send();
  });

  app.post<{ Params: { placeId: string } }>('/places/:placeId/copy', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const srcId = parse(uuid, req.params.placeId);
    const body = parse(z.object({ category_id: uuid.nullable().optional(), include_notes: z.boolean().default(false) }), req.body);
    const a = await placeAccess(sql, userId, srcId);
    const id = newId();
    await sql.begin(async (tx) => {
      await assertOwnCategory(tx, userId, body.category_id);
      await tx`
        INSERT INTO places (id, owner_id, category_id, title, location, accuracy_m, altitude_m, address_road, address_jibun,
                            address_postal_code, address_source, address_detail, country_code, icon_key, color, source, copied_from_place_id)
        SELECT ${id}, ${userId}, ${body.category_id ?? null}, title, location, accuracy_m, altitude_m, address_road, address_jibun,
               address_postal_code, address_source, address_detail, country_code, icon_key, color, 'shared_copy', id
          FROM places WHERE id = ${srcId}`;
      await tx`INSERT INTO provider_refs (place_id, provider, external_id)
               SELECT ${id}, provider, external_id FROM provider_refs WHERE place_id = ${srcId}`;
      await addEvent(tx, id, userId, 'place.created', { source: 'shared_copy', from_place_id: srcId, from_owner_id: a.ownerId });
      if (body.include_notes) {
        const notes = await tx<any[]>`SELECT body, noted_at FROM notes WHERE place_id = ${srcId} AND deleted_at IS NULL AND NOT is_private`;
        for (const n of notes) await insertNote(tx, id, userId, { body: n.body, is_private: false, noted_at: n.noted_at.toISOString() });
      }
    });
    reply.code(201);
    return loadPlace(sql, userId, id, await placeAccess(sql, userId, id));
  });

  app.post('/places/batch', async (req) => {
    const { userId } = await ctx.auth(req);
    const body = parse(
      z.object({
        place_ids: z.array(uuid).min(1).max(500),
        action: z.enum(['move_category', 'add_tags', 'remove_tags', 'delete', 'restore']),
        category_id: uuid.nullable().optional(),
        tag_ids: z.array(uuid).default([]),
      }),
      req.body,
    );
    const succeeded: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    if (body.action === 'move_category') await assertOwnCategory(sql, userId, body.category_id);
    for (const id of new Set(body.place_ids)) {
      try {
        await sql.begin(async (tx) => {
          const a = await placeAccess(tx, userId, id, { includeDeleted: body.action === 'restore' });
          requireOwner(a);
          switch (body.action) {
            case 'move_category':
              if (a.categoryId !== (body.category_id ?? null)) {
                await tx`UPDATE places SET category_id = ${body.category_id ?? null}, version = version + 1 WHERE id = ${id}`;
                await addEvent(tx, id, userId, 'category.changed', { from: a.categoryId, to: body.category_id ?? null });
              }
              break;
            case 'add_tags':
              for (const t of await resolveTags(tx, userId, body.tag_ids, [])) await attachTag(tx, id, t, userId);
              break;
            case 'remove_tags':
              for (const t of body.tag_ids) {
                const [row] = await tx`UPDATE place_tags SET deleted_at = now()
                                        WHERE place_id = ${id} AND tag_id = ${t} AND deleted_at IS NULL RETURNING tag_id`;
                if (row) await addEvent(tx, id, userId, 'tag.removed', { tag_id: t });
              }
              break;
            case 'delete':
              await tx`UPDATE places SET deleted_at = now() WHERE id = ${id} AND deleted_at IS NULL`;
              await addEvent(tx, id, userId, 'place.deleted');
              break;
            case 'restore':
              await tx`UPDATE places SET deleted_at = NULL WHERE id = ${id}`;
              await addEvent(tx, id, userId, 'place.restored');
              break;
          }
        });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, reason: e instanceof HttpError ? e.code : 'ERROR' });
      }
    }
    return { succeeded, failed };
  });
}

export { noteCreate, notFound };
