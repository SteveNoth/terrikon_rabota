"use client";

import { useEffect, useRef } from "react";
import { loadMapLibre, type MapLibreMap } from "@/components/map/load-maplibre";
import type { MapCanvasProps } from "@/lib/maps/types";

function ensureMapLibreCss(): void {
  const href = "/maplibre/maplibre-gl.css";
  if (document.querySelector(`link[data-tr-maplibre-css]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.trMaplibreCss = "1";
  document.head.appendChild(link);
}

const SOURCE = "vacancies";
const LAYER_CLUSTERS = "vacancy-clusters";
const LAYER_COUNT = "vacancy-cluster-count";
const LAYER_POINTS = "vacancy-points";
const LAYER_SELECTED = "vacancy-selected";

const OSM_STYLE = {
  version: 8 as const,
  name: "OSM",
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

function cssColor(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

function toGeoJson(points: MapCanvasProps["points"]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] },
      properties: { id: point.id },
    })),
  };
}

export function MapLibreCanvas({
  points,
  center,
  zoom,
  selectedId,
  onSelect,
}: MapCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pointsRef = useRef(points);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    let cancelled = false;
    let ro: ResizeObserver | null = null;

    void (async () => {
      ensureMapLibreCss();
      const maplibregl = await loadMapLibre();
      if (cancelled || !rootRef.current) {
        return;
      }

      const brand = cssColor("--t-color-brand");
      const accent = cssColor("--t-color-accent");
      const brandText = cssColor("--t-color-brand-text");

      const map = new maplibregl.Map({
        container: rootRef.current,
        style: OSM_STYLE,
        center: [center.lng, center.lat],
        zoom,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) {
          return;
        }
        map.addSource(SOURCE, {
          type: "geojson",
          data: toGeoJson(pointsRef.current),
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 48,
        });
        map.addLayer({
          id: LAYER_CLUSTERS,
          type: "circle",
          source: SOURCE,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": brand,
            "circle-radius": ["step", ["get", "point_count"], 16, 8, 20, 20, 26],
            "circle-opacity": 0.92,
          },
        });
        map.addLayer({
          id: LAYER_COUNT,
          type: "symbol",
          source: SOURCE,
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
          },
          paint: {
            "text-color": brandText,
          },
        });
        map.addLayer({
          id: LAYER_POINTS,
          type: "circle",
          source: SOURCE,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": accent,
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": brandText,
          },
        });
        map.addLayer({
          id: LAYER_SELECTED,
          type: "circle",
          source: SOURCE,
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-color": brand,
            "circle-radius": 11,
            "circle-stroke-width": 3,
            "circle-stroke-color": accent,
          },
        });

        map.on("click", LAYER_CLUSTERS, (event) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point") {
            return;
          }
          const clusterId = feature.properties?.cluster_id;
          const source = map.getSource(SOURCE);
          if (typeof clusterId !== "number") {
            return;
          }
          if (source == null) {
            return;
          }
          const coords = feature.geometry.coordinates as [number, number];
          void source.getClusterExpansionZoom(clusterId).then((nextZoom) => {
            map.easeTo({ center: coords, zoom: nextZoom });
          });
        });

        map.on("click", LAYER_POINTS, (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") {
            onSelectRef.current(id);
          }
        });

        map.on("click", (event) => {
          const hits = map.queryRenderedFeatures(event.point, {
            layers: [LAYER_POINTS, LAYER_CLUSTERS],
          });
          if (!hits.length) {
            onSelectRef.current(null);
          }
        });

        map.on("mouseenter", LAYER_CLUSTERS, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYER_CLUSTERS, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseenter", LAYER_POINTS, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYER_POINTS, () => {
          map.getCanvas().style.cursor = "";
        });
      });

      ro = new ResizeObserver(() => {
        map.resize();
      });
      ro.observe(rootRef.current);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Карту создаём один раз; точки и выбор обновляются отдельными эффектами.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE);
    if (!source) {
      return;
    }
    source.setData(toGeoJson(points));
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(LAYER_SELECTED)) {
      return;
    }
    map.setFilter(LAYER_SELECTED, ["==", ["get", "id"], selectedId ?? ""]);
    if (!selectedId) {
      return;
    }
    const point = points.find((item) => item.id === selectedId);
    if (point) {
      map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 14) });
    }
  }, [selectedId, points]);

  return (
    <div
      ref={rootRef}
      className="min-h-map h-map w-full overflow-hidden rounded-lg border border-border"
      role="region"
      aria-label="Интерактивная карта вакансий"
    />
  );
}
