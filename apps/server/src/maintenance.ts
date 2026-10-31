import type { Sql } from './db.js';

/** 탈퇴 유예(7일)가 지난 계정과 휴지통 30일이 지난 장소를 영구 삭제 */
export async function purgeDeletedUsers(sql: Sql) {
  await sql`DELETE FROM users WHERE deleted_at < now() - interval '7 days'`;
  await sql`DELETE FROM places WHERE deleted_at < now() - interval '30 days'`;
  await sql`DELETE FROM idempotency_keys WHERE created_at < now() - interval '1 day'`;
  await sql`DELETE FROM email_tokens WHERE expires_at < now() - interval '1 day'`;
}
