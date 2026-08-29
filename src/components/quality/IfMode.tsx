"use client";

import type { ReactNode } from "react";
import { useQuality } from "@/lib/quality/QualityProvider";
import type { QualityFeatures } from "@/lib/quality/types";

type FeatureKey = keyof QualityFeatures;

/**
 * Спрашивает возможность, а не имя режима.
 * <IfMode feature="animations">…</IfMode>
 * <IfMode feature="map" is="interactive">…</IfMode>
 */
export function IfMode<K extends FeatureKey>({
  feature,
  is,
  children,
  fallback = null,
}: {
  feature: K;
  is?: QualityFeatures[K];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { features } = useQuality();
  const value = features[feature];
  const ok = is === undefined ? Boolean(value) : value === is;
  return ok ? children : fallback;
}

/** Для серверных компонентов: передайте already-computed boolean из FEATURES[mode]. */
export function IfFeature({
  when,
  children,
  fallback = null,
}: {
  when: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return when ? children : fallback;
}
