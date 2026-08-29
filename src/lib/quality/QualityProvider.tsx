"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { FEATURES, modeRank } from "@/lib/quality/features";
import {
  afterFirstPaint,
  canDetectNow,
  installFailureObserver,
  measureQuality,
  writeResultCookie,
} from "@/lib/quality/detect.client";
import type { QualityFeatures, QualityMode, QualityPreference } from "@/lib/quality/types";

export type QualityContextValue = {
  mode: QualityMode;
  preference: QualityPreference;
  features: QualityFeatures;
  /** Только для стайлгайда: меняет вид здесь и сейчас, cookie не трогает. */
  previewMode: (mode: QualityMode) => void;
};

const QualityContext = createContext<QualityContextValue | null>(null);

function shouldSkipDetection(preference: QualityPreference, pathname: string): boolean {
  if (preference !== "auto") {
    return true;
  }
  if (pathname.startsWith("/dev")) {
    return true;
  }
  return false;
}

export function QualityProvider({
  initialMode,
  preference,
  children,
}: {
  initialMode: QualityMode;
  preference: QualityPreference;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [nav, setNav] = useState({ pathname, initialMode });
  const [override, setOverride] = useState<QualityMode | null>(null);

  if (pathname !== nav.pathname || initialMode !== nav.initialMode) {
    setNav({ pathname, initialMode });
    setOverride(null);
  }

  const mode = override ?? initialMode;

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const applyMeasured = useCallback(
    (measured: QualityMode) => {
      if (preference !== "auto") {
        return;
      }
      writeResultCookie(measured);
      setOverride((current) => {
        const shown = current ?? initialMode;
        if (modeRank(measured) < modeRank(shown)) {
          return measured;
        }
        return current;
      });
    },
    [initialMode, preference],
  );

  useEffect(() => {
    const stopObserver = installFailureObserver(() => {
      if (preference !== "auto") {
        return;
      }
      writeResultCookie("ultra");
      setOverride("ultra");
    });

    if (shouldSkipDetection(preference, pathname)) {
      return stopObserver;
    }

    // В Ultra Lite замеров нет: на тонком пути не будет JavaScript.
    // Пока JS ещё есть, из Ultra всё равно не меряем — выход вручную или по cookie.
    if (mode === "ultra") {
      return stopObserver;
    }

    if (!canDetectNow()) {
      return stopObserver;
    }

    let cancelled = false;
    const cancelIdle = afterFirstPaint(() => {
      if (cancelled || !canDetectNow()) {
        return;
      }
      void measureQuality().then((measured) => {
        if (!cancelled) {
          applyMeasured(measured);
        }
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      stopObserver();
    };
  }, [applyMeasured, mode, pathname, preference]);

  const previewMode = useCallback((next: QualityMode) => {
    setOverride(next);
  }, []);

  const features = FEATURES[mode];

  const value = useMemo<QualityContextValue>(
    () => ({ mode, preference, features, previewMode }),
    [mode, preference, features, previewMode],
  );

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

export function useQuality(): QualityContextValue {
  const value = useContext(QualityContext);
  if (!value) {
    throw new Error("useQuality нужно вызывать внутри QualityProvider");
  }
  return value;
}

export function useFeature<K extends keyof QualityFeatures>(key: K): QualityFeatures[K] {
  return useQuality().features[key];
}
