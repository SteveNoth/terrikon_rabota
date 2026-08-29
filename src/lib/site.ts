import site from "@shared/site.json";
import { cityName, getDefaultCity } from "@/lib/geo";

export const TELEGRAM_CHANNEL_URL = site.telegram.url;

export function telegramChannelTitle(): string {
  return `Террикон Медиа | ${cityName(getDefaultCity().slug, "nom")} Работа`;
}
