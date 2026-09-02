#!/usr/bin/env bash
# Еженедельный отчёт о размере базы в Telegram.
set -euo pipefail

SITE_URL="${SITE_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$SITE_URL" ] || [ -z "$CRON_SECRET" ]; then
  echo "SITE_URL или CRON_SECRET пусты — отчёт о размере пропускаю."
  exit 0
fi

BASE="${SITE_URL%/}"
URL="$BASE/api/ops/size"

echo "DB size report → $URL"
http_code=$(curl -sS -o /tmp/size.json -w "%{http_code}" --max-time 40 \
  -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  "$URL" || true)

if [ -f /tmp/size.json ]; then
  cat /tmp/size.json
  echo
fi

if [ "$http_code" != "200" ]; then
  echo "HTTP ${http_code:-нет} — отчёт не принят."
  exit 1
fi

echo "Отчёт о размере записан."
exit 0
