import type { Source } from "@prisma/client";

const SOURCE_LABEL: Record<Source, string> = {
  VK: "ВКонтакте",
  TELEGRAM: "Telegram",
  WEBSITE: "Сайт",
  MANUAL: "Вручную",
  EMPLOYER: "Работодатель",
};

/** Метка источника на карточке: своё имя, если есть, иначе тип. */
export function formatSource(source: Source, sourceName?: string | null): string {
  const named = sourceName?.trim();
  if (named) {
    return named;
  }
  return SOURCE_LABEL[source];
}
