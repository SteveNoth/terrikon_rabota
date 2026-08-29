import type { Source } from "@prisma/client";

export const SOURCE_LABEL: Record<Source, string> = {
  VK: "ВКонтакте",
  TELEGRAM: "Telegram",
  WEBSITE: "Сайт",
  MANUAL: "Вручную",
  EMPLOYER: "Работодатель",
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