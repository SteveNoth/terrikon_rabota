#!/usr/bin/env bash
# Смотрит парсеры. Если затихли — запускает их workflow и просит сайт
# написать в Telegram. SITE_URL пустой больше не маскируем зелёной галочкой.
set -euo pipefail

SITE_URL="${SITE_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-master}"

if [ -z "$SITE_URL" ]; then
  echo "SITE_URL пуст — watchdog не знает, какой сайт проверять."
  exit 1
fi

BASE="${SITE_URL%/}"
HEALTH_URL="$BASE/api/health"

echo "Health → $HEALTH_URL"
health_code=$(curl -sS -o /tmp/health.json -w "%{http_code}" --max-time 40 "$HEALTH_URL" || true)
if [ -f /tmp/health.json ]; then
  cat /tmp/health.json
  echo
fi

if [ "$health_code" != "200" ] && [ "$health_code" != "503" ]; then
  echo "HTTP ${health_code:-нет} на /api/health — сайт не ответил."
  exit 1
fi

if command -v gh >/dev/null 2>&1 && { [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; }; then
  stale_file=$(mktemp)
  python3 scripts/parser_lookback.py --stale-workflows < /tmp/health.json > "$stale_file" || true
  if [ -s "$stale_file" ]; then
    echo "Затихшие парсеры — запускаю workflow:"
    cat "$stale_file"
    while IFS= read -r workflow; do
      [ -z "$workflow" ] && continue
      echo "gh workflow run $workflow --ref $DEFAULT_BRANCH"
      gh workflow run "$workflow" --ref "$DEFAULT_BRANCH" || echo "Не удалось запустить $workflow"
    done < "$stale_file"
  else
    echo "По health затихших парсеров нет."
  fi
  rm -f "$stale_file"
else
  echo "gh или GH_TOKEN нет — затихшие парсеры сам не запускаю."
fi

if [ -z "$CRON_SECRET" ]; then
  echo "CRON_SECRET пуст — тревогу в Telegram не шлю."
  exit 0
fi

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
  echo "HTTP ${http_code:-нет} — watchdog не принят. Шаг не валит Actions: парсеры уже дернули."
  exit 0
fi

echo "Watch завершён."
exit 0
