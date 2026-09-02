#!/usr/bin/env bash
# Выгрузка public-схемы, восстановление на одноразовый Postgres, артефакт.
# Бэкап, который сюда не дошёл, не считается бэкапом.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$ROOT/backups"
STAMP="$(date -u +%Y-%m-%d)"
DUMP="$ROOT/backups/terrikon-${STAMP}.dump"
ENC="$DUMP.enc"

DIRECT_URL="${DIRECT_URL:-}"
if [ -z "$DIRECT_URL" ]; then
  echo "DIRECT_URL пуст — выгрузку пропускаю."
  exit 1
fi

echo "Выгружаю схему public…"
pg_dump --format=custom --no-owner --no-acl --schema=public --dbname="$DIRECT_URL" --file="$DUMP"
ls -lh "$DUMP"

echo "Восстанавливаю на проверочную базу…"
export PGPASSWORD="${RESTORE_PASSWORD:-restore}"
RESTORE_HOST="${RESTORE_HOST:-localhost}"
RESTORE_USER="${RESTORE_USER:-restore}"
RESTORE_DB="${RESTORE_DB:-terrikon_check}"

for pass in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if pg_isready -h "$RESTORE_HOST" -U "$RESTORE_USER" -d "$RESTORE_DB" >/dev/null 2>&1; then
    break
  fi
  echo "Postgres ещё не готов, попытка $pass"
  sleep 2
done

pg_restore --no-owner --no-acl --dbname="postgresql://${RESTORE_USER}:${PGPASSWORD}@${RESTORE_HOST}:5432/${RESTORE_DB}" "$DUMP"

echo "Проверяю таблицы…"
psql -h "$RESTORE_HOST" -U "$RESTORE_USER" -d "$RESTORE_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT CASE WHEN to_regclass('public."Vacancy"') IS NULL THEN 1/0 ELSE 1 END;
SELECT CASE WHEN to_regclass('public."GeocodeCache"') IS NULL THEN 1/0 ELSE 1 END;
SELECT CASE WHEN to_regclass('public."_prisma_migrations"') IS NULL THEN 1/0 ELSE 1 END;
SELECT COUNT(*) AS vacancies FROM "Vacancy";
SELECT COUNT(*) AS geocode FROM "GeocodeCache";
SELECT COUNT(*) AS migrations FROM "_prisma_migrations";
SQL

echo "Восстановление на проверочной базе прошло."

note() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "$1" >> "$GITHUB_OUTPUT"
  fi
}

PASS="${BACKUP_PASSPHRASE:-${CRON_SECRET:-}}"
if [ -z "$PASS" ]; then
  echo "BACKUP_PASSPHRASE и CRON_SECRET пусты — зашифрованный артефакт не делаю. Проверка restore уже прошла."
  note "verify_ok=true"
  exit 0
fi

openssl enc -aes-256-cbc -pbkdf2 -salt -in "$DUMP" -out "$ENC" -pass pass:"$PASS"
rm -f "$DUMP"
echo "Зашифрованный дамп: $ENC"
note "verify_ok=true"
note "artifact=$(basename "$ENC")"
