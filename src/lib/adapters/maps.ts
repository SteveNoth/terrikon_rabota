/**
 * Переходник карт (Закон 6).
 *
 * Выбор: MAPS_PROVIDER=maplibre | yandex | static | none.
 * Компоненты спрашивают renderMode(), staticPreviewUrl() и navigatorLink() —
 * какой сервис под капотом, они не знают.
 *
 * geocode() — только внешний запрос (Nominatim или Яндекс). Кэш, проверка
 * «город active» и запасная точка района/города живут в src/lib/geo/geocode.ts
 * и вызываются из парсера и админки, не со страницы.
 */

export type MapRenderMode = "interactive" | "static" | "none";
export type MapsProvider = "maplibre" | "yandex" | "static" | "none";

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

const NOMINATIM_GAP_MS = 1100;
const GEOCODE_TIMEOUT_MS = 8000;

const globalForGeocode = globalThis as unknown as {
  geocodeChain?: Promise<unknown>;
  geocodeLastAt?: number;
  geocodeExternalCount?: number;
};

export function geocodeExternalCallCount(): number {
  return globalForGeocode.geocodeExternalCount ?? 0;
}

export function resetGeocodeExternalCallCount(): void {
  globalForGeocode.geocodeExternalCount = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function geocodeUserAgent(): string {
  const fromEnv = process.env.GEOCODE_USER_AGENT?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://github.com/SteveNoth/terrikon_rabota";
  return `TerriconRabota/0.1 (${site})`;
}

async function pacedExternal<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const last = globalForGeocode.geocodeLastAt ?? 0;
    const wait = last + NOMINATIM_GAP_MS - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    globalForGeocode.geocodeLastAt = Date.now();
    globalForGeocode.geocodeExternalCount = (globalForGeocode.geocodeExternalCount ?? 0) + 1;
    return fn();
  };

  const pending = (globalForGeocode.geocodeChain ?? Promise.resolve()).then(run, run);
  globalForGeocode.geocodeChain = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

async function nominatimGeocode(query: string): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "ru",
      "User-Agent": geocodeUserAgent(),
    },
    signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Nominatim ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  const first = payload[0];
  if (!first || typeof first !== "object") {
    return null;
  }
  const latRaw = "lat" in first ? first.lat : null;
  const lonRaw = "lon" in first ? first.lon : null;
  const lat = typeof latRaw === "string" ? Number(latRaw) : Number(latRaw);
  const lng = typeof lonRaw === "string" ? Number(lonRaw) : Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

async function yandexGeocode(query: string, key: string): Promise<GeocodeResult | null> {
  const url = new URL("https://geocode-maps.yandex.ru/1.x/");
  url.searchParams.set("apikey", key);
  url.searchParams.set("geocode", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("results", "1");
  url.searchParams.set("lang", "ru_RU");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": geocodeUserAgent(),
    },
    signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Yandex geocoder ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("response" in payload)) {
    return null;
  }
  const responseBody = (payload as { response?: unknown }).response;
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }
  const collection = (responseBody as { GeoObjectCollection?: { featureMember?: unknown } })
    .GeoObjectCollection;
  const members = collection?.featureMember;
  if (!Array.isArray(members) || members.length === 0) {
    return null;
  }
  const geo = members[0] as { GeoObject?: { Point?: { pos?: string } } };
  const pos = geo.GeoObject?.Point?.pos?.trim();
  if (!pos) {
    return null;
  }
  const [lngRaw, latRaw] = pos.split(/\s+/);
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

function osmStaticUrl(params: StaticPreviewParams): string {
  const zoom = params.zoom ?? 13;
  const width = Math.min(params.width ?? 600, 1280);
  const height = Math.min(params.height ?? 300, 1280);
  const center = `${params.lat},${params.lng}`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(center)}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik`;
}

function yandexStaticUrl(params: StaticPreviewParams, key: string | null): string {
  const zoom = params.zoom ?? 13;
  const width = Math.min(params.width ?? 600, 650);
  const height = Math.min(params.height ?? 300, 450);
  const ll = `${params.lng},${params.lat}`;
  const url = new URL("https://static-maps.yandex.ru/1.x/");
  url.searchParams.set("ll", ll);
  url.searchParams.set("z", String(zoom));
  url.searchParams.set("size", `${width},${height}`);
  url.searchParams.set("l", "map");
  url.searchParams.set("pt", `${ll},pm2rdm`);
  if (key) {
    url.searchParams.set("apikey", key);
  }
  return url.toString();
}

function coordPair(lat: number, lng: number): { lat: number; lng: number } | null {
  const latN = Number(Number(lat).toFixed(6));
  const lngN = Number(Number(lng).toFixed(6));
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return null;
  }
  return { lat: latN, lng: lngN };
}

/**
 * Ссылка, которая открывается в браузере. Схема geo: на Windows ничего
 * не делает (нет обработчика), поэтому даём обычный https.
 */
function osmNavigatorLink(lat: number, lng: number, address?: string): string {
  const pair = coordPair(lat, lng);
  if (!pair) {
    return mapsSearchLink(address ?? "");
  }
  // Хэш OSM не через URL.hash: иначе слэши могут уехать в %2F, и карта не откроется.
  return `https://www.openstreetmap.org/?mlat=${pair.lat}&mlon=${pair.lng}#map=16/${pair.lat}/${pair.lng}`;
}

