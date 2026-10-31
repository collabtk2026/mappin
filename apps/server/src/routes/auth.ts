import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.js';
import type { Sql } from '../db.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/auth.js';
import { HttpError, badRequest, conflict, unauthorized } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { parse } from '../lib/validate.js';

const REFRESH_COOKIE = 'mp_rt';
const CSRF_HEADER = 'x-mappin-csrf';
export const SESSION_HINT = 'mp_has_session';
export function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
  reply.clearCookie(SESSION_HINT, { path: '/' });
}

const agreements = z.object({
  terms: z.literal(true),
  privacy: z.literal(true),
  location: z.literal(true),
  age_14_or_over: z.literal(true),
  marketing: z.boolean().optional(),
});
const client = z.object({
  type: z.enum(['web', 'ios', 'android']),
  device_name: z.string().max(80).optional(),
  app_version: z.string().max(40).optional(),
});

export async function meJson(sql: Sql, userId: string) {
  const [u] = await sql<any[]>`
    SELECT u.*,
      (SELECT count(*)::int FROM places WHERE owner_id = u.id AND deleted_at IS NULL) AS places,
      (SELECT count(*)::int FROM categories WHERE owner_id = u.id AND deleted_at IS NULL) AS categories,
      (SELECT count(*)::int FROM tags WHERE owner_id = u.id AND deleted_at IS NULL) AS tags
    FROM users u WHERE u.id = ${userId}`;
  if (!u) throw unauthorized();
  return {
    id: u.id,
    email: u.email,
    email_verified: !!u.email_verified_at,
    display_name: u.display_name,
    handle: u.handle,
    avatar_url: u.avatar_url,
    locale: u.locale,
    timezone: u.timezone,
    has_password: !!u.password_hash,
    stats: { places: u.places, categories: u.categories, tags: u.tags },
    created_at: u.created_at,
  };
}

async function issueSession(ctx: Ctx, reply: FastifyReply, userId: string, c: z.infer<typeof client>) {
  const sessionId = newId();
  const refresh = randomToken();
  await ctx.sql`
    INSERT INTO sessions (id, user_id, refresh_token_hash, client_type, device_name, expires_at)
    VALUES (${sessionId}, ${userId}, ${sha256(refresh)}, ${c.type}, ${c.device_name ?? null},
            now() + make_interval(days => ${ctx.config.refreshTtlDays}))`;
  return tokensResponse(ctx, reply, userId, sessionId, refresh, c.type);
}

async function tokensResponse(ctx: Ctx, reply: FastifyReply, userId: string, sessionId: string, refresh: string, clientType: string) {
  const access = await ctx.tokens.issueAccess(userId, sessionId);
  if (clientType === 'web') {
    reply.setCookie(REFRESH_COOKIE, refresh, {
      httpOnly: true,
      secure: ctx.config.cookieSecure,
      sameSite: 'lax',
      path: '/v1/auth',
      maxAge: ctx.config.refreshTtlDays * 86400,
    });
    // JS가 읽을 수 있는 세션 힌트 (값 없음) — 비로그인 상태에서 불필요한 refresh 호출 방지
    reply.setCookie(SESSION_HINT, '1', { path: '/', sameSite: 'lax', secure: ctx.config.cookieSecure, maxAge: ctx.config.refreshTtlDays * 86400 });
  }
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ctx.config.accessTtlSec,
    refresh_token: clientType === 'web' ? undefined : refresh,
    user: await meJson(ctx.sql, userId),
  };
}

async function createEmailToken(ctx: Ctx, userId: string, purpose: 'verify_email' | 'reset_password', ttlMin: number) {
  const token = randomToken(24);
  await ctx.sql`INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
                VALUES (${sha256(token)}, ${userId}, ${purpose}, now() + make_interval(mins => ${ttlMin}))`;
  return token;
}

