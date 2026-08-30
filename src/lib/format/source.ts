import type { Source } from "@prisma/client";

export const SOURCE_LABEL: Record<Source, string> = {
  VK: "ВКонтакте",
  TELEGRAM: "Telegram",
  WEBSITE: "Сайт",
  TRUDVSEM: "Работа России · ЦЗН",
  MANUAL: "Вручную",
  EMPLOYER: "Работодатель",
};

export const OPEN_DATA_ATTRIBUTION: Partial<
  Record<Source, { label: string; href: string }>
> = {
  TRUDVSEM: {
    label: "Источник данных: Работа России",
    href: "https://trudvsem.ru",
  },
};

export type SourceIconName = "vk" | "telegram" | "website";

export function sourceIconName(source: Source): SourceIconName {
  if (source === "VK") {
    return "vk";
  }
  if (source === "TELEGRAM") {
    return "telegram";
  }
  return "website";
}

/** Метка источника на карточке: своё имя, если есть, иначе тип. */
export function formatSource(source: Source, sourceName?: string | null): string {
  const named = sourceName?.trim();
  if (named) {
    return named;
  }
  return SOURCE_LABEL[source];
}

export function openDataAttribution(source: Source): { label: string; href: string } | null {
  return OPEN_DATA_ATTRIBUTION[source] ?? null;
}