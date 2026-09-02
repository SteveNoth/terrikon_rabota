import { maps, mapsSearchLink } from "@/lib/adapters/maps";
import { formatMoney } from "@/lib/format/money";
import { districtName } from "@/lib/geo";
import { geocodeAccuracyNote } from "@/lib/geo/geocode-query";
import type { MapPoint, MapPointAccuracy } from "@/lib/maps/types";
import type { MapVacancyRecord } from "@/lib/repo/vacancies";
import { vacancyPath } from "@/lib/vacancy/path";

function accuracyFrom(value: string | null | undefined): MapPointAccuracy {
  if (value === "DISTRICT" || value === "district") {
    return "district";
  }
  if (value === "CITY" || value === "city") {
    return "city";
  }
  return "exact";
}

export function toMapPoint(record: MapVacancyRecord, citySlug: string): MapPoint | null {
  if (record.latitude == null || record.longitude == null) {
    return null;
  }
  const accuracy = accuracyFrom(record.geocodeAccuracy);
  return {
    id: record.id,
    slug: record.slug,
    href: vacancyPath(citySlug, record.slug),
    title: record.title,
    salary: formatMoney(record),
    districtName: districtName(citySlug, record.districtSlug),
    address: record.address?.trim() || null,
    lat: record.latitude,
    lng: record.longitude,
    accuracy,
    accuracyNote: geocodeAccuracyNote(record.geocodeAccuracy),
    navigatorHref: maps.navigatorLink(record.latitude, record.longitude, record.address ?? undefined),
  };
}

export function toMapPoints(records: MapVacancyRecord[], citySlug: string): MapPoint[] {
  const points: MapPoint[] = [];
  for (const record of records) {
    const point = toMapPoint(record, citySlug);
    if (point) {
      points.push(point);
    }
  }
  return points;
}

export function navigatorHrefFor(
  lat: number | null | undefined,
  lng: number | null | undefined,
  address?: string | null,
): string | null {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return maps.navigatorLink(lat, lng, address ?? undefined);
  }
  if (address?.trim()) {
    return mapsSearchLink(address.trim());
  }
  return null;
}

export function navigatorHrefForRecord(record: MapVacancyRecord): string | null {
  return navigatorHrefFor(record.latitude, record.longitude, record.address);
}

/** Внешняя карта — в новой вкладке, как остальные внешние ссылки. */
export function navigatorAnchorAttrs(href: string): {
  target?: "_blank";
  rel?: "noopener noreferrer";
} {
  if (href.startsWith("https:") || href.startsWith("http:")) {
    return { target: "_blank", rel: "noopener noreferrer" };
  }
  return {};
}

export function navigatorAnchorExtras(href: string): string {
  if (href.startsWith("https:") || href.startsWith("http:")) {
    return ` target="_blank" rel="noopener noreferrer"`;
  }
  return "";
}
