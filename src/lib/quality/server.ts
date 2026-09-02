import type { NextRequest } from "next/server";
import {
  isQualityMode,
  isQualityPreference,
  MODE_COOKIE,
  RESULT_COOKIE,
  type QualityMode,
  type QualityPreference,
} from "@/lib/quality/types";

export type ResolvedQuality = {
  mode: QualityMode;
  preference: QualityPreference;
  /** В адресе был ?mode= — записать выбор в cookie, чтобы запомнился. */
  rememberPreference: boolean;
};

export function defaultQualityMode(): QualityMode {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_QUALITY_MODE;
  if (isQualityMode(fromEnv)) {
    return fromEnv;
  }
  return "lite";
}

export function isSaveDataOn(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "on" || normalized === "1" || normalized === "true";
}

/**
 * Раздел 8.3, шаг 1 — до отправки HTML.
 *
 * Источники: ?mode=, cookie tr_mode, cookie tr_res, Save-Data, env.
 * Приоритеты:
 * 1. Выбор человека ( ?mode= или tr_mode = full|lite|ultra ) — всегда главнее автоматики.
 * 2. Если выбор «авто»: Save-Data: on → ultra; иначе tr_res; иначе значение из env (lite).
 */
function resolveAuto(request: NextRequest, rememberPreference: boolean): ResolvedQuality {
  if (isSaveDataOn(request.headers.get("Save-Data"))) {
    return { mode: "ultra", preference: "auto", rememberPreference };
  }

  const measured = request.cookies.get(RESULT_COOKIE)?.value;
  if (isQualityMode(measured)) {
    return { mode: measured, preference: "auto", rememberPreference };
  }

  return { mode: defaultQualityMode(), preference: "auto", rememberPreference };
}

export function resolveMode(request: NextRequest): ResolvedQuality {
  const fromQuery = request.nextUrl.searchParams.get("mode");
  const fromCookie = request.cookies.get(MODE_COOKIE)?.value;

  if (isQualityPreference(fromQuery)) {
    if (fromQuery === "auto") {
      return resolveAuto(request, true);
    }
    return { mode: fromQuery, preference: fromQuery, rememberPreference: true };
  }

  if (isQualityPreference(fromCookie)) {
    if (fromCookie === "auto") {
      return resolveAuto(request, false);
    }
    return { mode: fromCookie, preference: fromCookie, rememberPreference: false };
  }

  return resolveAuto(request, false);
}
