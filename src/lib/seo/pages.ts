import type { Metadata } from "next";
import { isActiveCity, isSelectableCity } from "@/lib/geo";
import { getSphere } from "@/lib/professions";
import { countVacanciesBySphere } from "@/lib/repo/vacancies";
import { pageMetadata } from "@/lib/seo/meta";
import {
  cityHomeDescription,
  cityHomeTitle,
  jobsDescription,
  jobsTitle,
  mapDescription,
  mapTitle,
  vahtaDescription,
  vahtaTitle,
} from "@/lib/seo/titles";

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function sphereFromSearch(
  search: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  const raw = firstParam(search?.sphere)?.trim();
  if (!raw || !getSphere(raw)) {
    return undefined;
  }
  return raw;
}

export async function cityHomeMetadata(slug: string): Promise<Metadata> {
  if (!isSelectableCity(slug)) {
    return { title: "Такого города у нас нет", robots: { index: false, follow: false } };
  }
  const status = isActiveCity(slug) ? "active" : "soon";
  return pageMetadata({
    title: cityHomeTitle(slug, status),
    description: cityHomeDescription(slug, status),
    pathname: `/${slug}`,
  });
}

export async function jobsRouteMetadata(
  slug: string,
  section: "jobs" | "vahta",
  search?: Record<string, string | string[] | undefined>,
): Promise<Metadata> {
  if (!isSelectableCity(slug)) {
    return { title: section === "vahta" ? "Вахта" : "Вакансии", robots: { index: false, follow: false } };
  }
  const sphere = sphereFromSearch(search);
  let count: number | undefined;
  if (sphere && isActiveCity(slug) && section === "jobs") {
    const rows = await countVacanciesBySphere(slug);
    count = rows.find((row) => row.sphere === sphere)?.count ?? 0;
  }
  const title =
    section === "vahta" ? vahtaTitle(slug, sphere, count) : jobsTitle(slug, sphere, count);
  const description = section === "vahta" ? vahtaDescription(slug) : jobsDescription(slug, sphere);
  return pageMetadata({
    title,
    description,
    pathname: `/${slug}/${section}`,
    search,
  });
}

export function mapRouteMetadata(slug: string): Metadata {
  if (!isSelectableCity(slug)) {
    return { title: "Карта вакансий", robots: { index: false, follow: false } };
  }
  return pageMetadata({
    title: mapTitle(slug),
    description: mapDescription(slug),
    pathname: `/${slug}/map`,
  });
}
