import { CityDevelopmentPlaceholder } from "@/components/geo/CityDevelopmentPlaceholder";
import { MapExperience } from "@/components/map/MapExperience";
import { MapFilters } from "@/components/map/MapFilters";
import { MapPointsList } from "@/components/map/MapPointsList";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { maps, mapsYandexBrowserKey, readMapsProvider } from "@/lib/adapters/maps";
import { cn } from "@/lib/format/cn";
import { foundVacancies } from "@/lib/format/plural";
import {
  cityName,
  getCity,
  getDistricts,
  isActiveCity,
  type CitySlug,
} from "@/lib/geo";
import { toMapPoints } from "@/lib/maps/points";
import { mapInteractiveLibrary, mapOffersInteractive, mapPageVariant } from "@/lib/maps/variant";
import { listSpheres } from "@/lib/professions";
import { getRequestQuality } from "@/lib/quality/request";
import { listMapVacancies } from "@/lib/repo/vacancies";
import { parseVacancyQuery } from "@/lib/validation/vacancy-query";
import Link from "next/link";

export async function MapPage({
  citySlug,
  searchParams,
}: {
  citySlug: CitySlug;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const city = getCity(citySlug);
  if (!city) {
    return null;
  }

  const { features } = await getRequestQuality();
  const query = parseVacancyQuery(searchParams, {
    city: citySlug,
    pageSize: 1,
    workFormat: "LOCAL",
  });
  const variant = mapPageVariant(features.map, maps.renderMode());
  const offerInteractive = mapOffersInteractive(features.map, maps.renderMode());
  const library = mapInteractiveLibrary(maps.renderMode(), readMapsProvider(), mapsYandexBrowserKey());
  const previewUrl = maps.staticPreviewUrl({
    lat: city.center.lat,
    lng: city.center.lng,
    zoom: city.zoom,
    width: 600,
    height: 300,
  });

  if (!isActiveCity(citySlug)) {
    return (
      <div className="mx-auto flex max-w-container min-w-0 flex-col gap-4 px-4 py-6">
        <h1 className="font-display text-2xl font-medium">Карта вакансий {cityName(citySlug, "gen")}</h1>
        <CityDevelopmentPlaceholder citySlug={citySlug} heading="section" />
      </div>
    );
  }

  const records = await listMapVacancies({
    citySlug,
    sphere: query.sphere,
    salaryFrom: query.salaryFrom,
    districtSlug: query.district,
  });
  const points = toMapPoints(records, citySlug);
  const filtered = Boolean(query.sphere || query.salaryFrom != null || query.district);
  const listed = records.filter(
    (row) => row.address?.trim() || (row.latitude != null && row.longitude != null),
  );

  return (
    <div className="mx-auto flex max-w-container min-w-0 flex-col gap-4 px-4 py-6">
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-2xl font-medium">Карта вакансий {cityName(citySlug, "gen")}</h1>
        <p className="text-md text-muted">
          {variant === "list"
            ? "В этом режиме карты нет — только адреса и ссылка в навигатор."
            : "Точки — местные вакансии. Вахта на карте города не показывается."}
        </p>
        <p className="text-md">{foundVacancies(listed.length)}</p>
      </header>

      <MapFilters
        citySlug={citySlug}
        sphere={query.sphere}
        salaryFrom={query.salaryFrom}
        district={query.district}
        spheres={listSpheres()}
        districts={getDistricts(citySlug)}
      />

      {listed.length === 0 ? (
        <EmptyState
          icon="map"
          title="На карте пока пусто"
          description={
            filtered
              ? "По этому набору условий точек нет. Сбросьте сферу, зарплату или район."
              : "Нет местных вакансий с адресом."
          }
          action={
            <div className="flex flex-col items-center gap-3">
              {filtered ? (
                <Link href={`/${citySlug}/map`} className={cn(buttonVariants({ variant: "primary" }))}>
                  Сбросить фильтры
                </Link>
              ) : null}
              <Link href={`/${citySlug}/jobs`} className={cn(buttonVariants({ variant: "outline" }))}>
                К списку вакансий
              </Link>
            </div>
          }
        />
      ) : (
        <>
          {variant !== "list" ? (
            <MapExperience
              variant={variant}
              offerInteractive={offerInteractive}
              library={library}
              yandexKey={mapsYandexBrowserKey()}
              previewUrl={previewUrl}
              previewAlt={`Схема ${cityName(citySlug, "gen")}`}
              points={points}
              center={city.center}
              zoom={city.zoom}
            />
          ) : null}
          <MapPointsList citySlug={citySlug} records={listed} />
        </>
      )}
    </div>
  );
}
