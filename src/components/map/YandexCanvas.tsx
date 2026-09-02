"use client";

import { useEffect, useRef } from "react";
import type { MapCanvasProps } from "@/lib/maps/types";

type YMaps = {
  ready: (cb: () => void) => void;
  Map: new (
    node: HTMLElement,
    state: { center: number[]; zoom: number; controls?: string[] },
  ) => {
    geoObjects: { add: (item: unknown) => void };
    destroy: () => void;
    setCenter: (center: number[], zoom?: number) => void;
  };
  ObjectManager: new (options: { clusterize: boolean; gridSize: number }) => {
    add: (geojson: unknown) => void;
    removeAll: () => void;
    objects: {
      events: {
        add: (type: string, handler: (event: { get: (key: string) => string }) => void) => void;
      };
    };
  };
};

declare global {
  interface Window {
    ymaps?: YMaps;
  }
}

function loadYandex(key: string): Promise<YMaps> {
  if (window.ymaps) {
    return Promise.resolve(window.ymaps);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-tr-yandex-maps]");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.ymaps) {
          resolve(window.ymaps);
        } else {
          reject(new Error("Yandex Maps"));
        }
      });
      existing.addEventListener("error", () => reject(new Error("Yandex Maps")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    script.async = true;
    script.dataset.trYandexMaps = "1";
    script.onload = () => {
      if (window.ymaps) {
        resolve(window.ymaps);
      } else {
        reject(new Error("Yandex Maps"));
      }
    };
    script.onerror = () => reject(new Error("Yandex Maps"));
    document.head.appendChild(script);
  });
}

export function YandexCanvas({
  points,
  center,
  zoom,
  selectedId,
  onSelect,
  yandexKey,
}: MapCanvasProps & { yandexKey?: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ destroy: () => void; setCenter: (center: number[], zoom?: number) => void } | null>(
    null,
  );
  const managerRef = useRef<{ add: (geojson: unknown) => void; removeAll: () => void } | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!yandexKey) {
      return;
    }
    const root = rootRef.current;
    if (!root) {
      return;
    }
    let cancelled = false;

    void loadYandex(yandexKey).then((ymaps) => {
      if (cancelled || !rootRef.current) {
        return;
      }
      ymaps.ready(() => {
        if (cancelled || !rootRef.current) {
          return;
        }
        const map = new ymaps.Map(rootRef.current, {
          center: [center.lat, center.lng],
          zoom,
          controls: ["zoomControl"],
        });
        const manager = new ymaps.ObjectManager({ clusterize: true, gridSize: 64 });
        manager.add({
          type: "FeatureCollection",
          features: points.map((point) => ({
            type: "Feature",
            id: point.id,
            geometry: { type: "Point", coordinates: [point.lat, point.lng] },
            properties: { hintContent: point.title },
          })),
        });
        manager.objects.events.add("click", (event) => {
          onSelectRef.current(event.get("objectId"));
        });
        map.geoObjects.add(manager);
        mapRef.current = map;
        managerRef.current = manager;
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      managerRef.current = null;
    };
    // Карту создаём один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yandexKey]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) {
      return;
    }
    manager.removeAll();
    manager.add({
      type: "FeatureCollection",
      features: points.map((point) => ({
        type: "Feature",
        id: point.id,
        geometry: { type: "Point", coordinates: [point.lat, point.lng] },
        properties: { hintContent: point.title },
      })),
    });
  }, [points]);

  useEffect(() => {
    if (!selectedId || !mapRef.current) {
      return;
    }
    const point = points.find((item) => item.id === selectedId);
    if (point) {
      mapRef.current.setCenter([point.lat, point.lng], 16);
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
