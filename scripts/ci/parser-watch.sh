#!/usr/bin/env bash
# Смотрит парсеры и при поломке просит сайт написать в Telegram.
set -euo pipefail

SITE_URL="${SITE_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$SITE_URL" ] || [ -z "$CRON_SECRET" ]; then
  echo "SITE_URL или CRON_SECRET пусты — проверку парсеров пропускаю."
  exit 0
fi

BASE="${SITE_URL%/}"
URL="$BASE/api/ops/watch"

echo "Parser watch → $URL"
http_code=$(curl -sS -o /tmp/watch.json -w "%{http_code}" --max-time 40 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  "$URL" || true)

if [ -f /tmp/watch.json ]; then
  cat /tmp/watch.json
  echo
fi

if [ "$http_code" != "200" ]; then
  echo "HTTP ${http_code:-нет} — watchdog не принят. Шаг не валит Actions, чтобы не маскировать парсеры."
  exit 0
fi

echo "Watch завершён."
exit 0
