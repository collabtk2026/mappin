export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  accessTtlSec: number;
  refreshTtlDays: number;
  publicWebUrl: string;
  cookieSecure: boolean;
  mapStyle: 'openfreemap' | 'demo';
  kakaoJsKey: string | null;
  kakaoRestKey: string | null;
  googleClientIds: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const prod = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (prod ? '' : 'dev-only-secret-change-me-dev-only-secret');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return {
    port: Number(env.PORT ?? 8080),
    databaseUrl: env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/mappin',
    jwtSecret,
    accessTtlSec: Number(env.ACCESS_TTL_SEC ?? 900),
    refreshTtlDays: Number(env.REFRESH_TTL_DAYS ?? 30),
    publicWebUrl: env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
    cookieSecure: prod,
    mapStyle: env.MAP_STYLE === 'demo' ? 'demo' : 'openfreemap',
    kakaoJsKey: env.KAKAO_JS_KEY || null,
    kakaoRestKey: env.KAKAO_REST_KEY || null,
    googleClientIds: (env.GOOGLE_CLIENT_IDS ?? '').split(',').filter(Boolean),
  };
}
