import { listSpheres } from "@/lib/professions";
import {
  getSelectableCities,
  isActiveCity,
  isCitySlug,
  type CitySlug,
} from "@/lib/geo";
import { absoluteUrl } from "@/lib/seo/origin";
import { lastmodIso, type SitemapEntry } from "@/lib/seo/sitemap-xml";
import {
  listSitemapEmployers,
  listSitemapSpheres,
  listSitemapVacancies,
} from "@/lib/repo/sitemap";
import { companyPath } from "@/lib/vacancy/path";
import { vacancyPath } from "@/lib/vacancy/path";

const STATIC_PATHS = ["/about", "/help", "/contacts", "/terms", "/safety", "/about/lite"];

function cityPaths(slug: CitySlug, active: boolean): string[] {
  if (!active) {
    return [`/${slug}`];
  }
  return [`/${slug}`, `/${slug}/jobs`, `/${slug}/vahta`, `/${slug}/map`];
}

export async function collectSitemapEntries(): Promise<SitemapEntry[]> {
  const cities = getSelectableCities();
  const entries: SitemapEntry[] = STATIC_PATHS.map((path) => ({ loc: absoluteUrl(path) }));

  for (const city of cities) {
    for (const path of cityPaths(city.slug, city.status === "active")) {
      entries.push({ loc: absoluteUrl(path) });
    }
  }

  const knownSpheres = new Set(listSpheres().map((item) => item.slug));

  try {
    const [spheres, vacancies, employers] = await Promise.all([
      listSitemapSpheres(),
      listSitemapVacancies(),
      listSitemapEmployers(),
    ]);

    for (const row of spheres) {
      if (!isCitySlug(row.citySlug) || !isActiveCity(row.citySlug) || !knownSpheres.has(row.sphere)) {
        continue;
      }
      entries.push({
        loc: absoluteUrl(`/${row.citySlug}/jobs?sphere=${encodeURIComponent(row.sphere)}`),
      });
    }

    for (const row of employers) {
      if (!isCitySlug(row.citySlug) || !isActiveCity(row.citySlug)) {
        continue;
      }
      entries.push({
        loc: absoluteUrl(companyPath(row.citySlug, row.slug)),
        lastmod: lastmodIso(row.updatedAt),
      });
    }

    for (const row of vacancies) {
      if (!isCitySlug(row.citySlug) || !isActiveCity(row.citySlug)) {
        continue;
      }
      const stamp = row.lastSeenAt.getTime() > row.publishedAt.getTime() ? row.lastSeenAt : row.publishedAt;
      entries.push({
        loc: absoluteUrl(vacancyPath(row.citySlug, row.slug)),
        lastmod: lastmodIso(stamp),
      });
    }
  } catch (cause) {
    console.error("[sitemap]", cause);
  }

  return entries;
}
