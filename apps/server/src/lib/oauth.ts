import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './errors.js';

export interface OAuthProfile {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}
export interface OAuthInput {
  id_token?: string;
  access_token?: string;
  code?: string;
  code_verifier?: string;
  redirect_uri?: string;
  nonce?: string;
}
export interface OAuthVerifier {
  verify(input: OAuthInput): Promise<OAuthProfile>;
}

const invalid = () => new HttpError(401, 'OAUTH_INVALID', '소셜 로그인 정보를 확인할 수 없어요');

export class GoogleVerifier implements OAuthVerifier {
  private jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  constructor(private clientIds: string[]) {}
  async verify(input: OAuthInput): Promise<OAuthProfile> {
    if (!input.id_token) throw invalid();
    const { payload } = await jwtVerify(input.id_token, this.jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: this.clientIds,
    }).catch(() => {
      throw invalid();
    });
    if (input.nonce && payload.nonce !== input.nonce) throw invalid();
    return {
      subject: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  }
}

/** Kakao: 클라이언트 SDK가 받은 access_token으로 사용자 정보 조회 */
export class KakaoVerifier implements OAuthVerifier {
  constructor(private fetchImpl: typeof fetch = fetch) {}
  async verify(input: OAuthInput): Promise<OAuthProfile> {
    if (!input.access_token) throw invalid();
    const res = await this.fetchImpl('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${input.access_token}` },
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      throw invalid();
    });
    if (!res.ok) throw invalid();
    const body = (await res.json()) as {
      id: number;
      kakao_account?: { email?: string; is_email_verified?: boolean; profile?: { nickname?: string } };
    };
    return {
      subject: String(body.id),
      email: body.kakao_account?.email ?? null,
      emailVerified: body.kakao_account?.is_email_verified === true,
      name: body.kakao_account?.profile?.nickname ?? null,
    };
  }
}
