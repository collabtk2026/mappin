import { buildApp } from './app.js';
import { loadConfig, loadDotEnv } from './config.js';
import { createSql } from './db.js';
import { TokenService } from './lib/auth.js';
import { KakaoGeo, NominatimGeo } from './lib/geo.js';
import { MemoryMailer } from './lib/mailer.js';
import { GoogleVerifier, KakaoVerifier } from './lib/oauth.js';
import { migrate } from './migrate.js';
import { purgeDeletedUsers } from './maintenance.js';

loadDotEnv();
const config = loadConfig();
const sql = createSql(config.databaseUrl);
await migrate(sql);

const app = await buildApp(
  {
    sql,
    config,
    tokens: new TokenService(config.jwtSecret, config.accessTtlSec),
    geo: config.kakaoRestKey ? new KakaoGeo(config.kakaoRestKey) : new NominatimGeo(),
    mailer: new MemoryMailer((m) => console.log(m)),
    oauth: {
      ...(config.googleClientIds.length ? { google: new GoogleVerifier(config.googleClientIds) } : {}),
      kakao: new KakaoVerifier(),
    },
  },
  { logger: true },
);

setInterval(() => purgeDeletedUsers(sql).catch((e) => app.log.error(e)), 60 * 60 * 1000).unref();
await app.listen({ port: config.port, host: '0.0.0.0' });
