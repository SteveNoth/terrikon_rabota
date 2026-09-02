import { createHash } from "node:crypto";
import { TELEGRAM_SECRET_HEADER } from "@/lib/telegram/constants";

const MIN_SECRET_LENGTH = 8;

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export function telegramBotToken(): string | null {
  const value = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  return value.length >= 20 ? value : null;
}

/**
 * Секрет заголовка webhook. Если TELEGRAM_WEBHOOK_SECRET не задан —
 * стабильный отпечаток токена (в токене есть «:», его Telegram не примет как secret_token).
 */
export function telegramWebhookSecret(): string | null {
  const explicit = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  if (explicit.length >= MIN_SECRET_LENGTH && /^[A-Za-z0-9_-]+$/.test(explicit)) {
    return explicit;
  }
  const token = telegramBotToken();
  if (!token) {
    return null;
  }
  return createHash("sha256").update(`tr-webhook:${token}`).digest("hex");
}

export function authorizeTelegramWebhook(request: Request): boolean {
  const expected = telegramWebhookSecret();
  if (!expected) {
    return false;
  }
  const got =
    request.headers.get(TELEGRAM_SECRET_HEADER) ??
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") ??
    "";
  return timingSafeEqual(got, expected);
}
