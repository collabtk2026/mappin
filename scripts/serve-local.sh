#!/usr/bin/env bash
# 로컬 실행 (빌드된 웹 + API). 사용: scripts/serve-local.sh [로그 디렉터리]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${1:-$ROOT/.logs}"
mkdir -p "$LOG"
# 이미 떠 있는 서버(3000/8080)를 먼저 종료
for port in 8080 3000; do
  fuser -k "$port/tcp" >/dev/null 2>&1 || true
done
sleep 1
export DATABASE_URL="${DATABASE_URL:-postgres://postgres@127.0.0.1:5432/mappin}"
export MAP_STYLE="${MAP_STYLE:-openfreemap}"
export PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-http://localhost:3000}"
(cd "$ROOT/apps/server" && PORT=8080 nohup npx tsx src/index.ts >"$LOG/api.log" 2>&1 &)
(cd "$ROOT/apps/web" && API_URL=http://127.0.0.1:8080 nohup npx next start -p 3000 >"$LOG/web.log" 2>&1 &)
for i in $(seq 1 30); do
  curl -sf http://localhost:8080/healthz >/dev/null && curl -sf -o /dev/null http://localhost:3000/login && { echo "ready → http://localhost:3000"; exit 0; }
  sleep 1
done
echo "servers did not start; see $LOG" >&2
exit 1
