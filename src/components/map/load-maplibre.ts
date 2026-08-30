/**
 * MapLibre не импортируем из node_modules: Turbopack ломается на воркере
 * (`new URL(..., import.meta.url)`). ESM лежит в /public/maplibre/ и
 * подключается только в браузере, когда карту открыли.
 */

export type GeoJSONSource = {
  setData: (data: unknown) => void;
  getClusterExpansionZoom: (clusterId: number) => Promise<number>;
};

export type MapLibreClickEvent = {
  point: unknown;
  features?: Array<{
    properties?: { cluster_id?: number; id?: string };
    geometry: { type: string; coordinates: number[] };
  }>;
};

export type MapLibreMap = {
  on: (
    type: string,
    layerOrHandler: string | ((event: MapLibreClickEvent) => void),
    handler?: (event: MapLibreClickEvent) => void,
  ) => void;
  addSource: (id: string, spec: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => GeoJSONSource | undefined;
  getLayer: (id: string) => unknown;
  setFilter: (id: string, filter: unknown) => void;
  easeTo: (opts: { center: [number, number]; zoom: number }) => void;
  getZoom: () => number;
  getCanvas: () => HTMLCanvasElement;
  queryRenderedFeatures: (
    point: unknown,
    opts: { layers: string[] },
  ) => NonNullable<MapLibreClickEvent["features"]>;
  remove: () => void;
  resize: () => void;
};

type MapLibreApi = {
  Map: new (options: {
    container: HTMLElement;
    style: unknown;
    center: [number, number];
    zoom: number;
  }) => MapLibreMap;
  setWorkerUrl: (url: string) => void;
};

function importFromPublic(url: string): Promise<MapLibreApi> {
  // Бандлер не должен видеть путь: иначе снова «Can't resolve <dynamic>».
  const importer = new Function("u", "return import(u)") as (href: string) => Promise<MapLibreApi>;
  return importer(url);
}

let pending: Promise<MapLibreApi> | null = null;

export function loadMapLibre(): Promise<MapLibreApi> {
  if (!pending) {
    pending = importFromPublic("/maplibre/maplibre-gl.mjs").then((mod) => {
      const api =
        "Map" in mod && typeof mod.Map === "function"
          ? mod
          : (mod as unknown as { default: MapLibreApi }).default;
      api.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      return api;
    });
  }
  return pending;
}
