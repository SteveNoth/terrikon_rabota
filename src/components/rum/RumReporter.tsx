"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { QualityMode } from "@/lib/quality/types";

function skipPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/employer") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/dev") ||
    pathname === "/login"
  );
}

type MetricState = {
  lcpMs: number | null;
  cls: number;
  inpMs: number | null;
};

/**
 * Снимает LCP, CLS, INP без сторонней аналитики и без библиотек графиков.
 * На Ultra этого компонента нет: тонкий путь без JavaScript, режим пишет сервер.
 */
export function RumReporter({ mode }: { mode: QualityMode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (mode === "ultra" || skipPath(pathname)) {
      return;
    }
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
      return;
    }
    if (navigator.doNotTrack === "1") {
      return;
    }

    const state: MetricState = { lcpMs: null, cls: 0, inpMs: null };
    let sent = false;

    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        state.lcpMs = Math.round(last.startTime);
      }
    });
    try {
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      lcpObserver.disconnect();
    }

    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (!shift.hadRecentInput && typeof shift.value === "number") {
          state.cls += shift.value;
        }
      }
    });
    try {
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      clsObserver.disconnect();
    }

    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = Math.round(entry.duration);
        if (state.inpMs == null || duration > state.inpMs) {
          state.inpMs = duration;
        }
      }
    });
    try {
      inpObserver.observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    } catch {
      inpObserver.disconnect();
    }

    const send = () => {
      if (sent) {
        return;
      }
      sent = true;
      const body = JSON.stringify({
        lcpMs: state.lcpMs,
        cls: Math.round(state.cls * 10_000) / 10_000,
        inpMs: state.inpMs,
      });
      try {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/rum", blob);
          return;
        }
      } catch {
        /* fetch ниже */
      }
      void fetch("/api/rum", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
    };

    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        send();
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", send);

    return () => {
      lcpObserver.disconnect();
      clsObserver.disconnect();
      inpObserver.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [mode, pathname]);

  return null;
}
