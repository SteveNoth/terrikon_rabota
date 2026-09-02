import { NavigatorLink } from "@/components/map/NavigatorLink";
import { VacancyMapReveal } from "@/components/vacancy/VacancyMapReveal";
import { maps } from "@/lib/adapters/maps";
import { navigatorHrefFor } from "@/lib/maps/points";
import type { QualityMap } from "@/lib/quality/types";

export function VacancyMap({
  address,
  latitude,
  longitude,
  mapMode,
  citySlug,
}: {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mapMode: QualityMap;
  citySlug?: string;
}) {
  const hasPoint = latitude != null && longitude != null;
  if (!address && !hasPoint) {
    return null;
  }

  const navigatorHref = navigatorHrefFor(latitude, longitude, address);

  if (mapMode === "text") {
    return (
      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="font-display text-xl font-medium">Адрес</h2>
        {address ? <p className="min-w-0 break-words">{address}</p> : null}
        {navigatorHref ? (
          <p>
            <NavigatorLink href={navigatorHref} />
          </p>
        ) : null}
        {citySlug ? (
          <p>
            <a href={`/${citySlug}/map`} className="text-brand underline-offset-2 hover:underline">
              Все вакансии на карте
            </a>
          </p>
        ) : null}
      </section>
    );
  }

  const previewUrl =
    mapMode === "static" && hasPoint
      ? maps.staticPreviewUrl({ lat: latitude, lng: longitude })
      : null;

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="font-display text-xl font-medium">Адрес</h2>
      {address ? <p className="min-w-0 break-words">{address}</p> : null}
      <VacancyMapReveal
        mode={mapMode === "interactive" ? "interactive" : "static"}
        address={address}
        previewUrl={previewUrl}
        navigatorHref={navigatorHref}
      />
      {citySlug ? (
        <p>
          <a href={`/${citySlug}/map`} className="text-brand underline-offset-2 hover:underline">
            Все вакансии на карте
          </a>
        </p>
      ) : null}
    </section>
  );
}
