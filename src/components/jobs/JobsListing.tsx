import { CityDevelopmentPlaceholder } from "@/components/geo/CityDevelopmentPlaceholder";
import { JobsEmpty } from "@/components/jobs/JobsEmpty";
import { JobsFilters } from "@/components/jobs/JobsFilters";
import { JobsSort } from "@/components/jobs/JobsSort";
import { JobsTabs } from "@/components/jobs/JobsTabs";
import { VacanciesFeed } from "@/components/jobs/VacanciesFeed";
import { VacancyList } from "@/components/jobs/VacancyList";
import { VahtaWarning } from "@/components/jobs/VahtaWarning";
import { buttonVariants } from "@/components/ui/button-variants";
import { Icon } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/format/cn";
import { foundVacancies } from "@/lib/format/plural";
import {
  cityName,
  getCitySelectGroups,
  getDistricts,
  isActiveCity,
  listExternalDestinations,
  type CitySlug,
} from "@/lib/geo";
import type { JobsSection } from "@/lib/jobs/search-cookie";
import {
  lastSearchHref,
  parseSearchCookie,
  SEARCH_COOKIE,
} from "@/lib/jobs/search-cookie";
import {
  activeFilterCount,
  hasActiveFilters,
  jobsHref,
  jobsPath,
  serializeVacancyQuery,
} from "@/lib/jobs/url";
import { listProfessionCatalog, listSpheres } from "@/lib/professions";
import { getRequestQuality } from "@/lib/quality/request";
import {
  countVacanciesByFormat,
  listVacancies,
  type ListVacanciesParams,
} from "@/lib/repo/vacancies";
import { isFiltersOpen, parseVacancyQuery } from "@/lib/validation/vacancy-query";
import { WorkFormat, type Source } from "@prisma/client";
import { cookies } from "next/headers";
import type { PaginationPageLink } from "@/components/ui/pagination";

function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const marks = new Set([1, pageCount]);
  for (let cursor = page - 2; cursor <= page + 2; cursor += 1) {
    if (cursor >= 1 && cursor <= pageCount) {
      marks.add(cursor);
    }
  }
  const sorted = [...marks].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0 && sorted[index] - sorted[index - 1] > 1) {
      items.push("gap");
    }
    items.push(sorted[index]);
  }
  return items;
}

function toRepoParams(
  query: ReturnType<typeof parseVacancyQuery>,
  citySlug: string,
  workFormat: WorkFormat,
  pageSize: number,
): ListVacanciesParams {
  return {
    citySlug,
    sphere: query.sphere,
    professionSlug: query.profession,
    salaryFrom: query.salaryFrom,
    schedule: query.schedule,
    experience: query.experience,
    employmentType: query.employmentType,
    districtSlug: query.district,
    q: query.q,
    sort: query.sort,
    page: query.page,
    pageSize,
    workFormat,
    publishedDays: query.publishedDays,
    hasSalary: query.hasSalary,
    verifiedOnly: query.verifiedOnly,
    source: query.source as Source | undefined,
    destination: query.destination,
    vahtaDays: query.vahtaDays,
    rotation: query.rotation,
    housing: query.housing,
    meals: query.meals,
    travel: query.travel,
    direct: query.direct,
  };
}

