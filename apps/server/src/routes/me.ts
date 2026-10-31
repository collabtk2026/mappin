import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.js';
import { conflict } from '../lib/errors.js';
import { parse, uuid } from '../lib/validate.js';
import { clearAuthCookies, meJson } from './auth.js';

export function meRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/me', async (req) => {
    const { userId } = await ctx.auth(req);
    return meJson(ctx.sql, userId);
  });

  app.patch('/me', async (req) => {
    const { userId } = await ctx.auth(req);
    const body = parse(
      z.object({
        display_name: z.string().trim().min(1).max(40).optional(),
        handle: z.string().regex(/^[a-z0-9_.]{3,20}$/, '영문 소문자·숫자·_ . 3~20자').optional(),
        avatar_url: z.string().url().nullable().optional(),
        locale: z.string().max(10).optional(),
        timezone: z.string().max(60).optional(),
      }),
      req.body,
    );
    if (body.handle) {
      const [taken] = await ctx.sql`SELECT 1 FROM users WHERE handle = ${body.handle} AND id <> ${userId}`;
      if (taken) throw conflict('HANDLE_TAKEN', '이미 사용 중인 아이디예요');
    }
    const fields = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    if (Object.keys(fields).length) {
      await ctx.sql`UPDATE users SET ${ctx.sql(fields as Record<string, string>)} WHERE id = ${userId}`;
    }
    return meJson(ctx.sql, userId);
  });

  /** 회원 탈퇴: 즉시 로그인 불가 + 공유 회수, 7일 후 purgeDeletedUsers가 영구 삭제 */
  app.delete('/me', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    await ctx.sql.begin(async (tx) => {
      await tx`UPDATE users SET deleted_at = now() WHERE id = ${userId}`;
      await tx`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
      await tx`UPDATE shares SET revoked_at = now()
                WHERE (owner_id = ${userId} OR grantee_user_id = ${userId}) AND revoked_at IS NULL`;
    });
    clearAuthCookies(reply);
    return reply.code(202).send();
  });

  app.get('/me/sessions', async (req) => {
    const { userId, sessionId } = await ctx.auth(req);
    const rows = await ctx.sql<any[]>`
      SELECT id, client_type, device_name, created_at, last_used_at FROM sessions
       WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now() ORDER BY last_used_at DESC`;
    return { items: rows.map((r) => ({ ...r, current: r.id === sessionId })) };
  });

  app.delete<{ Params: { sessionId: string } }>('/me/sessions/:sessionId', async (req, reply) => {
    const { userId } = await ctx.auth(req);
    const id = parse(uuid, req.params.sessionId);
    await ctx.sql`UPDATE sessions SET revoked_at = now() WHERE id = ${id} AND user_id = ${userId}`;
    return reply.code(204).send();
  });

  app.get('/me/identities', async (req) => {
    const { userId } = await ctx.auth(req);
    const rows = await ctx.sql`SELECT provider, email, created_at AS linked_at FROM auth_identities WHERE user_id = ${userId}`;
    return { items: rows };
  });
}
