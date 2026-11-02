import { createRequire } from 'node:module';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { Sql } from './db.js';
import type { Config } from './config.js';
import { TokenService, authenticate, type AuthUser } from './lib/auth.js';
import { HttpError } from './lib/errors.js';
import type { GeoProvider } from './lib/geo.js';
import type { Mailer } from './lib/mailer.js';
import type { OAuthVerifier } from './lib/oauth.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { placeRoutes } from './routes/places.js';
import { noteRoutes } from './routes/notes.js';
import { tagRoutes } from './routes/tags.js';
import { categoryRoutes } from './routes/categories.js';
import { catalogRoutes } from './routes/catalog.js';
import { shareRoutes } from './routes/shares.js';
import { exportRoutes } from './routes/export.js';

const require = createRequire(import.meta.url);

export interface Deps {
  sql: Sql;
  config: Config;
  tokens: TokenService;
  geo: GeoProvider;
  mailer: Mailer;
  oauth: Partial<Record<'google' | 'apple' | 'kakao' | 'naver', OAuthVerifier>>;
}

export interface Ctx extends Deps {
  auth(req: FastifyRequest): Promise<AuthUser>;
}

export async function buildApp(deps: Deps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });
  await app.register(cookie);
  if (deps.config.rateLimit) {
    // IP당 기본 300회/분, 로그인·가입·메일 발송(무차별 대입 대상)과 외부 지도 프록시는 더 엄격하게
    const group = (url: string) =>
      /^\/v1\/auth\/(login|signup|oauth|password|email)/.test(url) ? 'auth' : url.startsWith('/v1/geo/') ? 'geo' : 'api';
    await app.register(rateLimit, {
      max: (req) => ({ auth: 20, geo: 60, api: 300 })[group(req.url)],
      timeWindow: '1 minute',
      keyGenerator: (req) => `${req.ip}:${group(req.url)}`,
      allowList: (req) => req.url === '/healthz',
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: `요청이 너무 많아요. ${Math.ceil(ctx.ttl / 1000)}초 후에 다시 시도해 주세요`,
      }),
    });
  }

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) {
      return problem(reply, err.status, err.code, err.message, err.errors);
    }
    if (err.validation) return problem(reply, 422, 'VALIDATION_FAILED', err.message);
    if (err.statusCode && err.statusCode < 500) return problem(reply, err.statusCode, err.code ?? 'BAD_REQUEST', err.message);
    if (err.code === '23505') return problem(reply, 409, 'DUPLICATE', '이미 같은 이름이 있어요');
    if (err.code === '23503') return problem(reply, 422, 'INVALID_REFERENCE', '참조하는 항목을 찾을 수 없어요');
    req.log.error(err);
    if (process.env.MAPPIN_ERROR_LOG) require('node:fs').appendFileSync(process.env.MAPPIN_ERROR_LOG, `${req.method} ${req.url}\n${err.stack}\n\n`);
    return problem(reply, 500, 'INTERNAL', '잠시 후 다시 시도해 주세요');
  });
  app.setNotFoundHandler((req, reply) => problem(reply, 404, 'NOT_FOUND', '요청한 경로가 없어요'));

  const ctx: Ctx = { ...deps, auth: (req) => authenticate(req, deps.sql, deps.tokens) };

  app.get('/healthz', async () => ({ ok: true }));
  await app.register(
    async (v1) => {
      authRoutes(v1, ctx);
      meRoutes(v1, ctx);
      placeRoutes(v1, ctx);
      noteRoutes(v1, ctx);
      tagRoutes(v1, ctx);
      categoryRoutes(v1, ctx);
      catalogRoutes(v1, ctx);
      shareRoutes(v1, ctx);
      exportRoutes(v1, ctx);
    },
    { prefix: '/v1' },
  );
  return app;
}

export function problem(reply: FastifyReply, status: number, code: string, title: string, errors?: unknown) {
  return reply
    .code(status)
    .type('application/problem+json')
    .send({ type: `https://api.mappin.app/problems/${code.toLowerCase().replaceAll('_', '-')}`, title, status, code, errors });
}

/** Idempotency-Key 처리: 같은 키 재요청이면 저장된 응답 반환 */
export async function idempotent(
  ctx: Ctx,
  req: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  run: () => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>,
) {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !key) {
    const r = await run();
    if (r.headers) reply.headers(r.headers);
    return reply.code(r.status).send(r.body);
  }
  const [hit] = await ctx.sql<{ status_code: number; response: unknown }[]>`
    SELECT status_code, response FROM idempotency_keys WHERE user_id = ${userId} AND key = ${key}`;
  if (hit) return reply.code(hit.status_code).header('Idempotent-Replayed', 'true').send(hit.response);
  const r = await run();
  await ctx.sql`
    INSERT INTO idempotency_keys (user_id, key, request_hash, response, status_code)
    VALUES (${userId}, ${key}, ${Buffer.from(req.url)}, ${ctx.sql.json(JSON.parse(JSON.stringify(r.body)))}, ${r.status})
    ON CONFLICT DO NOTHING`;
  if (r.headers) reply.headers(r.headers);
  return reply.code(r.status).send(r.body);
}