async function consumeEmailToken(ctx: Ctx, token: string, purpose: string): Promise<string> {
  const [row] = await ctx.sql<{ user_id: string }[]>`
    UPDATE email_tokens SET used_at = now()
     WHERE token_hash = ${sha256(token)} AND purpose = ${purpose} AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`;
  if (!row) throw badRequest('TOKEN_INVALID', '링크가 만료됐거나 이미 사용됐어요');
  return row.user_id;
}

/** 이메일로 초대받은 공유를 가입한 사용자에게 연결 */
async function claimEmailShares(sql: Sql, userId: string, email: string) {
  await sql`UPDATE shares SET grantee_type = 'user', grantee_user_id = ${userId}
             WHERE grantee_type = 'email' AND grantee_email = ${email} AND revoked_at IS NULL`;
}

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  app.post('/auth/signup', async (req, reply) => {
    const body = parse(
      z.object({
        email: z.string().email().max(254).transform((e) => e.trim().toLowerCase()),
        password: z.string().min(10, '비밀번호는 10자 이상이어야 해요').max(128),
        display_name: z.string().trim().min(1).max(40),
        agreements,
        client: client.default({ type: 'web' }),
      }),
      req.body,
    );
    const [exists] = await ctx.sql`SELECT 1 FROM users WHERE email = ${body.email}`;
    if (exists) throw conflict('EMAIL_TAKEN', '이미 가입된 이메일이에요');
    const userId = newId();
    await ctx.sql`INSERT INTO users (id, email, password_hash, display_name)
                  VALUES (${userId}, ${body.email}, ${await hashPassword(body.password)}, ${body.display_name})`;
    await claimEmailShares(ctx.sql, userId, body.email);
    const token = await createEmailToken(ctx, userId, 'verify_email', 60 * 24);
    await ctx.mailer.send({
      to: body.email,
      subject: '[Mappin] 이메일 인증',
      text: `아래 링크를 눌러 이메일 인증을 완료해 주세요.\n${ctx.config.publicWebUrl}/verify-email?token=${token}`,
    });
    reply.code(201);
    return issueSession(ctx, reply, userId, body.client);
  });

  app.post('/auth/login', async (req, reply) => {
    const body = parse(
      z.object({ email: z.string().transform((e) => e.trim().toLowerCase()), password: z.string(), client: client.default({ type: 'web' }) }),
      req.body,
    );
    const [u] = await ctx.sql<{ id: string; password_hash: string | null }[]>`
      SELECT id, password_hash FROM users WHERE email = ${body.email} AND deleted_at IS NULL`;
    if (!u?.password_hash || !(await verifyPassword(u.password_hash, body.password))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요');
    }
    return issueSession(ctx, reply, u.id, body.client);
  });

  app.post<{ Params: { provider: string } }>('/auth/oauth/:provider', async (req, reply) => {
    const provider = parse(z.enum(['google', 'apple', 'kakao', 'naver']), req.params.provider);
    const verifier = ctx.oauth[provider];
    if (!verifier) throw new HttpError(501, 'PROVIDER_NOT_CONFIGURED', '아직 지원하지 않는 로그인 방식이에요');
    const body = parse(
      z.object({
        id_token: z.string().optional(),
        access_token: z.string().optional(),
        code: z.string().optional(),
        code_verifier: z.string().optional(),
        redirect_uri: z.string().optional(),
        nonce: z.string().optional(),
        agreements: agreements.optional(),
        client: client.default({ type: 'web' }),
      }),
      req.body,
    );
    const profile = await verifier.verify(body);
    const [ident] = await ctx.sql<{ user_id: string }[]>`
      SELECT i.user_id FROM auth_identities i JOIN users u ON u.id = i.user_id
       WHERE i.provider = ${provider} AND i.subject = ${profile.subject} AND u.deleted_at IS NULL`;
    let userId = ident?.user_id;
    if (!userId) {
      const email = profile.email?.toLowerCase() ?? null;
      const [byEmail] = email && profile.emailVerified
        ? await ctx.sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email} AND deleted_at IS NULL`
        : [];
      if (byEmail) {
        userId = byEmail.id;
      } else {
        if (!body.agreements) throw new HttpError(428, 'AGREEMENTS_REQUIRED', '약관 동의가 필요해요');
        userId = newId();
        await ctx.sql`INSERT INTO users (id, email, email_verified_at, display_name)
                      VALUES (${userId}, ${email}, ${profile.emailVerified ? new Date() : null}, ${profile.name ?? '새 사용자'})`;
        if (email) await claimEmailShares(ctx.sql, userId, email);
      }
      await ctx.sql`INSERT INTO auth_identities (id, user_id, provider, subject, email)
                    VALUES (${newId()}, ${userId}, ${provider}, ${profile.subject}, ${email})`;
    }
    return issueSession(ctx, reply, userId, body.client);
  });

  app.post('/auth/refresh', async (req: FastifyRequest, reply) => {
    const body = parse(z.object({ refresh_token: z.string().optional() }), req.body);
    let token = body.refresh_token;
    let clientType = 'mobile';
    if (!token) {
      token = req.cookies[REFRESH_COOKIE];
      clientType = 'web';
      if (token && req.headers[CSRF_HEADER] !== '1') throw new HttpError(403, 'CSRF', '잘못된 요청이에요');
    }
    if (!token) throw unauthorized();
    const h = sha256(token);
    const [s] = await ctx.sql<{ id: string; user_id: string; client_type: string }[]>`
      SELECT s.id, s.user_id, s.client_type FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.refresh_token_hash = ${h} AND s.revoked_at IS NULL AND s.expires_at > now() AND u.deleted_at IS NULL`;
    if (!s) {
      // 이미 회전된 토큰을 다시 쓰면 탈취로 보고 세션 전체를 폐기
      await ctx.sql`UPDATE sessions SET revoked_at = now() WHERE previous_token_hash = ${h} AND revoked_at IS NULL`;
      if (clientType === 'web') clearAuthCookies(reply);
      throw unauthorized('로그인이 만료됐어요. 다시 로그인해 주세요');
    }
    const next = randomToken();
    await ctx.sql`UPDATE sessions SET previous_token_hash = refresh_token_hash, refresh_token_hash = ${sha256(next)},
                  last_used_at = now() WHERE id = ${s.id}`;
    return tokensResponse(ctx, reply, s.user_id, s.id, next, s.client_type);
  });

  app.post('/auth/logout', async (req, reply) => {
    const user = await ctx.auth(req);
    await ctx.sql`UPDATE sessions SET revoked_at = now() WHERE id = ${user.sessionId}`;
    clearAuthCookies(reply);
    return reply.code(204).send();
  });

  app.post('/auth/password/forgot', async (req, reply) => {
    const { email } = parse(z.object({ email: z.string().email().transform((e) => e.toLowerCase()) }), req.body);
    const [u] = await ctx.sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email} AND deleted_at IS NULL`;
    if (u) {
      const token = await createEmailToken(ctx, u.id, 'reset_password', 60);
      await ctx.mailer.send({
        to: email,
        subject: '[Mappin] 비밀번호 재설정',
        text: `아래 링크에서 새 비밀번호를 설정해 주세요. (1시간 동안 유효)\n${ctx.config.publicWebUrl}/reset-password?token=${token}`,
      });
    }
    return reply.code(202).send();
  });

  app.post('/auth/password/reset', async (req, reply) => {
    const body = parse(z.object({ token: z.string(), new_password: z.string().min(10).max(128) }), req.body);
    const userId = await consumeEmailToken(ctx, body.token, 'reset_password');
    await ctx.sql`UPDATE users SET password_hash = ${await hashPassword(body.new_password)} WHERE id = ${userId}`;
    await ctx.sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    return reply.code(204).send();
  });

  app.post('/auth/email/verify', async (req, reply) => {
    const body = parse(z.object({ token: z.string() }), req.body);
    const userId = await consumeEmailToken(ctx, body.token, 'verify_email');
    await ctx.sql`UPDATE users SET email_verified_at = now() WHERE id = ${userId}`;
    return reply.code(204).send();
  });
}
