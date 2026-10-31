import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import type { Sql } from '../db.js';
import { unauthorized } from './errors.js';

export interface AuthUser {
  userId: string;
  sessionId: string;
}

export const hashPassword = (pw: string) => hash(pw);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest();

export class TokenService {
  private key: Uint8Array;
  constructor(secret: string, private accessTtlSec: number) {
    this.key = new TextEncoder().encode(secret);
  }
  issueAccess(userId: string, sessionId: string): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSec}s`)
      .setIssuer('mappin')
      .sign(this.key);
  }
  async verifyAccess(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: 'mappin', algorithms: ['HS256'] });
      if (!payload.sub || typeof payload.sid !== 'string') throw new Error('bad claims');
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw unauthorized('로그인이 만료됐어요. 다시 로그인해 주세요');
    }
  }
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

/** 액세스 토큰 검증 + 세션이 살아있는지 확인 (로그아웃/탈퇴 즉시 반영) */
export async function authenticate(req: FastifyRequest, sql: Sql, tokens: TokenService): Promise<AuthUser> {
  const token = bearer(req);
  if (!token) throw unauthorized();
  const user = await tokens.verifyAccess(token);
  const [row] = await sql`
    SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ${user.sessionId} AND s.user_id = ${user.userId}
       AND s.revoked_at IS NULL AND s.expires_at > now() AND u.deleted_at IS NULL`;
  if (!row) throw unauthorized('로그인이 만료됐어요. 다시 로그인해 주세요');
  return user;
}

export async function optionalAuth(req: FastifyRequest, sql: Sql, tokens: TokenService): Promise<AuthUser | null> {
  if (!bearer(req)) return null;
  return authenticate(req, sql, tokens).catch(() => null);
}
