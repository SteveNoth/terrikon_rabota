/**
 * Одинаковый формат ошибок API. Страницам и скриптам не нужно гадать,
 * в каком поле лежит текст: всегда `ok: false`, `code`, `message` на русском.
 * Стек Prisma и строки подключения сюда не попадают.
 */
import { NextResponse } from "next/server";
import { log } from "@/lib/log";

export const API_ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "TOO_MANY",
  "PAYLOAD_TOO_LARGE",
  "UNAVAILABLE",
  "INTERNAL",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorBody = {
  ok: false;
  code: ApiErrorCode;
  message: string;
};

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function apiError(code: ApiErrorCode, message: string, status: number): NextResponse<ApiErrorBody> {
  return NextResponse.json({ ok: false, code, message }, { status, headers: NO_STORE });
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object") {
    return false;
  }
  const body = value as ApiErrorBody;
  return (
    body.ok === false &&
    typeof body.code === "string" &&
    (API_ERROR_CODES as readonly string[]).includes(body.code) &&
    typeof body.message === "string"
  );
}

export function unauthorizedApi(): NextResponse<ApiErrorBody> {
  return apiError("UNAUTHORIZED", "Нет доступа.", 401);
}

export async function handleApiRoute(scope: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (cause) {
    log.error(scope, "необработанная ошибка", cause);
    return apiError("INTERNAL", "Не получилось обработать запрос. Попробуйте ещё раз.", 500);
  }
}