export async function JobsListing({
  citySlug,
  section,
  searchParams,
}: {
  citySlug: CitySlug;
  section: JobsSection;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { mode, features } = await getRequestQuality();
  const workFormat = section === "vahta" ? WorkFormat.VAHTA : WorkFormat.LOCAL;
  const query = parseVacancyQuery(searchParams, {
    city: citySlug,
    pageSize: features.perPage,
    workFormat,
  });
  const filtersOpen = isFiltersOpen(searchParams);
  const cityInDevelopment = !isActiveCity(citySlug);
  const filterCount = activeFilterCount(query, section);
  const filtered = hasActiveFilters(query, section);

  const { active, soon } = getCitySelectGroups();
  const districts = getDistricts(citySlug);
  const spheres = listSpheres();
  const professions = listProfessionCatalog();
  const destinations = listExternalDestinations();

  const [list, localCount, vahtaCount] = cityInDevelopment
    ? [
        { vacancies: [], total: 0, page: query.page, pageSize: features.perPage, pages: 0 },
        0,
        0,
      ]
    : await Promise.all([
        listVacancies(toRepoParams(query, citySlug, workFormat, features.perPage)),
        countVacanciesByFormat(citySlug, WorkFormat.LOCAL),
        countVacanciesByFormat(citySlug, WorkFormat.VAHTA),
      ]);

  const jar = await cookies();
  const last = parseSearchCookie(jar.get(SEARCH_COOKIE)?.value);
  const continueHref =
    last && last.city === citySlug && last.section === section && last.query
      ? lastSearchHref(last)
      : null;
  const showContinue =
    Boolean(continueHref) && !filtered && query.page === 1 && !filtersOpen;

  const title =
    section === "vahta"
      ? `Вахта из ${cityName(citySlug, "gen")}`
      : `Вакансии ${cityName(citySlug, "gen")}`;

  const path = jobsPath(citySlug, section);
  const filterQuery = serializeVacancyQuery({ ...query, page: 1 }).toString();
  const apiQuery = new URLSearchParams(filterQuery);
  apiQuery.set("city", citySlug);
  apiQuery.set("pageSize", String(features.perPage));
  apiQuery.set("workFormat", workFormat);

  const loadMore = mode !== "ultra";
  const otherCount = section === "jobs" ? vahtaCount : localCount;

  return (
    <div className="mx-auto flex max-w-container min-w-0 flex-col gap-4 px-4 py-6">
      <header className="flex min-w-0 flex-col gap-3">
        <h1 className="font-display text-2xl font-medium">{title}</h1>
        <JobsTabs
          citySlug={citySlug}
          section={section}
          query={query}
          localCount={localCount}
          vahtaCount={vahtaCount}
        />
      </header>

      {section === "vahta" ? <VahtaWarning /> : null}

      {showContinue && continueHref ? (
        <p className="text-sm">
          <a href={continueHref} className="text-brand underline-offset-2 hover:underline">
            Продолжить последний поиск
          </a>
        </p>
      ) : null}

      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start">
        <JobsFilters
          citySlug={citySlug}
          section={section}
          query={query}
          open={filtersOpen}
          activeCities={active}
          soonCities={soon}
          districts={districts}
          spheres={spheres}
          professions={professions}
          destinations={destinations}
        />

        <div className={cn("flex min-w-0 flex-1 flex-col gap-4", filtersOpen && "hidden md:flex")}>
          <a
            href={jobsHref(citySlug, section, query, { filters: true })}
            className={cn(buttonVariants({ variant: "outline" }), "md:hidden")}
          >
            <Icon name="filter" size="sm" decorative />
            Фильтры{filterCount > 0 ? ` · ${filterCount}` : ""}
          </a>

          {cityInDevelopment ? null : (
            <div className="flex min-w-0 flex-col gap-3">
              <p className="text-md">{foundVacancies(list.total)}</p>
              <JobsSort citySlug={citySlug} section={section} query={query} />
            </div>
          )}

          {cityInDevelopment ? (
            <CityDevelopmentPlaceholder citySlug={citySlug} heading="section" />
          ) : list.total === 0 ? (
            <JobsEmpty
              citySlug={citySlug}
              section={section}
              resetHref={`${path}?reset=1`}
              filtered={filtered}
              otherCount={otherCount}
            />
          ) : loadMore ? (
            <VacanciesFeed
              vacancies={list.vacancies}
              page={list.page}
              pages={list.pages}
              path={path}
              query={filterQuery}
              apiQuery={apiQuery.toString()}
              features={features}
              safetyLink
            />
          ) : (
            <VacancyList vacancies={list.vacancies} features={features} safetyLink />
          )}

          {cityInDevelopment || list.pages <= 1 ? null : (
            <Pagination
              page={list.page}
              pageCount={list.pages}
              compact={loadMore}
              prevHref={
                list.page > 1 ? jobsHref(citySlug, section, query, { page: list.page - 1 }) : null
              }
              nextHref={
                list.page < list.pages
                  ? jobsHref(citySlug, section, query, { page: list.page + 1 })
                  : null
              }
              pages={pageWindow(list.page, list.pages).map((item, index): PaginationPageLink =>
                item === "gap"
                  ? { page: -1 - index, href: "" }
                  : {
                      page: item,
                      href: jobsHref(citySlug, section, query, { page: item }),
                      current: item === list.page,
                    },
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
