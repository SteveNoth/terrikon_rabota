import { pluralVacancies } from "@/lib/format/plural";
import { cityName, isCitySlug, type CitySlug } from "@/lib/geo";
import { getSphere } from "@/lib/professions";
import { withBrand } from "@/lib/seo/brand";

export type JobsSectionSeo = "jobs" | "vahta";

export function cityHomeTitle(slug: CitySlug, status: "active" | "soon"): string {
  const loc = cityName(slug, "loc");
  if (status === "soon") {
    return `Работа в ${loc} — скоро на Террикон Работа`;
  }
  return withBrand(`Работа в ${loc} — свежие вакансии`);
}

export function cityHomeDescription(slug: CitySlug, status: "active" | "soon"): string {
  const loc = cityName(slug, "loc");
  const gen = cityName(slug, "gen");
  if (status === "soon") {
    return `Вакансии ${gen} скоро появятся на Террикон Работа. Пока собираем источники и открываем город.`;
  }
  return `Свежие вакансии в ${loc}: местная работа отдельно от вахты, без платы за контакты.`;
}

export function jobsTitle(slug: CitySlug, sphereSlug?: string, count?: number): string {
  if (sphereSlug) {
    const sphere = getSphere(sphereSlug);
    if (sphere) {
      const loc = cityName(slug, "loc");
      const counted = typeof count === "number" ? ` — ${pluralVacancies(count)}` : "";
      return `Работа в ${sphere.loc} в ${loc}${counted}`;
    }
  }
  return withBrand(`Вакансии ${cityName(slug, "gen")} — поиск работы`);
}

export function jobsDescription(slug: CitySlug, sphereSlug?: string): string {
  const loc = cityName(slug, "loc");
  const gen = cityName(slug, "gen");
  const sphere = sphereSlug ? getSphere(sphereSlug) : undefined;
  if (sphere) {
    return `Вакансии в ${sphere.loc} в ${loc}. Местная работа, вахта собрана отдельно.`;
  }
  return `Поиск работы в ${loc}: вакансии ${gen}, фильтры по сфере и зарплате. Вахта — отдельным списком.`;
}

export function jobsHeading(slug: CitySlug, section: JobsSectionSeo, sphereSlug?: string): string {
  if (section === "vahta") {
    const sphere = sphereSlug ? getSphere(sphereSlug) : undefined;
    if (sphere) {
      return `Вахта в ${sphere.loc} из ${cityName(slug, "gen")}`;
    }
    return `Вахта из ${cityName(slug, "gen")}`;
  }
  const sphere = sphereSlug ? getSphere(sphereSlug) : undefined;
  if (sphere) {
    return `Работа в ${sphere.loc} в ${cityName(slug, "loc")}`;
  }
  return `Вакансии ${cityName(slug, "gen")}`;
}

export function vahtaTitle(slug: CitySlug, sphereSlug?: string, count?: number): string {
  const gen = cityName(slug, "gen");
  const sphere = sphereSlug ? getSphere(sphereSlug) : undefined;
  if (sphere) {
    const counted = typeof count === "number" ? ` — ${pluralVacancies(count)}` : "";
    return `Вахта в ${sphere.loc} из ${gen}${counted}`;
  }
  return withBrand(`Вахта из ${gen}`);
}

export function vahtaDescription(slug: CitySlug): string {
  return `Вахтовые вакансии, набор из ${cityName(slug, "gen")}. Место работы — не здесь.`;
}

export function mapTitle(slug: CitySlug): string {
  return withBrand(`Карта вакансий ${cityName(slug, "gen")}`);
}

export function mapDescription(slug: CitySlug): string {
  return `Адреса местных вакансий ${cityName(slug, "gen")} на карте.`;
}

export function vacancyTitleLine(input: {
  title: string;
  citySlug: string;
  salary: string;
  isVahta: boolean;
  workLocation?: string | null;
}): string {
  if (input.isVahta && input.workLocation) {
    return withBrand(`${input.title} — вахта, ${input.workLocation}, ${input.salary}`);
  }
  const loc = isCitySlug(input.citySlug) ? cityName(input.citySlug, "loc") : input.citySlug;
  return withBrand(`${input.title} в ${loc}, ${input.salary}`);
}

export function companyTitle(name: string, citySlug: CitySlug): string {
  return withBrand(`${name} — вакансии в ${cityName(citySlug, "loc")}`);
}

export function companyDescription(name: string, citySlug: CitySlug): string {
  return `Вакансии работодателя «${name}» в ${cityName(citySlug, "loc")}. Источник указан на каждой карточке.`;
}
