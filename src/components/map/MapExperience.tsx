"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { MapSelectedCard } from "@/components/map/MapSelectedCard";
import type { MapCanvasProps, MapInteractiveLibrary, MapPageVariant, MapPoint } from "@/lib/maps/types";

function MapStaticPreview({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
        Схема города сейчас недоступна. Можно открыть адреса в навигаторе в списке ниже.
      </p>
    );
  }
  return (
    // Картинка только на странице карты и с loading=lazy — в первую загрузку сайта её нет.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      width={600}
      height={300}
      loading="lazy"
      decoding="async"
      className="h-auto w-full max-w-full rounded-lg border border-border"
    />
  );
}

export function MapExperience({
  variant,
  offerInteractive,
  library,
  yandexKey,
  previewUrl,
  previewAlt,
  points,
  center,
  zoom,
}: {
  variant: Exclude<MapPageVariant, "list">;
  offerInteractive: boolean;
  library: MapInteractiveLibrary | null;
  yandexKey: string | null;
  previewUrl: string | null;
  previewAlt: string;
  points: MapPoint[];
  center: { lat: number; lng: number };
  zoom: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [Canvas, setCanvas] = useState<ComponentType<MapCanvasProps & { yandexKey?: string }> | null>(
    null,
  );
  const slotRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!library || phase === "loading" || phase === "ready") {
      return;
    }
    setPhase("loading");
    try {
      if (library === "yandex") {
        const mod = await import(/* webpackPrefetch: false */ "./YandexCanvas");
        setCanvas(() => mod.YandexCanvas);
      } else {
        const mod = await import(/* webpackPrefetch: false */ "./MapLibreCanvas");
        setCanvas(() => mod.MapLibreCanvas);
      }
      setPhase("ready");
    } catch (cause) {
      console.error("[map] не удалось загрузить библиотеку карты", cause);
      setPhase("error");
    }
  }, [library, phase]);

  useEffect(() => {
    const interactive = variant === "full" && library != null;
    if (interactive === false) {
      return;
    }
    const node = slotRef.current;
    if (!node) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load();
          observer.disconnect();
        }
      },
      { rootMargin: "80px", threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [variant, library, load]);

  const selected = points.find((item) => item.id === selectedId) ?? null;
  const showInteractive = Boolean(Canvas) && phase === "ready" && library;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {variant === "lite" && showInteractive === false ? (
        <>
          <MapStaticPreview url={previewUrl} alt={previewAlt} />
          {offerInteractive && library ? (
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm text-muted">
                Интерактивная карта подгрузит библиотеку (около 250 КБ) и тайлы. На слабой связи это
                заметно.
              </p>
              <Button type="button" variant="outline" onClick={() => void load()}>
                Открыть интерактивную карту
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <div ref={slotRef} className="min-w-0">
        {variant === "full" && phase === "idle" ? (
          <button
            type="button"
            className="flex min-h-map h-map w-full items-center justify-center rounded-lg border border-border bg-surface-muted px-4 text-center text-md"
            onClick={() => void load()}
          >
            Показать карту
          </button>
        ) : null}
        {phase === "loading" ? (
          <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
            Загружаем карту…
          </p>
        ) : null}
        {phase === "error" ? (
          <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
            Не удалось загрузить карту. Адреса и ссылки в навигатор есть в списке ниже.
          </p>
        ) : null}
        {showInteractive && Canvas ? (
          <Canvas
            points={points}
            center={center}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={setSelectedId}
            yandexKey={yandexKey ?? undefined}
          />
        ) : null}
      </div>

      {selected ? <MapSelectedCard point={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}
