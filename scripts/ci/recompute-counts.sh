#!/usr/bin/env bash
# Пересчёт счётчиков через сайт, без npm ci каждый час.
set -euo pipefail

SITE_URL="${SITE_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$SITE_URL" ] || [ -z "$CRON_SECRET" ]; then
  echo "SITE_URL или CRON_SECRET пусты — пересчёт счётчиков пропускаю."
  exit 0
fi

BASE="${SITE_URL%/}"
URL="$BASE/api/ops/counts"

echo "Vacancy counts → $URL"
http_code=$(curl -sS -o /tmp/counts.json -w "%{http_code}" --max-time 40 \
  -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  "$URL" || true)

if [ -f /tmp/counts.json ]; then
  cat /tmp/counts.json
  echo
fi

if [ "$http_code" != "200" ]; then
  echo "HTTP ${http_code:-нет} — счётчики не записались."
  exit 1
fi

echo "Счётчики пересчитаны."
exit 0
