import site from "@shared/site.json";
import { cityName, getDefaultCity } from "@/lib/geo";

export const TELEGRAM_CHANNEL_URL = site.telegram.url;

export function telegramChannelTitle(): string {
  return `Террикон Медиа | ${cityName(getDefaultCity().slug, "nom")} Работа`;
}

function telegramBotUsername(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  if (fromEnv) {
    return fromEnv;
  }
  const fromSite = "botUsername" in site.telegram ? String(site.telegram.botUsername || "").trim().replace(/^@/, "") : "";
  return fromSite;
}

/** Ссылка на бота с кодом привязки. Пусто, пока username бота не задан. */
export function telegramBotStartUrl(code: string): string | null {
  const username = telegramBotUsername();
  if (!username || !code) {
    return null;
  }
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}
