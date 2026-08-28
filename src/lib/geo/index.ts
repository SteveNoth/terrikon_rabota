import geoJson from "@shared/geo.json";

export const CITY_COOKIE = "tr_city";

export type GeoFile = typeof geoJson;
export type GeoCityJson = GeoFile["cities"][number];
export type GeoDistrictJson = GeoCityJson["districts"][number];
export type NameCase = keyof GeoCityJson["name"];

declare const citySlugBrand: unique symbol;
/** Slug города из `shared/geo.json`. Сырая строка сюда не подходит — опечатка ловится при сборке. */
export type CitySlug = GeoCityJson["slug"] & { readonly [citySlugBrand]: true };

export type CityStatus = "active" | "soon" | "planned";

export type District = {
  slug: string;
  name: string;
  aliases: string[];
};

export type City = {
  slug: CitySlug;
  region: string;
  status: CityStatus;
  name: Record<NameCase, string>;
  center: { lat: number; lng: number };
  zoom: number;
  priority: number;
  aliases: string[];
  districts: District[];
  population?: number;
};

export type CityOption = {
  slug: CitySlug;
  name: string;
};

const CITY_STATUSES: readonly CityStatus[] = ["active", "soon", "planned"];

function isCityStatus(value: string): value is CityStatus {
  return (CITY_STATUSES as readonly string[]).includes(value);
}

function asCitySlug(slug: string): CitySlug {
  return slug as CitySlug;
}

function readDistricts(city: GeoCityJson): District[] {
  return city.districts.map((district) => ({
    slug: district.slug,
    name: district.name,
    aliases: "aliases" in district && Array.isArray(district.aliases) ? [...district.aliases] : [],
  }));
}

function readCity(city: GeoCityJson): City {
  if (!isCityStatus(city.status)) {
    throw new Error(`geo.json: неизвестный status у ${city.slug}`);
  }

  return {
    slug: asCitySlug(city.slug),
    region: city.region,
    status: city.status,
    name: city.name,
    center: city.center,
    zoom: city.zoom,
    priority: city.priority,
    aliases: [...city.aliases],
    districts: readDistricts(city),
    ...("population" in city ? { population: city.population } : {}),
  };
}

const CITIES: City[] = geoJson.cities.map(readCity).sort((a, b) => a.priority - b.priority);

const CITIES_BY_SLUG = new Map<string, City>(CITIES.map((city) => [city.slug, city]));

type AliasHit = {
  alias: string;
  slug: CitySlug;
};

const GENERIC_DISTRICT_NAME_MAX = 6;

function districtSearchTerms(district: District): string[] {
  const terms = [...district.aliases];
  if (district.name.length > GENERIC_DISTRICT_NAME_MAX || district.name.includes(" ")) {
    terms.push(district.name);
  }
  return terms;
}

function aliasVariants(alias: string): string[] {
  const variants = [alias];
  if ((alias.endsWith("ский") || alias.endsWith("ской")) && alias.length >= 8) {
    variants.push(`${alias.slice(0, -4)}ск`);
  }
  return variants;
}

function collectAliasHits(): AliasHit[] {
  const firstWins = new Map<string, CitySlug>();

  for (const city of CITIES) {
    const cityTerms = new Set<string>([
      city.name.nom,
      city.name.gen,
      city.name.loc,
      city.name.adj,
      ...city.aliases,
    ]);

    for (const term of cityTerms) {
      const alias = term.trim().toLocaleLowerCase("ru-RU");
      for (const variant of aliasVariants(alias)) {
        if (variant && !firstWins.has(variant)) {
          firstWins.set(variant, city.slug);
        }
      }
    }

    for (const district of city.districts) {
      for (const term of districtSearchTerms(district)) {
        const alias = term.trim().toLocaleLowerCase("ru-RU");
        for (const variant of aliasVariants(alias)) {
          if (variant && !firstWins.has(variant)) {
            firstWins.set(variant, city.slug);
          }
        }
      }
    }
  }

  return [...firstWins.entries()]
    .map(([alias, slug]) => ({ alias, slug }))
    .sort((a, b) => b.alias.length - a.alias.length || a.slug.localeCompare(b.slug));
}

const ALIAS_HITS = collectAliasHits();

function byPriority(cities: City[]): City[] {
  return [...cities].sort((a, b) => a.priority - b.priority);
}

export function getCity(slug: string): City | undefined {
  return CITIES_BY_SLUG.get(slug);
}

export function isCitySlug(slug: string): slug is CitySlug {
  return CITIES_BY_SLUG.has(slug);
}

export function isActiveCity(slug: string): boolean {
  return getCity(slug)?.status === "active";
}

export function isSelectableCity(slug: string): slug is CitySlug {
  const city = getCity(slug);
  return city !== undefined && (city.status === "active" || city.status === "soon");
}

export function getActiveCities(): City[] {
  return byPriority(CITIES.filter((city) => city.status === "active"));
}

export function getSelectableCities(): City[] {
  return byPriority(CITIES.filter((city) => city.status === "active" || city.status === "soon"));
}

export function getPlannedCities(): City[] {
  return byPriority(CITIES.filter((city) => city.status === "planned"));
}

export function getDistricts(slug: string): District[] {
  return getCity(slug)?.districts ?? [];
}

export function getDefaultCity(): City {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_CITY;
  if (fromEnv) {
    const city = getCity(fromEnv);
    if (city?.status === "active") {
      return city;
    }
  }

  const [firstActive] = getActiveCities();
  if (!firstActive) {
    throw new Error("geo.json: нет ни одного города со статусом active");
  }

  return firstActive;
}

export function cityName(slug: CitySlug, form: NameCase): string {
  const city = getCity(slug);
  if (!city) {
    throw new Error(`Неизвестный slug города: ${slug}`);
  }
  return city.name[form];
}

export function resolveCityFromText(text: string): CitySlug | null {
  const haystack = text.trim().toLocaleLowerCase("ru-RU");
  if (!haystack) {
    return null;
  }

  for (const hit of ALIAS_HITS) {
    if (haystack.includes(hit.alias)) {
      return hit.slug;
    }
  }

  return null;
}

export function getCitySelectGroups(): { active: CityOption[]; soon: CityOption[] } {
  return {
    active: getActiveCities().map((city) => ({ slug: city.slug, name: city.name.nom })),
    soon: getSelectableCities()
      .filter((city) => city.status === "soon")
      .map((city) => ({ slug: city.slug, name: city.name.nom })),
  };
}

export function cityStaticParams(): { city: CitySlug }[] {
  return getSelectableCities().map((city) => ({ city: city.slug }));
}

type _JsonSlug = GeoCityJson["slug"];
type _SlugIsFromJson = CitySlug extends _JsonSlug ? true : never;
const _slugTypeCheck: _SlugIsFromJson = true;
void _slugTypeCheck;

const _nameCases: NameCase[] = ["nom", "gen", "loc", "adj"];
void _nameCases;
