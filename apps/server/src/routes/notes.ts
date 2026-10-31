import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idempotent, type Ctx } from '../app.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { forbidden, notFound, preconditionFailed } from '../lib/errors.js';
import { addEvent, noteJson, placeAccess, requireWrite } from '../lib/places.js';
import { isoDate, parse, uuid } from '../lib/validate.js';
import { insertNote, noteCreate, requireIfMatch } from './places.js';

export function noteRoutes(app: FastifyInstance, ctx: Ctx) {
  const { sql } = ctx;

  const loadNote = async (id: string) => {
    const [n] = await sql<any[]>`
      SELECT n.*, u.display_name AS author_name, u.handle AS author_handle, u.avatar_url AS author_avatar
        FROM notes n JOIN users u ON u.id = n.author_id WHERE n.id = ${id} AND n.deleted_at IS NULL`;
    return n;
  };

  /** 메모 접근: 장소 접근 권한 + 비공개 메모는 장소 주인/작성자만 */
  const noteAccess = async (userId: string, noteId: string) => {
    const n = await loadNote(noteId);
    if (!n) throw notFound('메모');
    const a = await placeAccess(sql, userId, n.place_id);
    if (n.is_private && a.permission !== 'owner' && n.author_id !== userId) throw notFound('메모');
    return { n, a };
  };

  app.get<{ Params: { placeId: string } }>('/places/:placeId/notes', async (req) => {
    const { userId } = await ctx.auth(req);
    const placeId = parse(uuid, req.params.placeId);
    const q = parse(z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    const a = await placeAccess(sql, userId, placeId);
    const offset = decodeCursor<{ o: number }>(q.cursor)?.o ?? 0;
    const rows = await sql<any[]>`
      SELECT n.*, u.display_name AS author_name, u.handle AS author_handle, u.avatar_url AS author_avatar
        FROM notes n JOIN users u ON u.id = n.author_id
       WHERE n.place_id = ${placeId} AND n.deleted_at IS NULL
         AND (NOT n.is_private OR ${a.permission === 'owner'} OR n.author_id = ${userId})
       ORDER BY n.noted_at DESC, n.id DESC LIMIT ${q.limit + 1} OFFSET ${offset}`;
    return {
      items: rows.slice(0, q.limit).map(noteJson),
      next_cursor: rows.length > q.limit ? encodeCursor({ o: offset + q.limit }) : null,
    };
  });

  app.post<{ Params: { placeId: string } }>('/places/:placeId/notes', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const placeId = parse(uuid, req.params.placeId);
    const body = parse(noteCreate, req.body);
    requireWrite(await placeAccess(sql, userId, placeId));
    return idempotent(ctx, req, reply, userId, async () => {
      const id = await sql.begin((tx) => insertNote(tx, placeId, userId, body));
      const n = await loadNote(id);
      return { status: 201, body: noteJson(n), headers: { etag: `"${n.revision}"` } };
    });
  });

  app.patch<{ Params: { noteId: string } }>('/notes/:noteId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const noteId = parse(uuid, req.params.noteId);
    const ifMatch = requireIfMatch(req);
    const body = parse(
      z.object({ body: z.string().trim().min(1).max(10000), is_private: z.boolean(), noted_at: isoDate }).partial(),
      req.body,
    );
    const { n } = await noteAccess(userId, noteId);
    if (n.author_id !== userId) throw forbidden('메모 작성자만 수정할 수 있어요');
    if (n.revision !== ifMatch) throw preconditionFailed();
    await sql.begin(async (tx) => {
      const bodyChanged = body.body !== undefined && body.body !== n.body;
      if (bodyChanged) {
        // 이전 내용을 리비전으로 보존
        await tx`INSERT INTO note_revisions (note_id, revision, body, edited_by, edited_at)
                 VALUES (${noteId}, ${n.revision}, ${n.body}, ${n.author_id}, ${n.updated_at})`;
      }
      const [upd] = await tx`
        UPDATE notes SET
          body = ${body.body ?? n.body},
          is_private = ${body.is_private ?? n.is_private},
          noted_at = ${body.noted_at ? new Date(body.noted_at) : n.noted_at},
          revision = revision + ${bodyChanged ? 1 : 0}
        WHERE id = ${noteId} AND revision = ${ifMatch} RETURNING id`;
      if (!upd) throw preconditionFailed();
      if (bodyChanged) await addEvent(tx, n.place_id, userId, 'note.edited', { note_id: noteId, revision: n.revision + 1 });
    });
    const out = await loadNote(noteId);
    reply.header('etag', `"${out.revision}"`);
    return noteJson(out);
  });

  app.delete<{ Params: { noteId: string } }>('/notes/:noteId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const noteId = parse(uuid, req.params.noteId);
    const { n, a } = await noteAccess(userId, noteId);
    if (n.author_id !== userId && a.permission !== 'owner') throw forbidden();
    await sql.begin(async (tx) => {
      await tx`UPDATE notes SET deleted_at = now() WHERE id = ${noteId}`;
      await addEvent(tx, n.place_id, userId, 'note.deleted', { note_id: noteId });
    });
    return reply.code(204).send();
  });

  app.get<{ Params: { noteId: string } }>('/notes/:noteId/revisions', async (req) => {
    const { userId } = await ctx.auth(req);
    const noteId = parse(uuid, req.params.noteId);
    const { n } = await noteAccess(userId, noteId);
    const old = await sql<any[]>`
      SELECT revision, body, edited_by, edited_at FROM note_revisions WHERE note_id = ${noteId} ORDER BY revision DESC`;
    return {
      items: [{ revision: n.revision, body: n.body, edited_by: n.author_id, edited_at: n.updated_at, current: true }, ...old],
    };
  });
}
