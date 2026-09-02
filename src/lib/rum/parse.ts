import { isQualityMode, type QualityMode } from "@/lib/quality/types";

export type RumInput = {
  qualityMode: QualityMode;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
};

function asInt(value: unknown, min: number, max: number): number | null {
  if (value == null) {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) {
    return null;
  }
  return rounded;
}

function asCls(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10) {
    return null;
  }
  return Math.round(n * 10_000) / 10_000;
}

/** Тело /api/rum: только числа. Лишние поля отбрасываем, не пишем. */
export function parseRumPayload(raw: unknown, qualityMode: QualityMode): RumInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      qualityMode,
      lcpMs: null,
      cls: null,
      inpMs: null,
    };
  }
  const body = raw as Record<string, unknown>;
  return {
    qualityMode,
    lcpMs: asInt(body.lcpMs, 0, 120_000),
    cls: asCls(body.cls),
    inpMs: asInt(body.inpMs, 0, 30_000),
  };
}

export function parseQualityMode(value: string | null | undefined, fallback: QualityMode): QualityMode {
  return isQualityMode(value) ? value : fallback;
}
