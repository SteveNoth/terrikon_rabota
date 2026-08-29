/**
 * Переходник карт (Закон 6).
 *
 * Выбор: MAPS_PROVIDER=maplibre | yandex | static | none.
 * Компоненты спрашивают `renderMode()` и ссылку в навигатор — какой сервис
 * под капотом, они не знают. Геокодер и превью на этом этапе заглушки:
 * внешних запросов нет, лимиты Nominatim не тратим.
 */

export type MapRenderMode = "interactive" | "static" | "none";

export type GeocodeResult = {
  lat: number;
  lng: number;
};

export type StaticPreviewParams = {
  lat: number;
  lng: number;
  zoom?: number;
  width?: number;
  height?: number;
};

export interface MapsAdapter {
  renderMode(): MapRenderMode;
  geocode(query: string): Promise<GeocodeResult | null>;
  staticPreviewUrl(params: StaticPreviewParams): string | null;
  navigatorLink(lat: number, lng: number, address?: string): string;
}

function geoLink(lat: number, lng: number, address?: string): string {
  const query = address?.trim() ? encodeURIComponent(address.trim()) : `${lat},${lng}`;
  return `geo:${lat},${lng}?q=${query}`;
}

class MaplibreMaps implements MapsAdapter {
  renderMode(): MapRenderMode {
    return "interactive";
  }
  async geocode(query: string): Promise<GeocodeResult | null> {
    void query;
    return null;
  }
  staticPreviewUrl(params: StaticPreviewParams): string | null {
    void params;
    return null;
  }
  navigatorLink(lat: number, lng: number, address?: string): string {
    return geoLink(lat, lng, address);
  }
}

class YandexMaps implements MapsAdapter {
  renderMode(): MapRenderMode {
    return "interactive";
  }
  async geocode(query: string): Promise<GeocodeResult | null> {
    void query;
    return null;
  }
  staticPreviewUrl(params: StaticPreviewParams): string | null {
    void params;
    return null;
  }
  navigatorLink(lat: number, lng: number, address?: string): string {
    return geoLink(lat, lng, address);
  }
}

class StaticMaps implements MapsAdapter {
  renderMode(): MapRenderMode {
    return "static";
  }
  async geocode(query: string): Promise<GeocodeResult | null> {
    void query;
    return null;
  }
  staticPreviewUrl(params: StaticPreviewParams): string | null {
    void params;
    return null;
  }
  navigatorLink(lat: number, lng: number, address?: string): string {
    return geoLink(lat, lng, address);
  }
}

class NoneMaps implements MapsAdapter {
  renderMode(): MapRenderMode {
    return "none";
  }
  async geocode(query: string): Promise<GeocodeResult | null> {
    void query;
    return null;
  }
  staticPreviewUrl(params: StaticPreviewParams): string | null {
    void params;
    return null;
  }
  navigatorLink(lat: number, lng: number, address?: string): string {
    return geoLink(lat, lng, address);
  }
}

function createMaps(): MapsAdapter {
  const provider = (process.env.MAPS_PROVIDER ?? "maplibre").toLowerCase();
  switch (provider) {
    case "yandex":
      return new YandexMaps();
    case "static":
      return new StaticMaps();
    case "none":
      return new NoneMaps();
    default:
      return new MaplibreMaps();
  }
}

export const maps = createMaps();
