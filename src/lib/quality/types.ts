export const QUALITY_MODES = ["full", "lite", "ultra"] as const;
export type QualityMode = (typeof QUALITY_MODES)[number];

export const QUALITY_PREFERENCES = ["auto", "full", "lite", "ultra"] as const;
export type QualityPreference = (typeof QUALITY_PREFERENCES)[number];

export type QualityImages = "adaptive" | "thumb" | "none";
export type QualityMap = "interactive" | "static" | "text";

export type QualityFeatures = {
  images: QualityImages;
  imageMaxKb: number;
  brandFont: boolean;
  map: QualityMap;
  animations: boolean;
  liveSearch: boolean;
  perPage: number;
  skeletons: boolean;
  modals: boolean;
  analytics: boolean;
  descriptionPreview: number;
  creativeView: boolean;
  maxCharts: number;
  chartAnimation: boolean;
};

/** Что выбрал человек. Выбор всегда главнее автоматики. */
export const MODE_COOKIE = "tr_mode";
/** Последний измеренный режим, когда выбор — «авто». Живёт 7 дней. */
export const RESULT_COOKIE = "tr_res";

/** Middleware считает режим и кладёт его сюда — layout читает до HTML. */
export const MODE_HEADER = "x-quality-mode";
export const PREFERENCE_HEADER = "x-quality-preference";

export const RESULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isQualityMode(value: string | null | undefined): value is QualityMode {
  return value === "full" || value === "lite" || value === "ultra";
}

export function isQualityPreference(
  value: string | null | undefined,
): value is QualityPreference {
  return value === "auto" || isQualityMode(value);
}
