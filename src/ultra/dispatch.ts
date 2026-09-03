import {
  getDefaultCity,
  isActiveCity,
  isSelectableCity,
  type CitySlug,
} from "@/lib/geo";
import { renderAbout, renderContacts, renderHelp, renderTerms } from "@/ultra/render/about";
import { renderAboutLite } from "@/ultra/render/about-lite";
import { renderCompanyPage } from "@/ultra/render/company";
import { renderGenericMissing, renderNotFound, renderServerError } from "@/ultra/render/error";
import { renderCityHome } from "@/ultra/render/home";
import { renderJobsPage } from "@/ultra/render/jobs";
import { renderLogin } from "@/ultra/render/login";
import { renderOffline } from "@/ultra/render/offline";
import { renderSafety } from "@/ultra/render/safety";
import { renderCityStub } from "@/ultra/render/stub";
import { renderVacancyPage } from "@/ultra/render/vacancy";
import { renderMapPage } from "@/ultra/render/map";
import { renderSupportPage } from "@/ultra/support";
import type { VacancyView } from "@/lib/vacancy/view";
import { log } from "@/lib/log";
import type { CookieReader } from "@/lib/support/ask";

export type UltraResult = {
  title: string;
  description: string;
  body: string;
  citySlug: string;
  status: number;
  cache: "page" | "none";
  view?: VacancyView;
};

function notifiedFrom(search: URLSearchParams): boolean {
  return search.get("notified") === "1";
}

function reportStatusFrom(search: URLSearchParams): "ok" | "error" | undefined {
  const raw = search.get("report");
  if (raw === "ok" || raw === "error") {
    return raw;
  }
  return undefined;
}

export function citySlugFromRequest(pathname: string, cookie: string | undefined): string {
  const first = pathname.split("/").filter(Boolean)[0];
  if (first && isSelectableCity(first)) {
    return first;
  }
  if (cookie && isSelectableCity(cookie)) {
    return cookie;
  }
  return getDefaultCity().slug;
}

export async function dispatchUltra(input: {
  pathname: string;
  search: URLSearchParams;
  cityCookie?: string;
  searchCookie?: string;
  readCookie?: CookieReader;
}): Promise<UltraResult> {
  const citySlug = citySlugFromRequest(input.pathname, input.cityCookie);
  const parts = input.pathname.split("/").filter(Boolean);
  const readCookie: CookieReader = input.readCookie ?? (() => undefined);

  try {
    if (parts[0] === "about" && parts[1] === "lite" && parts.length === 2) {
      return { ...renderAboutLite(), citySlug, status: 200, cache: "page" };
    }
    if (parts[0] === "about" && parts.length === 1) {
      return { ...renderAbout(), citySlug, status: 200, cache: "page" };
    }
    if (parts[0] === "help" && parts.length === 1) {
      return { ...renderHelp(), citySlug, status: 200, cache: "page" };
    }
    if (parts[0] === "contacts" && parts.length === 1) {
      return { ...renderContacts(), citySlug, status: 200, cache: "page" };
    }
    if (parts[0] === "terms" && parts.length === 1) {
      return { ...renderTerms(), citySlug, status: 200, cache: "page" };
    }
    if (parts[0] === "safety" && parts.length === 1) {
      return { ...renderSafety(citySlug), citySlug, status: 200, cache: "page" };
    }
    if (parts[0] === "offline" && parts.length === 1) {
      return { ...renderOffline(citySlug), citySlug, status: 200, cache: "page" };
    }
    if (parts[0] === "support" && parts.length === 1) {
      const page = renderSupportPage();
      if (!page) {
        return { ...renderGenericMissing(citySlug), citySlug, status: 404, cache: "none" };
      }
      return { ...page, citySlug, status: 200, cache: "page" };
    }
    if (parts[0] === "login" && parts.length === 1) {
      return {
        ...renderLogin(input.cityCookie, input.search.get("next")),
        citySlug,
        status: 200,
        cache: "none",
      };
    }

    const maybeCity = parts[0];
    if (!maybeCity) {
      return { ...renderNotFound(citySlug), citySlug, status: 404, cache: "none" };
    }

    if (!isSelectableCity(maybeCity)) {
      if (parts.length === 1) {
        return { ...renderNotFound(citySlug), citySlug, status: 404, cache: "none" };
      }
      return { ...renderGenericMissing(citySlug), citySlug, status: 404, cache: "none" };
    }

    const city = maybeCity as CitySlug;

    if (parts.length === 1) {
      if (!isActiveCity(city)) {
        return {
          ...renderCityStub(city, notifiedFrom(input.search)),
          citySlug: city,
          status: 200,
          cache: "page",
        };
      }
      const home = await renderCityHome(city);
      return { ...home, citySlug: city, status: 200, cache: "page" };
    }

    if (parts[1] === "jobs" && parts.length === 2) {
      const page = await renderJobsPage({
        citySlug: city,
        section: "jobs",
        searchParams: input.search,
        searchCookie: input.searchCookie,
        readCookie,
      });
      return { ...page, citySlug: city, status: 200, cache: "page" };
    }

    if (parts[1] === "vahta" && parts.length === 2) {
      const page = await renderJobsPage({
        citySlug: city,
        section: "vahta",
        searchParams: input.search,
        searchCookie: input.searchCookie,
        readCookie,
      });
      return { ...page, citySlug: city, status: 200, cache: "page" };
    }

    if (parts[1] === "job" && parts[2] && parts.length === 3) {
      if (!isActiveCity(city)) {
        return { ...renderGenericMissing(city), citySlug: city, status: 404, cache: "none" };
      }
      const page = await renderVacancyPage({
        citySlug: city,
        slug: parts[2],
        reportStatus: reportStatusFrom(input.search),
      });
      if (!page) {
        return { ...renderGenericMissing(city), citySlug: city, status: 404, cache: "none" };
      }
      return { ...page, citySlug: city, status: 200, cache: "none" };
    }

    if (parts[1] === "map" && parts.length === 2) {
      const page = await renderMapPage({
        citySlug: city,
        searchParams: input.search,
      });
      return { ...page, citySlug: city, status: 200, cache: "page" };
    }

    if (parts[1] === "company" && parts[2] && parts.length === 3) {
      const page = await renderCompanyPage({ citySlug: city, slug: parts[2] });
      if (!page) {
        return { ...renderGenericMissing(city), citySlug: city, status: 404, cache: "none" };
      }
      return { ...page, citySlug: city, status: 200, cache: "page" };
    }

    return { ...renderGenericMissing(city), citySlug: city, status: 404, cache: "none" };
  } catch (error) {
    log.error("ultra", "страница не собралась", error);
    return { ...renderServerError(), citySlug, status: 500, cache: "none" };
  }
}
