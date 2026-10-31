'use client';
import { ApiError, createClient } from '@mappin/api-client';

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<(t: string | null) => void>();

export function setAccessToken(t: string | null) {
  accessToken = t;
  listeners.forEach((l) => l(t));
}
export const onTokenChange = (l: (t: string | null) => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** HttpOnly refresh 쿠키로 access token 재발급 (동시 호출은 하나로 합침) */
export function refreshAccess(): Promise<string | null> {
  if (typeof document !== 'undefined' && !document.cookie.includes('mp_has_session=')) return Promise.resolve(null);
  refreshing ??= fetch('/v1/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mappin-csrf': '1' }, body: '{}' })
    .then(async (r) => {
      if (!r.ok) return null;
      const body = await r.json();
      return body.access_token as string;
    })
    .catch(() => null)
    .then((t) => {
      setAccessToken(t);
      return t;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export const api = createClient({ baseUrl: '/v1', getToken: () => accessToken, refresh: refreshAccess });
export { ApiError };

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.problem?.errors?.[0]?.message && e.code === 'VALIDATION_FAILED' ? `${e.message}: ${e.problem.errors[0].message}` : e.message;
  return '네트워크 연결을 확인해 주세요';
}
