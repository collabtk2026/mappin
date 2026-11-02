#!/usr/bin/env bash
# DB 백업 (매일 실행 권장, 14일 보관)
#   crontab -e →  30 3 * * * /path/to/mappin/deploy/backup.sh >> /var/log/mappin-backup.log 2>&1
# 복원: gunzip -c backups/mappin-YYYYmmdd-HHMM.sql.gz | docker compose exec -T db psql -U mappin -d mappin
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
f="backups/mappin-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U mappin -d mappin --no-owner | gzip > "$f"
find backups -name 'mappin-*.sql.gz' -mtime +"${KEEP_DAYS:-14}" -delete
echo "backup → $f ($(du -h "$f" | cut -f1))"
