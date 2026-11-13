#!/usr/bin/env bash
# 从备份恢复：bash scripts/restore.sh server/backups/shiju-YYYYmmdd-HHMMSS.sql.gz
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="${1:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "用法：bash scripts/restore.sh <backup.sql.gz>" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

DB_NAME="${DB_NAME:-shiju}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"

read -r -p "将覆盖数据库 ${DB_NAME}，确认继续？输入 yes：" ANSWER
[[ "$ANSWER" == "yes" ]] || { echo "已取消"; exit 1; }

gunzip -c "$FILE" | MYSQL_PWD="${DB_PASSWORD:-}" mysql \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --default-character-set=utf8mb4 "$DB_NAME"

echo "[restore] 完成：$FILE -> $DB_NAME"
