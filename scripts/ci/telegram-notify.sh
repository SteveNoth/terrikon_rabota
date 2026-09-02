#!/usr/bin/env bash
# Рассылка Telegram после парсера. Не в двери приёма пачки: там 10 секунд на запрос.
# Вызывается шагом GitHub Actions. Секреты: CRON_SECRET, SITE_URL.
set -euo pipefail

SITE_URL="${SITE_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$SITE_URL" ] || [ -z "$CRON_SECRET" ]; then
  echo "SITE_URL или CRON_SECRET пусты — рассылку пропускаю."
  exit 0
fi

BASE="${SITE_URL%/}"
URL="$BASE/api/telegram/notify"

for pass in 1 2 3 4 5 6; do
  echo "Telegram notify, проход $pass → $URL"
  http_code=$(curl -sS -o /tmp/telegram-notify.json -w "%{http_code}" -X POST "$URL" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    --max-time 20 \
    -d '{"limit":40}' || true)
  if [ ! -f /tmp/telegram-notify.json ]; then
    echo "Нет тела ответа (HTTP $http_code)"
    exit 0
  fi
  cat /tmp/telegram-notify.json
  echo
  if [ "$http_code" != "200" ]; then
    echo "HTTP $http_code — рассылка не принята. Парсер уже отработал, шаг не валит задачу."
    exit 0
  fi
  if grep -q '"done":true' /tmp/telegram-notify.json; then
    echo "Рассылка закончена."
    exit 0
  fi
  sleep 2
done

echo "За 6 проходов очередь не опустела — следующие вакансии уйдут на следующем запуске парсера."
exit 0
