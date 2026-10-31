/**
 * @mappin/api-client — api/openapi.yaml에서 생성한 타입 + 가벼운 fetch 클라이언트.
 * 웹(Next.js)과 React Native가 그대로 공유한다. (`pnpm gen`으로 schema.d.ts 재생성)
 */
import type { components, paths } from './schema';

export type { components, paths };
type S = components['schemas'];
export type Me = S['Me'];
export type UserPublic = S['UserPublic'];
export type Place = S['Place'];
export type PlaceSummary = S['PlaceSummary'];
export type PlaceCreate = S['PlaceCreate'];
export type PlaceUpdate = S['PlaceUpdate'];
export type PlaceTag = S['PlaceTag'];
export type Note = S['Note'];
export type NoteRevision = S['NoteRevision'];
export type TimelineItem = S['TimelineItem'];
export type Tag = S['Tag'];
export type Category = S['Category'];
export type Icon = S['Icon'];
export type IconRef = S['IconRef'];
export type MapConfig = S['MapConfig'];
export type ProviderConfig = S['ProviderConfig'];
export type PlaceCandidate = S['PlaceCandidate'];
export type Share = S['Share'];
export type ShareCreate = S['ShareCreate'];
export type PublicShareView = S['PublicShareView'];
export type Job = S['Job'];
export type AuthTokens = S['AuthTokens'];
export type Problem = S['Problem'];
export type Agreements = S['Agreements'];

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public problem?: Problem,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  baseUrl: string;
  getToken(): string | null;
  /** 401일 때 한 번 호출 — 새 access token을 돌려주면 재시도 */
  refresh?(): Promise<string | null>;
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | string[] | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: boolean;
}

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function createClient(opts: ClientOptions) {
  const f = opts.fetch ?? fetch;

  async function send(method: string, path: string, o: RequestOptions, token: string | null) {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (o.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(o.body);
    }
    return f(`${opts.baseUrl}${path}${buildQuery(o.query)}`, { method, headers, body, credentials: opts.credentials ?? 'same-origin' });
  }

  async function request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    let res = await send(method, path, o, opts.getToken());
    if (res.status === 401 && opts.refresh) {
      const t = await opts.refresh();
      if (t) res = await send(method, path, o, t);
    }
    if (!res.ok) {
      let problem: Problem | undefined;
      try {
        problem = (await res.json()) as Problem;
      } catch {}
      throw new ApiError(res.status, problem?.code ?? 'HTTP_ERROR', problem?.title ?? res.statusText, problem);
    }
    if (o.raw) return res as unknown as T;
    if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    request,
    get: <T>(p: string, o?: RequestOptions) => request<T>('GET', p, o),
    post: <T>(p: string, body?: unknown, o?: RequestOptions) => request<T>('POST', p, { ...o, body: body ?? {} }),
    patch: <T>(p: string, body: unknown, o?: RequestOptions) => request<T>('PATCH', p, { ...o, body }),
    put: <T>(p: string, body?: unknown, o?: RequestOptions) => request<T>('PUT', p, { ...o, body: body ?? {} }),
    del: <T = void>(p: string, o?: RequestOptions) => request<T>('DELETE', p, o),
  };
}

export type ApiClient = ReturnType<typeof createClient>;
