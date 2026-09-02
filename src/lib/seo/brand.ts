export const SITE_NAME = "Террикон Работа";

export const SITE_TAGLINE = "Региональный агрегатор вакансий";

export const TITLE_SEP = " | ";

export function withBrand(title: string): string {
  if (title.includes(SITE_NAME)) {
    return title;
  }
  return `${title}${TITLE_SEP}${SITE_NAME}`;
}
