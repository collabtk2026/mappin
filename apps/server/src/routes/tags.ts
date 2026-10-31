import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.js';
import { conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { addEvent } from '../lib/places.js';
import { hexColor, parse, uuid } from '../lib/validate.js';

export function tagRoutes(app: FastifyInstance, ctx: Ctx) {
  const { sql } = ctx;

  const tagJson = async (ownerId: string, id?: string, prefix?: string) =>
    sql<any[]>`
      SELECT t.id, t.name, t.color, t.created_at, t.updated_at,
             (SELECT count(*)::int FROM place_tags pt JOIN places p ON p.id = pt.place_id
               WHERE pt.tag_id = t.id AND pt.deleted_at IS NULL AND p.deleted_at IS NULL) AS place_count
        FROM tags t
       WHERE t.owner_id = ${ownerId} AND t.deleted_at IS NULL
         ${id ? sql`AND t.id = ${id}` : sql``}
         ${prefix ? sql`AND t.name ILIKE ${prefix + '%'}` : sql``}
       ORDER BY place_count DESC, t.name`;

  const own = async (ownerId: string, id: string) => {
    const [t] = await tagJson(ownerId, id);
    if (!t) throw notFound('태그');
    return t;
  };

  app.get('/tags', async (req) => {
    const { userId } = await ctx.auth(req);
    const q = parse(z.object({ q: z.string().trim().max(30).optional() }), req.query);
    return { items: await tagJson(userId, undefined, q.q) };
  });

  app.post('/tags', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const body = parse(z.object({ id: uuid.optional(), name: z.string().trim().min(1).max(30), color: hexColor.nullable().optional() }), req.body);
    const [dup] = await sql`SELECT 1 FROM tags WHERE owner_id = ${userId} AND deleted_at IS NULL AND lower(name) = lower(${body.name})`;
    if (dup) throw conflict('TAG_EXISTS', '이미 있는 태그예요');
    const id = body.id ?? newId();
    await sql`INSERT INTO tags (id, owner_id, name, color) VALUES (${id}, ${userId}, ${body.name}, ${body.color ?? null})`;
    reply.code(201);
    return own(userId, id);
  });

  app.patch<{ Params: { tagId: string } }>('/tags/:tagId', async (req) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.tagId);
    const body = parse(z.object({ name: z.string().trim().min(1).max(30), color: hexColor.nullable() }).partial(), req.body);
    await own(userId, id);
    if (body.name) {
      const [dup] = await sql`SELECT 1 FROM tags WHERE owner_id = ${userId} AND deleted_at IS NULL
                               AND lower(name) = lower(${body.name}) AND id <> ${id}`;
      if (dup) throw conflict('TAG_EXISTS', '이미 있는 태그예요');
    }
    const fields = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    if (Object.keys(fields).length) await sql`UPDATE tags SET ${sql(fields as Record<string, any>)} WHERE id = ${id}`;
    return own(userId, id);
  });

  app.delete<{ Params: { tagId: string } }>('/tags/:tagId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.tagId);
    const t = await own(userId, id);
    await sql.begin(async (tx) => {
      const detached = await tx<{ place_id: string }[]>`
        UPDATE place_tags SET deleted_at = now() WHERE tag_id = ${id} AND deleted_at IS NULL RETURNING place_id`;
      for (const r of detached) await addEvent(tx, r.place_id, userId, 'tag.removed', { tag_id: id, name: t.name });
      await tx`UPDATE tags SET deleted_at = now() WHERE id = ${id}`;
    });
    return reply.code(204).send();
  });

  app.post<{ Params: { tagId: string } }>('/tags/:tagId/merge', async (req) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.tagId);
    const { into_tag_id } = parse(z.object({ into_tag_id: uuid }), req.body);
    if (id === into_tag_id) return own(userId, id);
    const [from, into] = [await own(userId, id), await own(userId, into_tag_id)];
    await sql.begin(async (tx) => {
      const rows = await tx<{ place_id: string; tagged_at: Date; tagged_by: string }[]>`
        SELECT place_id, tagged_at, tagged_by FROM place_tags WHERE tag_id = ${from.id} AND deleted_at IS NULL`;
      for (const r of rows) {
        // 태그한 시간은 원래 값을 유지
        await tx`INSERT INTO place_tags (place_id, tag_id, tagged_at, tagged_by)
                 VALUES (${r.place_id}, ${into.id}, ${r.tagged_at}, ${r.tagged_by})
                 ON CONFLICT (place_id, tag_id) DO UPDATE SET deleted_at = NULL,
                   tagged_at = LEAST(place_tags.tagged_at, EXCLUDED.tagged_at)`;
      }
      await tx`UPDATE place_tags SET deleted_at = now() WHERE tag_id = ${from.id} AND deleted_at IS NULL`;
      await tx`UPDATE tags SET deleted_at = now() WHERE id = ${from.id}`;
    });
    return own(userId, into.id);
  });
}
