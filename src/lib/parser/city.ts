import { getCity, resolveCityFromText, type City } from "@/lib/geo";

export type CityDecision =
  | { ok: true; city: City }
  | { ok: false; reason: string; citySlug: string | null; cityName: string | null };

/**
 * Город должен быть из geo.json и со статусом active.
 * Донецк (soon) — не ошибка схемы, а пропуск с понятной причиной.
 */
export function decideCity(citySlug: string | undefined, cityName: string | undefined): CityDecision {
  const slugRaw = citySlug?.trim() ?? "";
  const nameRaw = cityName?.trim() ?? "";

  let city = slugRaw ? getCity(slugRaw) : undefined;
  if (!city && nameRaw) {
    const fromName = resolveCityFromText(nameRaw);
    city = fromName ? getCity(fromName) : undefined;
  }
  if (!city && slugRaw) {
    const fromSlugText = resolveCityFromText(slugRaw);
    city = fromSlugText ? getCity(fromSlugText) : undefined;
  }

  if (!city) {
    const label = slugRaw || nameRaw || "";
    return {
      ok: false,
      citySlug: slugRaw || null,
      cityName: nameRaw || null,
      reason: label
        ? `Города «${label}» нет в справочнике — вакансию не принимаем`
        : "Не указан город (citySlug) — вакансию не принимаем",
    };
  }

  if (city.status !== "active") {
    const statusLabel = city.status === "soon" ? "скоро" : "в планах";
    return {
      ok: false,
      citySlug: city.slug,
      cityName: city.name.nom,
      reason: `Город «${city.name.nom}» не активен (статус ${city.status}, ${statusLabel}) — вакансию не принимаем`,
    };
  }

  return { ok: true, city };
}
