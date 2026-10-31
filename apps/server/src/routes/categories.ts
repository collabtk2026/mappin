import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.js';
import type { Sql } from '../db.js';
import { HttpError, conflict, notFound } from '../lib/errors.js';
import { ltreeLabel, newId } from '../lib/ids.js';
import { addEvent } from '../lib/places.js';
import { hexColor, parse, uuid } from '../lib/validate.js';

const write = z.object({
  id: uuid.optional(),
  parent_id: uuid.nullable().optional(),
  name: z.string().trim().min(1).max(50).optional(),
  icon_key: z.string().max(40).nullable().optional(),
  color: hexColor.nullable().optional(),
  sort_order: z.number().int().optional(),
});

interface CatRow {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  icon_key: string | null;
  color: string | null;
  sort_order: number;
  place_count: number;
  shared: boolean;
  path: string;
  updated_at: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function categoryRows(sql: Sql, where: any) {
  return sql<CatRow[]>`
    SELECT c.id, c.owner_id, c.parent_id, c.name, c.icon_key, c.color, c.sort_order, c.path::text AS path, c.updated_at,
           (SELECT count(*)::int FROM places p JOIN categories c2 ON c2.id = p.category_id
             WHERE c2.path <@ c.path AND c2.deleted_at IS NULL AND p.deleted_at IS NULL) AS place_count,
           EXISTS (SELECT 1 FROM shares s WHERE s.target_type = 'category' AND s.target_id = c.id
                     AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())) AS shared
      FROM categories c
     WHERE c.deleted_at IS NULL AND ${where}
     ORDER BY nlevel(c.path), c.sort_order, c.name`;
}

export function toTree(rows: CatRow[]) {
  const nodes = new Map(rows.map((r) => [r.id, { ...r, path: undefined, children: [] as any[] }]));
  const roots: any[] = [];
  for (const n of nodes.values()) {
    const parent = n.parent_id ? nodes.get(n.parent_id) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  return roots;
}

export function categoryRoutes(app: FastifyInstance, ctx: Ctx) {
  const { sql } = ctx;

  const own = async (userId: string, id: string) => {
    const [c] = await sql<{ id: string; parent_id: string | null; path: string; name: string }[]>`
      SELECT id, parent_id, path::text AS path, name FROM categories WHERE id = ${id} AND owner_id = ${userId} AND deleted_at IS NULL`;
    if (!c) throw notFound('카테고리');
    return c;
  };
  const one = async (id: string) => {
    const [c] = await categoryRows(sql, sql`c.id = ${id}`);
    return { ...c!, path: undefined, children: [] };
  };

  app.get('/categories', async (req) => {
    const { userId } = await ctx.auth(req);
    const q = parse(z.object({ format: z.enum(['tree', 'flat']).default('tree'), scope: z.enum(['own', 'shared', 'all']).default('own') }), req.query);
    const ownCond = sql`c.owner_id = ${userId}`;
    const sharedCond = sql`EXISTS (
      SELECT 1 FROM shares s JOIN categories root ON root.id = s.target_id
       WHERE s.target_type = 'category' AND s.grantee_user_id = ${userId} AND s.accepted_at IS NOT NULL
         AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())
         AND (CASE WHEN s.include_descendants THEN c.path <@ root.path ELSE c.id = root.id END))`;
    const where = q.scope === 'own' ? ownCond : q.scope === 'shared' ? sharedCond : sql`(${ownCond} OR ${sharedCond})`;
    const rows = await categoryRows(sql, where);
    if (q.format === 'flat') return { items: rows.map((r) => ({ ...r, path: undefined })) };
    // 공유받은 하위 카테고리만 보이는 경우 부모가 목록에 없으므로 루트로 취급
    const ids = new Set(rows.map((r) => r.id));
    return { items: toTree(rows.map((r) => (r.parent_id && !ids.has(r.parent_id) ? { ...r, parent_id: null } : r))) };
  });

  app.post('/categories', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const body = parse(write.extend({ name: z.string().trim().min(1).max(50) }), req.body);
    const id = body.id ?? newId();
    let path = ltreeLabel(id);
    if (body.parent_id) {
      const parent = await own(userId, body.parent_id);
      if (parent.path.split('.').length >= 5) throw new HttpError(422, 'TOO_DEEP', '카테고리는 5단계까지 만들 수 있어요');
      path = `${parent.path}.${path}`;
    }
    const [nextRow] = await sql<{ next: number }[]>`
      SELECT COALESCE(max(sort_order) + 1, 0)::int AS next FROM categories
       WHERE owner_id = ${userId} AND parent_id IS NOT DISTINCT FROM ${body.parent_id ?? null} AND deleted_at IS NULL`;
    const next = nextRow!.next;
    await sql`
      INSERT INTO categories (id, owner_id, parent_id, path, name, icon_key, color, sort_order)
      VALUES (${id}, ${userId}, ${body.parent_id ?? null}, ${path}::ltree, ${body.name}, ${body.icon_key ?? null},
              ${body.color ?? null}, ${body.sort_order ?? next})`;
    reply.code(201);
    return one(id);
  });

  app.patch<{ Params: { categoryId: string } }>('/categories/:categoryId', async (req) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.categoryId);
    const body = parse(write.omit({ id: true }), req.body);
    const cur = await own(userId, id);
    await sql.begin(async (tx) => {
      if (body.parent_id !== undefined && body.parent_id !== cur.parent_id) {
        let newPath = ltreeLabel(id);
        if (body.parent_id) {
          const parent = await own(userId, body.parent_id);
          if (parent.path === cur.path || parent.path.startsWith(cur.path + '.')) {
            throw conflict('CATEGORY_CYCLE', '자기 하위 카테고리로는 옮길 수 없어요');
          }
          newPath = `${parent.path}.${newPath}`;
        }
        // 하위 트리 전체의 경로를 새 위치로 이동
        await tx`UPDATE categories SET path = ${newPath}::ltree || subpath(path, nlevel(${cur.path}::ltree))
                  WHERE path <@ ${cur.path}::ltree AND id <> ${id}`;
        await tx`UPDATE categories SET path = ${newPath}::ltree, parent_id = ${body.parent_id} WHERE id = ${id}`;
      }
      const { parent_id, ...rest } = body;
      const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(fields).length) await tx`UPDATE categories SET ${tx(fields as Record<string, any>)} WHERE id = ${id}`;
    });
    return one(id);
  });

  app.delete<{ Params: { categoryId: string } }>('/categories/:categoryId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.categoryId);
    const { places } = parse(z.object({ places: z.enum(['move_to_parent', 'uncategorize', 'delete']).default('move_to_parent') }), req.query);
    const cur = await own(userId, id);
    await sql.begin(async (tx) => {
      const subtree = (await tx<{ id: string }[]>`
        SELECT id FROM categories WHERE path <@ ${cur.path}::ltree AND deleted_at IS NULL`).map((r) => r.id);
      const affected = await tx<{ id: string }[]>`
        SELECT id FROM places WHERE category_id = ANY(${subtree}::uuid[]) AND deleted_at IS NULL`;
      if (places === 'delete') {
        await tx`UPDATE places SET deleted_at = now() WHERE id = ANY(${affected.map((p) => p.id)}::uuid[])`;
        for (const p of affected) await addEvent(tx, p.id, userId, 'place.deleted', { reason: 'category_deleted' });
      } else {
        const target = places === 'move_to_parent' ? cur.parent_id : null;
        await tx`UPDATE places SET category_id = ${target}, version = version + 1 WHERE id = ANY(${affected.map((p) => p.id)}::uuid[])`;
        for (const p of affected) await addEvent(tx, p.id, userId, 'category.changed', { from: id, to: target, reason: 'category_deleted' });
      }
      await tx`UPDATE categories SET deleted_at = now() WHERE id = ANY(${subtree}::uuid[])`;
      await tx`UPDATE shares SET revoked_at = now() WHERE target_type = 'category' AND target_id = ANY(${subtree}::uuid[]) AND revoked_at IS NULL`;
    });
    return reply.code(204).send();
  });

  app.post('/categories/reorder', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const body = parse(z.object({ parent_id: uuid.nullable(), ordered_ids: z.array(uuid).min(1).max(500) }), req.body);
    await sql.begin(async (tx) => {
      for (const [i, cid] of body.ordered_ids.entries()) {
        const [r] = await tx`UPDATE categories SET sort_order = ${i}
                              WHERE id = ${cid} AND owner_id = ${userId} AND parent_id IS NOT DISTINCT FROM ${body.parent_id}
                                AND deleted_at IS NULL RETURNING id`;
        if (!r) throw new HttpError(422, 'INVALID_CATEGORY', '같은 부모의 카테고리만 정렬할 수 있어요');
      }
    });
    return reply.code(204).send();
  });
}
