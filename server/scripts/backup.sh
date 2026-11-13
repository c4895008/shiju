#!/usr/bin/env bash
# 备份 shiju 数据库：mysqldump 单事务 + gzip，落到 server/backups/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

DB_NAME="${DB_NAME:-shiju}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"

OUT_DIR="${ROOT}/backups"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${OUT_DIR}/${DB_NAME}-${STAMP}.sql.gz"

MYSQL_PWD="${DB_PASSWORD:-}" mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --single-transaction --quick --triggers \
  --default-character-set=utf8mb4 \
  --set-gtid-purged=OFF \
  "$DB_NAME" | gzip >"$OUT"

echo "[backup] 已生成 ${OUT} ($(du -h "$OUT" | cut -f1))"

# 只保留最近 14 份
ls -1t "$OUT_DIR"/"${DB_NAME}"-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
