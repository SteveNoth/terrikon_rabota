import type { JobsSection } from "@/lib/jobs/search-cookie";
import type { VacancySort } from "@/lib/repo/vacancies";
import type { ParsedVacancyQuery } from "@/lib/validation/vacancy-query";

export type JobsHrefOverrides = Partial<{
  page: number;
  sort: VacancySort;
  filters: boolean;
  q: string | undefined;
  sphere: string | undefined;
  profession: string | undefined;
}>;

function setOptional(params: URLSearchParams, key: string, value: string | number | boolean | undefined) {
  if (value == null || value === "" || value === false) {
    return;
  }
  params.set(key, String(value));
}

/** Собирает query string из разобранных фильтров. page=1 и sort=date не пишем — это значения по умолчанию. */
export function serializeVacancyQuery(
  query: ParsedVacancyQuery,
  extra?: JobsHrefOverrides,
): URLSearchParams {
  const page = extra?.page ?? query.page;
  const sort = extra?.sort ?? query.sort;
  const q = extra && "q" in extra ? extra.q : query.q;
  const sphere = extra && "sphere" in extra ? extra.sphere : query.sphere;
  const profession = extra && "profession" in extra ? extra.profession : query.profession;

  const params = new URLSearchParams();
  setOptional(params, "q", q);
  setOptional(params, "sphere", sphere);
  setOptional(params, "profession", profession);
  setOptional(params, "salaryFrom", query.salaryFrom);
  setOptional(params, "schedule", query.schedule);
  setOptional(params, "experience", query.experience);
  setOptional(params, "employmentType", query.employmentType);
  setOptional(params, "district", query.district);
  setOptional(params, "published", query.publishedDays);
  setOptional(params, "hasSalary", query.hasSalary ? "1" : undefined);
  setOptional(params, "verified", query.verifiedOnly ? "1" : undefined);
  setOptional(params, "source", query.source);
  setOptional(params, "destination", query.destination);
  setOptional(params, "vahtaDays", query.vahtaDays);
  setOptional(params, "rotation", query.rotation);
  setOptional(params, "housing", query.housing ? "1" : undefined);
  setOptional(params, "meals", query.meals ? "1" : undefined);
  setOptional(params, "travel", query.travel ? "1" : undefined);
  setOptional(params, "direct", query.direct ? "1" : undefined);
  setOptional(params, "employer", query.employerSlug);
  if (sort && sort !== "date") {
    params.set("sort", sort);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  if (extra?.filters) {
    params.set("filters", "1");
  }
  return params;
}

export function jobsPath(city: string, section: JobsSection): string {
  return `/${city}/${section}`;
}

export function jobsHref(
  city: string,
  section: JobsSection,
  query: ParsedVacancyQuery,
  extra?: JobsHrefOverrides,
): string {
  const qs = serializeVacancyQuery(query, extra).toString();
  const path = jobsPath(city, section);
  return qs ? `${path}?${qs}` : path;
}

/** При смене вкладки «местные / вахта» общие фильтры остаются, свои — нет. Страница сбрасывается. */
export function queryForTabSwitch(query: ParsedVacancyQuery): ParsedVacancyQuery {
  const next: ParsedVacancyQuery = {
    city: query.city,
    sort: query.sort,
    page: 1,
    pageSize: query.pageSize,
    workFormat: query.workFormat,
  };
  if (query.q) next.q = query.q;
  if (query.sphere) next.sphere = query.sphere;
  if (query.profession) next.profession = query.profession;
  if (query.salaryFrom != null) next.salaryFrom = query.salaryFrom;
  if (query.experience) next.experience = query.experience;
  if (query.employmentType) next.employmentType = query.employmentType;
  if (query.publishedDays) next.publishedDays = query.publishedDays;
  if (query.hasSalary) next.hasSalary = true;
  if (query.verifiedOnly) next.verifiedOnly = true;
  if (query.source) next.source = query.source;
  if (query.employerSlug) next.employerSlug = query.employerSlug;
  return next;
}

export function activeFilterCount(query: ParsedVacancyQuery, section: JobsSection): number {
  let count = 0;
  if (query.q) count += 1;
  if (query.sphere) count += 1;
  if (query.profession) count += 1;
  if (query.salaryFrom != null) count += 1;
  if (query.experience) count += 1;
  if (query.employmentType) count += 1;
  if (query.publishedDays) count += 1;
  if (query.hasSalary) count += 1;
  if (query.verifiedOnly) count += 1;
  if (query.source) count += 1;
  if (query.employerSlug) count += 1;
  if (section === "jobs") {
    if (query.schedule) count += 1;
    if (query.district) count += 1;
  } else {
    if (query.destination) count += 1;
    if (query.vahtaDays != null) count += 1;
    if (query.rotation) count += 1;
    if (query.housing) count += 1;
    if (query.meals) count += 1;
    if (query.travel) count += 1;
    if (query.direct) count += 1;
  }
  return count;
}

export function hasActiveFilters(query: ParsedVacancyQuery, section: JobsSection): boolean {
  return activeFilterCount(query, section) > 0;
}

export function apiVacanciesUrl(
  city: string,
  query: ParsedVacancyQuery,
  extras: { page: number; pageSize: number; workFormat: "LOCAL" | "VAHTA" | "REMOTE" },
): string {
  const params = serializeVacancyQuery(query, { page: extras.page });
  params.set("city", city);
  params.set("page", String(extras.page));
  params.set("pageSize", String(extras.pageSize));
  params.set("workFormat", extras.workFormat);
  return `/api/vacancies?${params.toString()}`;
}
