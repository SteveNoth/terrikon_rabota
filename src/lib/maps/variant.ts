import type { MapRenderMode } from "@/lib/adapters/maps";
import type { MapInteractiveLibrary, MapPageVariant } from "@/lib/maps/types";
import type { QualityMap } from "@/lib/quality/types";

/**
 * Что рисуем на /[city]/map: качество может только урезать, адаптер — отключить.
 * Компоненты спрашивают этот результат, а не MAPS_PROVIDER и не имя режима.
 */
export function mapPageVariant(
  qualityMap: QualityMap,
  renderMode: MapRenderMode,
): MapPageVariant {
  if (qualityMap === "text" || renderMode === "none") {
    return "list";
  }
  if (qualityMap === "interactive" && renderMode === "interactive") {
    return "full";
  }
  return "lite";
}

export function mapOffersInteractive(
  qualityMap: QualityMap,
  renderMode: MapRenderMode,
): boolean {
  return renderMode === "interactive" && qualityMap !== "text";
}

export function mapInteractiveLibrary(
  renderMode: MapRenderMode,
  provider: string,
  yandexKey: string | null,
): MapInteractiveLibrary | null {
  if (renderMode !== "interactive") {
    return null;
  }
  if (provider === "yandex" && yandexKey) {
    return "yandex";
  }
  return "maplibre";
}
