import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createSql } from '../src/db.js';
import { TokenService } from '../src/lib/auth.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import { migrate } from '../src/migrate.js';
import { FakeGeo, TEST_DB } from './helpers.js';

describe('rate limit', () => {
  it('limits auth endpoints per IP and returns problem-style 429', async () => {
    const sql = createSql(TEST_DB);
    await migrate(sql, () => {});
    const config = { ...loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv), rateLimit: true };
    const app = await buildApp({ sql, config, tokens: new TokenService(config.jwtSecret, 900), geo: new FakeGeo(), mailer: new MemoryMailer(), oauth: {} });
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/auth/password/forgot', payload: { email: 'x@example.com' } });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 20).every((c) => c === 202)).toBe(true);
    expect(codes.at(-1)).toBe(429);
    const last = await app.inject({ method: 'POST', url: '/v1/auth/password/forgot', payload: { email: 'x@example.com' } });
    expect(last.json().code).toBe('RATE_LIMITED');
    // 다른 그룹(일반 API)은 별도 한도
    expect((await app.inject({ method: 'GET', url: '/v1/icons' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    await app.close();
    await sql.end();
  });
});
