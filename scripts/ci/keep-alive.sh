#!/usr/bin/env bash
# Будит бесплатный проект Supabase через публичный /api/health.
# Пауза после простоя: первый запрос может идти 30–90 секунд — поэтому несколько попыток.
set -euo pipefail

SITE_URL="${SITE_URL:-}"
if [ -z "$SITE_URL" ]; then
  echo "SITE_URL пуст — keep-alive пропускаю."
  exit 0
fi

BASE="${SITE_URL%/}"
URL="$BASE/api/health"

for pass in 1 2 3 4; do
  echo "Keep-alive, попытка $pass → $URL"
  http_code=$(curl -sS -o /tmp/health.json -w "%{http_code}" --max-time 60 "$URL" || true)
  if [ -f /tmp/health.json ]; then
    cat /tmp/health.json
    echo
  fi
  if [ "$http_code" = "200" ] || [ "$http_code" = "503" ]; then
    echo "HTTP $http_code — база получила запрос (503 значит «нездорова», но проект уже не спит)."
    exit 0
  fi
  echo "HTTP ${http_code:-нет} — жду и повторяю."
  sleep 20
done

echo "За 4 попытки /api/health не ответил. Возможно, проект на паузе дольше обычного или SITE_URL неверный."
exit 1
