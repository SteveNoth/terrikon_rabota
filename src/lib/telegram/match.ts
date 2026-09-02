import { getProfession } from "@/lib/professions";
import {
  TELEGRAM_KEYWORD_MAX_LEN,
  TELEGRAM_MAX_KEYWORDS,
  TELEGRAM_MAX_PER_HOUR,
} from "@/lib/telegram/constants";

export type MatchVacancy = {
  id: string;
  title: string;
  summaryLine: string | null;
  professionSlug: string | null;
  sphere: string;
  citySlug: string;
  groupId: string | null;
};

export type MatchSubscription = {
  citySlug: string;
  keywords: string[];
  spheres: string[];
};

export function parseKeywords(raw: string): string[] {
  const parts = raw
    .split(/[,;\n]+/)
    .map((item) => item.trim().toLocaleLowerCase("ru-RU"))
    .map((item) => item.replace(/^#/, ""))
    .filter(Boolean)
    .map((item) => item.slice(0, TELEGRAM_KEYWORD_MAX_LEN));
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.includes(part)) {
      unique.push(part);
    }
    if (unique.length >= TELEGRAM_MAX_KEYWORDS) {
      break;
    }
  }
  return unique;
}

export function deliveryGroupKey(vacancy: { id: string; groupId: string | null }): string {
  return vacancy.groupId || vacancy.id;
}

function haystack(vacancy: MatchVacancy): string {
  const profession = vacancy.professionSlug ? getProfession(vacancy.professionSlug) : undefined;
  const bits = [
    vacancy.title,
    vacancy.summaryLine,
    vacancy.professionSlug,
    profession?.name,
    ...(profession?.synonyms ?? []),
  ];
  return bits
    .filter((item): item is string => Boolean(item))
    .join(" ")
    .toLocaleLowerCase("ru-RU");
}

export function vacancyMatchesSubscription(vacancy: MatchVacancy, sub: MatchSubscription): boolean {
  if (vacancy.citySlug !== sub.citySlug) {
    return false;
  }
  if (sub.spheres.length > 0 && !sub.spheres.includes(vacancy.sphere)) {
    return false;
  }
  if (sub.keywords.length === 0) {
    return true;
  }
  const text = haystack(vacancy);
  return sub.keywords.some((keyword) => text.includes(keyword));
}

export function remainingHourQuota(sentInHour: number, max = TELEGRAM_MAX_PER_HOUR): number {
  if (sentInHour >= max) {
    return 0;
  }
  return max - sentInHour;
}

export function isAnySphereToken(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  return (
    normalized === "*" ||
    normalized === "любая" ||
    normalized === "любая сфера" ||
    normalized === "все" ||
    normalized === "все сферы" ||
    normalized === "без сферы"
  );
}
