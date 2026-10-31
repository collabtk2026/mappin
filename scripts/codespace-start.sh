#!/usr/bin/env bash
# Codespaces 시작 스크립트: DB 준비를 기다린 뒤 마이그레이션하고 API+웹을 띄운다.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "${CODESPACE_NAME:-}" ]; then
  # 공유 링크 등이 휴대폰에서도 열리는 실제 주소를 쓰도록
  export PUBLIC_WEB_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
for i in $(seq 1 30); do
  pnpm db:migrate && break
  echo "DB 대기 중… ($i)"; sleep 2
done
exec pnpm dev
