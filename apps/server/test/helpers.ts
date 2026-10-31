import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createSql, type Sql } from '../src/db.js';
import { TokenService } from '../src/lib/auth.js';
import type { GeoProvider } from '../src/lib/geo.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import type { OAuthVerifier } from '../src/lib/oauth.js';
import { migrate } from '../src/migrate.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/mappin_test';

export class FakeGeo implements GeoProvider {
  id = 'osm' as const;
  attribution = 'test';
  async search(q: string) {
    return {
      items: [
        { provider: 'kakao' as const, externalId: 'K1', name: `${q} 본점`, lat: 37.5446, lng: 127.0559, address: '서울 성동구 성수이로 1', categoryLabel: '음식점 > 일식', distanceM: 12 },
        { provider: 'kakao' as const, externalId: 'K2', name: `${q} 2호점`, lat: 37.55, lng: 127.06, address: null, categoryLabel: '카페', distanceM: 800 },
      ],
      hasMore: false,
    };
  }
  async reverse() {
    return { road: '서울특별시 성동구 성수이로 78', jibun: '성수동2가 315-61', postal_code: '04782', region_1: '서울특별시', region_2: '성동구', region_3: '성수동2가', country_code: 'KR', source: 'kakao' as const };
  }
}

export class FakeOAuth implements OAuthVerifier {
  async verify(input: { access_token?: string }) {
    const [subject, email] = (input.access_token ?? '').split('|');
    if (!subject) throw Object.assign(new Error('bad'), { statusCode: 401 });
    return { subject, email: email ?? null, emailVerified: true, name: '카카오유저' };
  }
}

export interface TestEnv {
  app: FastifyInstance;
  sql: Sql;
  mailer: MemoryMailer;
  close(): Promise<void>;
}

export async function setup(): Promise<TestEnv> {
  const sql = createSql(TEST_DB);
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(sql, () => {});
  const config = { ...loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv), databaseUrl: TEST_DB, publicWebUrl: 'http://web.test' };
  const mailer = new MemoryMailer();
  const app = await buildApp({
    sql,
    config,
    tokens: new TokenService(config.jwtSecret, config.accessTtlSec),
    geo: new FakeGeo(),
    mailer,
    oauth: { kakao: new FakeOAuth() },
  });
  return { app, sql, mailer, close: async () => { await app.close(); await sql.end(); } };
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Record<string, any>;
}

export class Client {
  constructor(private app: FastifyInstance, public token?: string, public userId?: string) {}
  async req<T = any>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const r = await this.app.inject({
      method: method as any,
      url: url.startsWith('/v1') ? url : `/v1${url}`,
      payload: body as any,
      headers: { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...headers },
    });
    let parsed: any = r.body;
    try {
      parsed = r.body ? JSON.parse(r.body) : undefined;
    } catch {}
    return { status: r.statusCode, body: parsed, headers: r.headers };
  }
  get = <T = any>(u: string, h?: Record<string, string>) => this.req<T>('GET', u, undefined, h);
  post = <T = any>(u: string, b?: unknown, h?: Record<string, string>) => this.req<T>('POST', u, b ?? {}, h);
  patch = <T = any>(u: string, b?: unknown, h?: Record<string, string>) => this.req<T>('PATCH', u, b ?? {}, h);
  put = <T = any>(u: string, b?: unknown) => this.req<T>('PUT', u, b ?? {});
  del = <T = any>(u: string) => this.req<T>('DELETE', u);
}

export const AGREE = { terms: true, privacy: true, location: true, age_14_or_over: true };

export async function signup(app: FastifyInstance, email: string, name = '테스터', client: 'web' | 'ios' = 'ios') {
  const anon = new Client(app);
  const r = await anon.post('/auth/signup', { email, password: 'correct-horse-1', display_name: name, agreements: AGREE, client: { type: client } });
  if (r.status !== 201) throw new Error(`signup failed ${r.status} ${JSON.stringify(r.body)}`);
  return { client: new Client(app, r.body.access_token, r.body.user.id), res: r };
}
