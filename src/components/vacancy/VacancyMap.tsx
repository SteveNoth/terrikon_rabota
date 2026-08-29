import { VacancyMapReveal } from "@/components/vacancy/VacancyMapReveal";
import { maps } from "@/lib/adapters/maps";
import type { QualityMap } from "@/lib/quality/types";

export function VacancyMap({
  address,
  latitude,
  longitude,
  mapMode,
}: {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mapMode: QualityMap;
}) {
  const hasPoint = latitude != null && longitude != null;
  if (!address && !hasPoint) {
    return null;
  }

  const navigatorHref = hasPoint
    ? maps.navigatorLink(latitude, longitude, address ?? undefined)
    : `geo:0,0?q=${encodeURIComponent(address ?? "")}`;

  if (mapMode === "text") {
    return (
      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="font-display text-xl font-medium">Адрес</h2>
        {address ? <p className="min-w-0 break-words">{address}</p> : null}
        <p>
          <a href={navigatorHref} className="text-brand underline-offset-2 hover:underline">
            Открыть в навигаторе
          </a>
        </p>
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
    </section>
  );
}
