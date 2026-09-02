/**
 * Список миграций, которые должны быть в базе. Сверяем с папкой prisma/migrations
 * в тестах. На Vercel папки может не быть в бандле — тогда смотрим этот список.
 */
export const EXPECTED_MIGRATIONS = [
  "20260829000000_init",
  "20260830000000_geocode_accuracy",
  "20260830150000_parser_ingest",
  "20260830230000_trudvsem",
  "20260831150000_admin_parser_run_stats",
  "20260831180000_employer_auth",
  "20260831200000_account_blocks",
  "20260831210000_seeker_profile",
  "20260902120000_telegram_bot",
  "20260902180000_observability",
  "20260902210000_data_hygiene",
] as const;
