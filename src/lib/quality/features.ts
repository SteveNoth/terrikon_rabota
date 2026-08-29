import type { QualityFeatures, QualityMode } from "@/lib/quality/types";

/**
 * Единственное место, где решается «что включено».
 * Компоненты спрашивают возможности (features.animations, features.map),
 * а не сравнивают режим по имени.
 */
export const FEATURES: Record<QualityMode, QualityFeatures> = {
  full: {
    images: "adaptive",
    imageMaxKb: 120,
    brandFont: true,
    map: "interactive",
    animations: true,
    liveSearch: true,
    perPage: 20,
    skeletons: true,
    modals: true,
    analytics: true,
    descriptionPreview: 2,
    creativeView: true,
    maxCharts: 8,
    chartAnimation: true,
  },
  lite: {
    images: "thumb",
    imageMaxKb: 20,
    brandFont: false,
    map: "static",
    animations: false,
    liveSearch: false,
    perPage: 20,
    skeletons: false,
    modals: true,
    analytics: true,
    descriptionPreview: 0,
    creativeView: true,
    maxCharts: 4,
    chartAnimation: false,
  },
  ultra: {
    images: "none",
    imageMaxKb: 0,
    brandFont: false,
    map: "text",
    animations: false,
    liveSearch: false,
    perPage: 10,
    skeletons: false,
    modals: false,
    analytics: false,
    descriptionPreview: 0,
    creativeView: false,
    maxCharts: 0,
    chartAnimation: false,
  },
};

export function getFeatures(mode: QualityMode): QualityFeatures {
  return FEATURES[mode];
}

const MODE_RANK: Record<QualityMode, number> = {
  ultra: 0,
  lite: 1,
  full: 2,
};

export function modeRank(mode: QualityMode): number {
  return MODE_RANK[mode];
}

/** Спрайт иконок не грузим, когда картинки выключены — иначе браузер всё равно сходит за SVG. */
export function usesIconSprite(features: QualityFeatures): boolean {
  return features.images !== "none";
}
