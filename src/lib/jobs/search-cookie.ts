export const SEARCH_COOKIE = "tr_search";
export const SEARCH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type JobsSection = "jobs" | "vahta";

export type LastSearch = {
  city: string;
  section: JobsSection;
  query: string;
};

const VERSION = "v1";

/** Параметры, которые живут только в адресе экрана, а не в «последнем поиске». */
const EPHEMERAL = new Set(["page", "pageSize", "limit", "filters", "reset", "mode", "city"]);

const FILTER_KEYS = [
  "q",
  "sphere",
  "profession",
  "salaryFrom",
  "schedule",
  "experience",
  "employmentType",
  "employment",
  "district",
  "published",
  "hasSalary",
  "verified",
  "source",
  "destination",
  "vahtaDays",
  "rotation",
  "housing",
  "meals",
  "travel",
  "direct",
  "sort",
] as const;

export function isJobsSection(value: string | undefined): value is JobsSection {
  return value === "jobs" || value === "vahta";
}

export function jobsSectionFromPath(pathname: string): JobsSection | null {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[1];
  return isJobsSection(last) && parts.length === 2 ? last : null;
}

export function hasStoredFilters(params: URLSearchParams): boolean {
  return FILTER_KEYS.some((key) => {
    const value = params.get(key)?.trim();
    return Boolean(value);
  });
}

export function queryForCookie(params: URLSearchParams): string {
  const stored = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (EPHEMERAL.has(key)) {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    stored.set(key, trimmed);
  }
  stored.delete("page");
  return stored.toString();
}

export function encodeSearchCookie(city: string, section: JobsSection, query: string): string {
  return [VERSION, city, section, query].join("|");
}

export function parseSearchCookie(raw: string | undefined | null): LastSearch | null {
  if (!raw) {
    return null;
  }
  const [version, city, section, ...rest] = raw.split("|");
  if (version !== VERSION || !city || !isJobsSection(section)) {
    return null;
  }
  const query = rest.join("|");
  if (!query) {
    return null;
  }
  return { city, section, query };
}

export function lastSearchHref(last: LastSearch): string {
  return last.query ? `/${last.city}/${last.section}?${last.query}` : `/${last.city}/${last.section}`;
}