function osmSearchLink(query: string): string {
  const url = new URL("https://www.openstreetmap.org/search");
  url.searchParams.set("query", query);
  return url.toString();
}

function yandexNavigatorLink(lat: number, lng: number, address?: string): string {
  const pair = coordPair(lat, lng);
  if (!pair) {
    return yandexSearchLink(address ?? "");
  }
  const url = new URL("https://yandex.ru/maps/");
  url.searchParams.set("ll", `${pair.lng},${pair.lat}`);
  url.searchParams.set("pt", `${pair.lng},${pair.lat}`);
  url.searchParams.set("z", "16");
  url.searchParams.set("l", "map");
  if (address?.trim()) {
    url.searchParams.set("text", address.trim());
  }
  return url.toString();
}

function yandexSearchLink(query: string): string {
  const url = new URL("https://yandex.ru/maps/");
  if (query.trim()) {
    url.searchParams.set("text", query.trim());
  }
  return url.toString();
}

/** Поиск по строке адреса, если координат ещё нет. */
export function mapsSearchLink(query: string): string {
  const trimmed = query.trim();
  if (readMapsProvider() === "yandex" && yandexKey()) {
    return yandexSearchLink(trimmed);
  }
  if (!trimmed) {
    return "https://www.openstreetmap.org/";
  }
  return osmSearchLink(trimmed);
}

function yandexKey(): string | null {
  const key = process.env.YANDEX_MAPS_API_KEY?.trim();
  return key ? key : null;
}

function yandexGeocoderKey(): string | null {
  const key = process.env.YANDEX_GEOCODER_API_KEY?.trim();
  return key ? key : null;
}

class MaplibreMaps implements MapsAdapter {
  renderMode(): MapRenderMode {
    return "interactive";
  }
  geocode(query: string): Promise<GeocodeResult | null> {
    return pacedExternal(() => nominatimGeocode(query));
  }
  staticPreviewUrl(params: StaticPreviewParams): string | null {
    return osmStaticUrl(params);
  }
  navigatorLink(lat: number, lng: number, address?: string): string {
    return osmNavigatorLink(lat, lng, address);
  }
}

class YandexMaps implements MapsAdapter {
  renderMode(): MapRenderMode {
    return "interactive";
  }
  geocode(query: string): Promise<GeocodeResult | null> {
    const key = yandexGeocoderKey();
    if (key) {
      return pacedExternal(() => yandexGeocode(query, key));
    }
    return pacedExternal(() => nominatimGeocode(query));
  }
  staticPreviewUrl(params: StaticPreviewParams): string | null {
    return yandexStaticUrl(params, yandexKey());
  }
  navigatorLink(lat: number, lng: number, address?: string): string {
    return yandexNavigatorLink(lat, lng, address);
  }
}

class StaticMaps implements MapsAdapter {
  renderMode(): MapRenderMode {
    return "static";
  }
  geocode(query: string): Promise<GeocodeResult | null> {
    return pacedExternal(() => nominatimGeocode(query));
  }
  staticPreviewUrl(params: StaticPreviewParams): string | null {
    return osmStaticUrl(params);
  }
  navigatorLink(lat: number, lng: number, address?: string): string {
    return osmNavigatorLink(lat, lng, address);
  }
}

class NoneMaps implements MapsAdapter {
  renderMode(): MapRenderMode {
    return "none";
  }
  geocode(query: string): Promise<GeocodeResult | null> {
    return pacedExternal(() => nominatimGeocode(query));
  }
  staticPreviewUrl(params: StaticPreviewParams): string | null {
    void params;
    return null;
  }
  navigatorLink(lat: number, lng: number, address?: string): string {
    return osmNavigatorLink(lat, lng, address);
  }
}

export function readMapsProvider(): MapsProvider {
  const raw = (process.env.MAPS_PROVIDER ?? "maplibre").toLowerCase();
  if (raw === "yandex" || raw === "static" || raw === "none") {
    return raw;
  }
  return "maplibre";
}

function createMaps(): MapsAdapter {
  const provider = readMapsProvider();
  switch (provider) {
    case "yandex":
      if (!yandexKey()) {
        console.warn("[maps] MAPS_PROVIDER=yandex, но YANDEX_MAPS_API_KEY пуст — рисуем MapLibre");
        return new MaplibreMaps();
      }
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

export function mapsYandexBrowserKey(): string | null {
  return yandexKey();
}
