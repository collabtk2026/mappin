#!/usr/bin/env bash
# Mappin 서버 설치/업데이트
#   처음:   DOMAIN=map.example.com ./deploy/setup.sh
#   IP 시험: DOMAIN=:80 PUBLIC_WEB_URL=http://1.2.3.4 COOKIE_SECURE=false ./deploy/setup.sh
#   업데이트: git pull && ./deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

command -v docker >/dev/null || { echo "Docker가 필요해요: https://docs.docker.com/engine/install/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2가 필요해요" >&2; exit 1; }

if [ ! -f .env ]; then
  : "${DOMAIN:?처음 설치할 때는 DOMAIN을 지정해 주세요 (예: DOMAIN=map.example.com ./deploy/setup.sh)}"
  if [ "${DOMAIN#:}" != "$DOMAIN" ]; then default_url="http://localhost"; else default_url="https://$DOMAIN"; fi
  rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48; }
  sed -e "s#^DOMAIN=.*#DOMAIN=$DOMAIN#" \
      -e "s#^PUBLIC_WEB_URL=.*#PUBLIC_WEB_URL=${PUBLIC_WEB_URL:-$default_url}#" \
      -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(rand)#" \
      -e "s#^JWT_SECRET=.*#JWT_SECRET=$(rand)#" \
      -e "s#^COOKIE_SECURE=.*#COOKIE_SECURE=${COOKIE_SECURE:-true}#" \
      -e "s#^MAP_STYLE=.*#MAP_STYLE=${MAP_STYLE:-openfreemap}#" \
      .env.example > .env
  chmod 600 .env
  echo "→ deploy/.env 를 만들었어요 (비밀번호·JWT 비밀키 자동 생성). 백업해 두세요."
fi

docker compose up -d --build
docker compose ps

url=$(grep '^PUBLIC_WEB_URL=' .env | cut -d= -f2-)
echo "API 상태 확인 중…"
for i in $(seq 1 60); do
  if docker compose exec -T api node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "✓ 실행 중 → $url"
    exit 0
  fi
  sleep 2
done
echo "API가 응답하지 않아요. 로그 확인: cd deploy && docker compose logs api" >&2
exit 1
