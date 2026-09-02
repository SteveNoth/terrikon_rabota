import { getActiveCities, isActiveCity } from "@/lib/geo";

export function activeCitySlugs(): string[] {
  return getActiveCities().map((city) => city.slug);
}

export function activeCityFilterOptions(): { slug: string; label: string }[] {
  return getActiveCities().map((city) => ({ slug: city.slug, label: city.name.nom }));
}

/**
 * В избранном и откликах показываем только вакансии городов со статусом active.
 * Иначе при переключении на soon/planned ссылка ведёт на заглушку или 404.
 */
export function isListedSeekerCity(citySlug: string): boolean {
  return isActiveCity(citySlug);
}

export function filterSeekerCity<T extends { citySlug: string }>(
  items: T[],
  citySlug?: string | null,
): T[] {
  const listed = items.filter((item) => isListedSeekerCity(item.citySlug));
  if (!citySlug || !isListedSeekerCity(citySlug)) {
    return listed;
  }
  return listed.filter((item) => item.citySlug === citySlug);
}

export function resolveSeekerListCity(
  requested: string | null | undefined,
  fallback: string,
): string | null {
  if (requested && isListedSeekerCity(requested)) {
    return requested;
  }
  if (isListedSeekerCity(fallback)) {
    return fallback;
  }
  return getActiveCities()[0]?.slug ?? null;
}
