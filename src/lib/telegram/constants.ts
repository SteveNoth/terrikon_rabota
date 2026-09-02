/** Потолок сообщений одному человеку за час. Telegram ~30/сек на бота — это другой лимит. */
export const TELEGRAM_MAX_PER_HOUR = 8;

/** Пауза между сообщениями рассылки, мс. 40 мс ≈ 25 сообщений/сек, ниже лимита ~30. */
export const TELEGRAM_SEND_PAUSE_MS = 40;

/** Новые вакансии старше этого окна в рассылку не берём. */
export const TELEGRAM_NOTIFY_LOOKBACK_HOURS = 48;

export const TELEGRAM_LATEST_COUNT = 5;

export const TELEGRAM_MAX_KEYWORDS = 8;

export const TELEGRAM_KEYWORD_MAX_LEN = 40;

/** Сколько сообщений успеть за один вызов /api/telegram/notify (лимит Vercel ~10 с). */
export const TELEGRAM_NOTIFY_BATCH = 40;

export const TELEGRAM_DIALOGS = {
  idle: "idle",
  keywords: "keywords",
  sphere: "sphere",
  link: "link",
} as const;

export type TelegramDialog = (typeof TELEGRAM_DIALOGS)[keyof typeof TELEGRAM_DIALOGS];

export const REPLY_BUTTONS = {
  subscribe: "Подписка",
  latest: "Свежие",
  city: "Город",
  unsubscribe: "Отписка",
  help: "Помощь",
} as const;

export const CALLBACK = {
  cityPrefix: "c:",
  spherePrefix: "s:",
  anySphere: "s:*",
  cmdSubscribe: "cmd:sub",
  cmdUnsubscribe: "cmd:unsub",
  cmdLatest: "cmd:latest",
  cmdCity: "cmd:city",
  cmdHelp: "cmd:help",
  cmdLink: "cmd:link",
} as const;

export const ANY_SPHERE_LABEL = "Любая сфера";

export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";
