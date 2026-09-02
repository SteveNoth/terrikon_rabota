import { formatMoney } from "@/lib/format/money";
import { vacancyPath } from "@/lib/vacancy/path";
import type { OfflineVacancy } from "@/lib/offline/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import type { VacancyView } from "@/lib/vacancy/view";

function iso(value: Date | string | undefined): string {
  if (!value) {
    return new Date(0).toISOString();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

type VacancySnapshotInput = Pick<
  VacancyListItem,
  | "id"
  | "slug"
  | "title"
  | "citySlug"
  | "districtSlug"
  | "summaryLine"
  | "salaryFrom"
  | "salaryTo"
  | "salaryPeriod"
  | "workFormat"
  | "workLocationText"
  | "publishedAt"
  | "employer"
>;

/** В IndexedDB кладём только текст карточки — без описания и HTML источника. */
export function toOfflineVacancy(item: VacancySnapshotInput, savedAt = Date.now()): OfflineVacancy {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    href: vacancyPath(item.citySlug, item.slug),
    citySlug: item.citySlug,
    districtSlug: item.districtSlug,
    salaryText: formatMoney(item),
    summaryLine: item.summaryLine,
    workFormat: item.workFormat,
    workLocationText: item.workLocationText,
    employerName: item.employer?.name ?? null,
    publishedAt: iso(item.publishedAt),
    savedAt,
  };
}

export function offlineVacancyFromView(view: VacancyView, savedAt = Date.now()): OfflineVacancy {
  return {
    id: view.id,
    slug: view.slug,
    title: view.title,
    href: view.href,
    citySlug: view.citySlug,
    districtSlug: null,
    salaryText: view.salary,
    summaryLine: view.summaryLine,
    workFormat: view.isVahta ? "VAHTA" : "LOCAL",
    workLocationText: view.vahta?.workLocation ?? null,
    employerName: view.employer?.name ?? null,
    publishedAt: view.publishedIso,
    savedAt,
  };
}
