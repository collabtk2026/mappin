import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idempotent, type Ctx } from '../app.js';
import { randomToken, sha256 } from '../lib/auth.js';
import { HttpError, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { loadPlaces, userPublic } from '../lib/places.js';
import { isoDate, parse, uuid } from '../lib/validate.js';
import { mapConfig } from './catalog.js';
import { categoryRows } from './categories.js';

const grantee = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), user_id: uuid }),
  z.object({ type: z.literal('email'), email: z.string().email().transform((e) => e.toLowerCase()) }),
  z.object({ type: z.literal('link') }),
]);

export function shareRoutes(app: FastifyInstance, ctx: Ctx) {
  const { sql, config } = ctx;
  const linkUrl = (token: string) => `${config.publicWebUrl}/s/${token}`;

  const shareRows = (where: any) => sql<any[]>`
    SELECT s.*, o.display_name AS o_name, o.handle AS o_handle, o.avatar_url AS o_avatar,
           g.display_name AS g_name, g.handle AS g_handle, g.avatar_url AS g_avatar,
           CASE s.target_type WHEN 'place' THEN (SELECT title FROM places WHERE id = s.target_id)
                              ELSE (SELECT name FROM categories WHERE id = s.target_id) END AS target_title,
           CASE s.target_type WHEN 'place' THEN 1
             ELSE (SELECT count(*)::int FROM places p JOIN categories c ON c.id = p.category_id
                     JOIN categories root ON root.id = s.target_id
                    WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
                      AND (CASE WHEN s.include_descendants THEN c.path <@ root.path ELSE c.id = root.id END)) END AS place_count
      FROM shares s
      JOIN users o ON o.id = s.owner_id
      LEFT JOIN users g ON g.id = s.grantee_user_id
     WHERE ${where}
     ORDER BY s.created_at DESC`;

  const shareJson = (s: any, token?: string) => ({
    id: s.id,
    owner: userPublic({ id: s.owner_id, display_name: s.o_name, handle: s.o_handle, avatar_url: s.o_avatar }),
    target_type: s.target_type,
    target_id: s.target_id,
    target_title: s.target_title,
    include_descendants: s.include_descendants,
    grantee_type: s.grantee_type,
    grantee: s.grantee_user_id ? userPublic({ id: s.grantee_user_id, display_name: s.g_name, handle: s.g_handle, avatar_url: s.g_avatar }) : null,
    grantee_email: s.grantee_email,
    permission: s.permission,
    status: s.revoked_at
      ? 'revoked'
      : s.expires_at && new Date(s.expires_at) < new Date()
        ? 'expired'
        : s.accepted_at || s.grantee_type === 'link'
          ? 'accepted'
          : 'pending',
    link_url: token ? linkUrl(token) : null,
    place_count: s.place_count,
    message: s.message,
    expires_at: s.expires_at,
    accepted_at: s.accepted_at,
    created_at: s.created_at,
  });

  const getShare = async (id: string) => {
    const [s] = await shareRows(sql`s.id = ${id}`);
    if (!s) throw notFound('공유');
    return s;
  };

  app.get('/shares', async (req) => {
    const { userId } = await ctx.auth(req);
    const q = parse(z.object({ target_type: z.enum(['place', 'category']).optional(), target_id: uuid.optional() }), req.query);
    const rows = await shareRows(sql`s.owner_id = ${userId} AND s.revoked_at IS NULL
      ${q.target_type ? sql`AND s.target_type = ${q.target_type}` : sql``}
      ${q.target_id ? sql`AND s.target_id = ${q.target_id}` : sql``}`);
    return { items: rows.map((s) => shareJson(s)) };
  });

  app.post('/shares', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const body = parse(
      z.object({
        target_type: z.enum(['place', 'category']),
        target_id: uuid,
        include_descendants: z.boolean().default(true),
        grantee,
        permission: z.enum(['viewer', 'editor']).default('viewer'),
        expires_at: isoDate.optional(),
        message: z.string().max(200).optional(),
      }),
      req.body,
    );
    return idempotent(ctx, req, reply, userId, async () => {
      const [target] =
        body.target_type === 'place'
          ? await sql`SELECT 1 FROM places WHERE id = ${body.target_id} AND owner_id = ${userId} AND deleted_at IS NULL`
          : await sql`SELECT 1 FROM categories WHERE id = ${body.target_id} AND owner_id = ${userId} AND deleted_at IS NULL`;
      if (!target) throw notFound(body.target_type === 'place' ? '장소' : '카테고리');

      let granteeType: 'user' | 'email' | 'link' = body.grantee.type;
      let granteeUserId: string | null = null;
      let granteeEmail: string | null = null;
      if (body.grantee.type === 'user') {
        const [u] = await sql`SELECT id FROM users WHERE id = ${body.grantee.user_id} AND deleted_at IS NULL`;
        if (!u) throw notFound('사용자');
        granteeUserId = body.grantee.user_id;
      } else if (body.grantee.type === 'email') {
        const [u] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${body.grantee.email} AND deleted_at IS NULL`;
        if (u) {
          granteeType = 'user';
          granteeUserId = u.id;
        } else granteeEmail = body.grantee.email;
      }
      if (granteeUserId === userId) throw new HttpError(422, 'SELF_SHARE', '나에게는 공유할 수 없어요');

      if (granteeType !== 'link') {
        const [existing] = await sql<{ id: string }[]>`
          SELECT id FROM shares WHERE owner_id = ${userId} AND target_type = ${body.target_type} AND target_id = ${body.target_id}
             AND revoked_at IS NULL AND grantee_user_id IS NOT DISTINCT FROM ${granteeUserId}
             AND grantee_email IS NOT DISTINCT FROM ${granteeEmail}`;
        if (existing) {
          await sql`UPDATE shares SET permission = ${body.permission} WHERE id = ${existing.id}`;
          return { status: 200, body: shareJson(await getShare(existing.id)) };
        }
      }
      const id = newId();
      const token = granteeType === 'link' ? randomToken(24) : null;
      await sql`
        INSERT INTO shares (id, owner_id, target_type, target_id, include_descendants, grantee_type, grantee_user_id,
                            grantee_email, link_token_hash, permission, message, expires_at)
        VALUES (${id}, ${userId}, ${body.target_type}, ${body.target_id}, ${body.include_descendants}, ${granteeType},
                ${granteeUserId}, ${granteeEmail}, ${token ? sha256(token) : null},
                ${granteeType === 'link' ? 'viewer' : body.permission}, ${body.message ?? null},
                ${body.expires_at ? new Date(body.expires_at) : null})`;
      await sql`INSERT INTO location_access_logs (user_id, action, purpose, recipient)
                VALUES (${userId}, 'provide', ${'share:' + body.target_type}, ${granteeUserId ?? granteeEmail ?? 'link'})`;
      return { status: 201, body: shareJson(await getShare(id), token ?? undefined) };
    });
  });

  app.patch<{ Params: { shareId: string } }>('/shares/:shareId', async (req) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.shareId);
    const body = parse(z.object({ permission: z.enum(['viewer', 'editor']), expires_at: isoDate.nullable() }).partial(), req.body);
    const s = await getShare(id);
    if (s.owner_id !== userId) throw forbidden();
    if (s.grantee_type === 'link' && body.permission === 'editor') throw new HttpError(422, 'LINK_VIEW_ONLY', '링크 공유는 보기만 가능해요');
    await sql`UPDATE shares SET permission = ${body.permission ?? s.permission},
                expires_at = ${body.expires_at === undefined ? s.expires_at : body.expires_at ? new Date(body.expires_at) : null}
              WHERE id = ${id}`;
    return shareJson(await getShare(id));
  });

  /** 주인은 회수, 받은 사람은 공유 나가기 */
  app.delete<{ Params: { shareId: string } }>('/shares/:shareId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.shareId);
    const s = await getShare(id);
    if (s.owner_id !== userId && s.grantee_user_id !== userId) throw notFound('공유');
    await sql`UPDATE shares SET revoked_at = now() WHERE id = ${id} AND revoked_at IS NULL`;
    return reply.code(204).send();
  });

  app.post<{ Params: { shareId: string } }>('/shares/:shareId/rotate-link', async (req) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.shareId);
    const s = await getShare(id);
    if (s.owner_id !== userId) throw forbidden();
    if (s.grantee_type !== 'link' || s.revoked_at) throw new HttpError(422, 'NOT_LINK', '링크 공유가 아니에요');
    const token = randomToken(24);
    await sql`UPDATE shares SET link_token_hash = ${sha256(token)} WHERE id = ${id}`;
    return shareJson(await getShare(id), token);
  });

  app.post<{ Params: { shareId: string } }>('/shares/:shareId/accept', async (req) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.shareId);
    const s = await getShare(id);
    if (s.grantee_user_id !== userId || s.revoked_at) throw notFound('공유');
    await sql`UPDATE shares SET accepted_at = COALESCE(accepted_at, now()) WHERE id = ${id}`;
    return shareJson(await getShare(id));
  });

  app.get('/shared-with-me', async (req) => {
    const { userId } = await ctx.auth(req);
    const q = parse(z.object({ status: z.enum(['pending', 'accepted', 'all']).default('all') }), req.query);
    const rows = await shareRows(sql`s.grantee_user_id = ${userId} AND s.revoked_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
      ${q.status === 'pending' ? sql`AND s.accepted_at IS NULL` : q.status === 'accepted' ? sql`AND s.accepted_at IS NOT NULL` : sql``}`);
    return { items: rows.map((s) => shareJson(s)) };
  });

  app.get<{ Params: { token: string } }>('/public/shares/:token', async (req, reply) => {
    const [s] = await shareRows(sql`s.link_token_hash = ${sha256(req.params.token)}`);
    if (!s) throw notFound('공유');
    if (s.revoked_at || (s.expires_at && new Date(s.expires_at) < new Date())) {
      throw new HttpError(410, 'SHARE_GONE', '공유가 만료됐거나 회수됐어요');
    }
    let placeIds: string[];
    let categories: any[] = [];
    if (s.target_type === 'place') {
      placeIds = (await sql<{ id: string }[]>`SELECT id FROM places WHERE id = ${s.target_id} AND deleted_at IS NULL`).map((r) => r.id);
    } else {
      const [root] = await sql<{ path: string }[]>`SELECT path::text AS path FROM categories WHERE id = ${s.target_id}`;
      const rows = await categoryRows(
        sql,
        s.include_descendants ? sql`c.path <@ ${root!.path}::ltree` : sql`c.id = ${s.target_id}`,
      );
      categories = rows.map((r) => ({ ...r, path: undefined, shared: undefined, owner_id: undefined }));
      placeIds = (
        await sql<{ id: string }[]>`SELECT id FROM places WHERE category_id = ANY(${rows.map((r) => r.id)}::uuid[])
                                      AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1000`
      ).map((r) => r.id);
    }
    // 비로그인 열람: viewer 권한, 비공개 메모 제외
    const places = (await loadPlaces(sql, null, placeIds, new Map(placeIds.map((id) => [id, { permission: 'viewer' as const, shareId: s.id }])))).map(
      ({ deleted_at, ...p }) => p,
    );
    reply.header('cache-control', 'private, max-age=60');
    return {
      share: {
        target_type: s.target_type,
        title: s.target_title,
        owner: userPublic({ id: s.owner_id, display_name: s.o_name, handle: s.o_handle, avatar_url: s.o_avatar }),
        message: s.message,
        expires_at: s.expires_at,
      },
      categories,
      places,
      map_config: mapConfig(config, 'web'),
    };
  });
}
