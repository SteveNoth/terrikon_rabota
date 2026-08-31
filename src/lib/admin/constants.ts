import type { Source } from "@prisma/client";

/** Лимит бесплатного проекта Supabase. Обзор показывает занятость в процентах от него. */
export const DB_LIMIT_BYTES = 500 * 1024 * 1024;

/** Несколько жалоб «похоже на мошенничество» скрывают объявление до разбора. */
export const FRAUD_REPORTS_HIDE_AFTER = 2;

/** Порог «высокий риск» совпадает с review в keywords.json → fraud.thresholds.review. */
export const HIGH_RISK_SCORE = 40;

/** trustScore ≥ этого и TRUSTED-контакт публикуются сами (дверь Этапа 15). */
export const AUTO_PUBLISH_SCORE = 70;

/** Полнота ниже этого — в очередь качества, даже без needsHumanReview. */
export const LOW_COMPLETENESS = 50;

/** Правило-кандидат на понижение веса: сработало достаточно раз и редко подтверждалось. */
export const RULE_CANDIDATE_MIN_FIRES = 5;
export const RULE_CANDIDATE_MAX_ACCURACY = 0.3;

export const ADMIN_COOKIE = "tr_admin";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
export const ADMIN_PASSWORD_MIN = 8;

export const REVIEWED_BY = "admin";

export const SOURCE_OPTIONS: Source[] = ["VK", "TELEGRAM", "WEBSITE", "TRUDVSEM", "MANUAL", "EMPLOYER"];

export const PARSER_LABEL: Record<string, string> = {
  parser_vk: "ВКонтакте",
  parser_tg: "Telegram",
  parser_web: "Сайты предприятий",
  parser_trudvsem: "Работа России · ЦЗН",
};

/** Через сколько без запусков считаем парсер затихшим. Ежедневные — не 6 часов. */
export const PARSER_STALE_AFTER_MS: Record<string, number> = {
  parser_vk: 6 * 60 * 60 * 1000,
  parser_tg: 6 * 60 * 60 * 1000,
  parser_web: 26 * 60 * 60 * 1000,
  parser_trudvsem: 26 * 60 * 60 * 1000,
};

export const PARSER_STALE_DEFAULT_MS = 6 * 60 * 60 * 1000;

export const QUEUE_TABS = ["all", "fraud", "vacancy", "duplicate"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export function isQueueTab(value: string | null | undefined): value is QueueTab {
  return Boolean(value && (QUEUE_TABS as readonly string[]).includes(value));
}
