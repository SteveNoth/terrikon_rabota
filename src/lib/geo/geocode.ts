/**
 * Геокодирование для парсера и админки. Со страниц не вызывать:
 * на отрисовке читаем уже сохранённые latitude/longitude.
 *
 * Порядок: город не active → внешнего запроса нет; кэш → внешний запрос
 * с паузой; если адрес не распознан — центр района, иначе центр города.
 * Точность (exact / district / city) пишем честно.
 */

import { GeocodeAccuracy } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { maps, readMapsProvider } from "@/lib/adapters/maps";
import { buildGeocodeQuery } from "@/lib/geo/geocode-query";
import { fallbackMapPoint, getCity, isActiveCity } from "@/lib/geo";
import { log } from "@/lib/log";

export type { GeocodeAccuracy };

export type GeocodeResolveInput = {
  citySlug: string;
  address?: string | null;
  districtSlug?: string | null;
};

export type GeocodeResolveResult = {
  lat: number;
  lng: number;
  accuracy: GeocodeAccuracy;
  query: string;
  cached: boolean;
  /** Был ли запрос к Nominatim / Яндексу. На повторном адресе всегда false. */
  external: boolean;
  skipped?: "city-inactive";
};

function providerName(): string {
  const mapsProvider = readMapsProvider();
  if (mapsProvider === "yandex" && process.env.YANDEX_GEOCODER_API_KEY?.trim()) {
    return "yandex";
  }
  return "nominatim";
}

async function readCache(query: string): Promise<{
  lat: number;
  lng: number;
  accuracy: GeocodeAccuracy;
} | null> {
  return prisma.geocodeCache.findUnique({
    where: { query },
    select: { lat: true, lng: true, accuracy: true },
  });
}

async function writeCache(input: {
  query: string;
  lat: number;
  lng: number;
  accuracy: GeocodeAccuracy;
  provider: string;
}): Promise<void> {
  await prisma.geocodeCache.upsert({
    where: { query: input.query },
    create: {
      query: input.query,
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      provider: input.provider,
    },
    update: {},
  });
}

function fallbackResult(
  citySlug: string,
  districtSlug: string | null | undefined,
): { lat: number; lng: number; accuracy: GeocodeAccuracy } | null {
  const point = fallbackMapPoint(citySlug, districtSlug);
  if (!point) {
    return null;
  }
  return {
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy === "DISTRICT" ? GeocodeAccuracy.DISTRICT : GeocodeAccuracy.CITY,
  };
}

/**
 * Переводит адрес вакансии в координаты. Если города нет среди active —
 * внешнего запроса нет вообще (экономим лимит).
 */
export async function resolveVacancyCoordinates(
  input: GeocodeResolveInput,
): Promise<GeocodeResolveResult | null> {
  const city = getCity(input.citySlug);
  if (!city) {
    return null;
  }
  if (!isActiveCity(city.slug)) {
    return {
      lat: city.center.lat,
      lng: city.center.lng,
      accuracy: GeocodeAccuracy.CITY,
      query: "",
      cached: false,
      external: false,
      skipped: "city-inactive",
    };
  }

  const district = input.districtSlug
    ? city.districts.find((item) => item.slug === input.districtSlug)
    : undefined;
  const query = buildGeocodeQuery({
    cityName: city.name.nom,
    address: input.address,
    districtName: district?.name ?? null,
  });

  const cached = await readCache(query);
  if (cached) {
    return {
      lat: cached.lat,
      lng: cached.lng,
      accuracy: cached.accuracy,
      query,
      cached: true,
      external: false,
    };
  }

  const fallback = fallbackResult(city.slug, input.districtSlug);
  if (!fallback) {
    return null;
  }

  const hasAddress = Boolean(input.address?.trim());
  if (!hasAddress) {
    await writeCache({
      query,
      lat: fallback.lat,
      lng: fallback.lng,
      accuracy: fallback.accuracy,
      provider: "fallback",
    });
    return { ...fallback, query, cached: false, external: false };
  }

  try {
    const exact = await maps.geocode(query);
    if (exact) {
      await writeCache({
        query,
        lat: exact.lat,
        lng: exact.lng,
        accuracy: GeocodeAccuracy.EXACT,
        provider: providerName(),
      });
      return {
        lat: exact.lat,
        lng: exact.lng,
        accuracy: GeocodeAccuracy.EXACT,
        query,
        cached: false,
        external: true,
      };
    }
  } catch (cause) {
    log.error("geocode", "внешний запрос не удался, точку не кэшируем", cause);
    return { ...fallback, query, cached: false, external: true };
  }

  await writeCache({
    query,
    lat: fallback.lat,
    lng: fallback.lng,
    accuracy: fallback.accuracy,
    provider: `${providerName()}+fallback`,
  });
  return { ...fallback, query, cached: false, external: true };
}

/**
 * Парсер и админка вызывают это после сохранения адреса: внешний геокодер
 * (если нужно) + запись lat/lng/точности в вакансию. Со страниц не вызывать.
 */
export async function applyVacancyGeocode(vacancyId: string): Promise<GeocodeResolveResult | null> {
  const row = await prisma.vacancy.findUnique({
    where: { id: vacancyId },
    select: { citySlug: true, address: true, districtSlug: true },
  });
  if (!row) {
    return null;
  }
  const result = await resolveVacancyCoordinates(row);
  if (!result) {
    return null;
  }
  await prisma.vacancy.update({
    where: { id: vacancyId },
    data: {
      latitude: result.lat,
      longitude: result.lng,
      geocodeAccuracy: result.accuracy,
    },
  });
  return result;
}

export { geocodeAccuracyNote } from "@/lib/geo/geocode-query";
