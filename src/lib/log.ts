/**
 * Единый журнал сайта. Одна строка JSON на событие.
 *
 * В логи не попадают пароли, токены, cookie, почта, телефоны, резюме,
 * строки подключения и прочие персональные данные. Если сомневаешься —
 * не передавай поле: лучше недосказать, чем засветить человека.
 */

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const REDACTED = "[скрыто]";

/** Имена полей, которые никогда не пишем как есть. */
const SENSITIVE_KEY =
  /^(pass(word|wd)?|secret|token|authorization|cookie|set-cookie|email|mail|phone|tel|contact|resume|rawtext|ocrtext|database_url|direct_url|api[_-]?key|session|chatid|chat_id|inn|telegram|bearer|cron_secret|admin_password|vk_token|tg_session|tg_api_hash|service_role|anon_key|webhook)$/i;

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+7|8)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g;
const BEARER = /Bearer\s+\S+/gi;
const URL_SECRET = /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'\\]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const LONG_KEY = /\b(?:sk|rk|key|sbp|sb_secret)[-_][A-Za-z0-9_-]{8,}\b/gi;
const HEX_SECRET = /\b[a-f0-9]{32,}\b/gi;

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "");
}

function isSensitiveKey(key: string): boolean {
  const compact = normalizeKey(key);
  return SENSITIVE_KEY.test(compact) || SENSITIVE_KEY.test(key);
}

export function redactString(value: string): string {
  return value
    .replace(URL_SECRET, REDACTED)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(PHONE, REDACTED)
    .replace(LONG_KEY, REDACTED)
    .replace(HEX_SECRET, REDACTED);
}

function redactUnknown(value: unknown, seen: WeakSet<object>, key?: string): unknown {
  if (key && isSensitiveKey(key)) {
    return REDACTED;
  }
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[цикл]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [field, nested] of Object.entries(value as Record<string, unknown>)) {
    out[field] = redactUnknown(nested, seen, field);
  }
  return out;
}

/** Вычищает персональные данные и секреты. Можно звать из тестов. */
export function redact(value: unknown): unknown {
  return redactUnknown(value, new WeakSet());
}

function emit(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: redactString(message),
  };
  if (extra !== undefined) {
    entry.data = redact(extra);
  }
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const log = {
  debug(scope: string, message: string, extra?: unknown): void {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    emit("debug", scope, message, extra);
  },
  info(scope: string, message: string, extra?: unknown): void {
    emit("info", scope, message, extra);
  },
  warn(scope: string, message: string, extra?: unknown): void {
    emit("warn", scope, message, extra);
  },
  error(scope: string, message: string, extra?: unknown): void {
    emit("error", scope, message, extra);
  },
};
