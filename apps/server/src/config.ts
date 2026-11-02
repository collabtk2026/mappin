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
  smtpUrl: string | null;
  mailFrom: string;
  rateLimit: boolean;
}

/** 저장소 루트의 .env를 읽는다 (있을 때만, 이미 설정된 환경변수가 우선) */
export function loadDotEnv() {
  const file = new URL('../../../.env', import.meta.url);
  try {
    process.loadEnvFile(file);
  } catch {}
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const prod = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (prod ? '' : 'dev-only-secret-change-me-dev-only-secret');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return {
    port: Number(env.PORT ?? 8080),
    databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/mappin',
    jwtSecret,
    accessTtlSec: Number(env.ACCESS_TTL_SEC ?? 900),
    refreshTtlDays: Number(env.REFRESH_TTL_DAYS ?? 30),
    publicWebUrl: env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
    // HTTPS 없이 IP로 시험할 때만 COOKIE_SECURE=false
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : prod,
    mapStyle: env.MAP_STYLE === 'demo' ? 'demo' : 'openfreemap',
    kakaoJsKey: env.KAKAO_JS_KEY || null,
    kakaoRestKey: env.KAKAO_REST_KEY || null,
    googleClientIds: (env.GOOGLE_CLIENT_IDS ?? '').split(',').filter(Boolean),
    smtpUrl: env.SMTP_URL || null,
    mailFrom: env.MAIL_FROM ?? 'Mappin <no-reply@localhost>',
    rateLimit: env.RATE_LIMIT !== 'off' && env.NODE_ENV !== 'test',
  };
}
