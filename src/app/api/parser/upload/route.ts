import { NextResponse, type NextRequest } from "next/server";
import { authorizeParserRequest, unauthorizedResponse } from "@/lib/parser/auth";
import { ingestVacancies } from "@/lib/parser/ingest";
import { touchCities } from "@/lib/admin/touch";
import {
  allowRequest,
  clientKey,
  contentLengthTooLarge,
  payloadTooLargeResponse,
  tooManyResponse,
  MAX_BODY_BYTES,
} from "@/lib/parser/limits";
import { parseEnvelope } from "@/lib/parser/schema";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!authorizeParserRequest(request)) {
    return unauthorizedResponse();
  }
  if (contentLengthTooLarge(request)) {
    return payloadTooLargeResponse();
  }
  if (!allowRequest(clientKey(request))) {
    return tooManyResponse();
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return json({ error: "Не удалось прочитать тело запроса." }, 400);
  }
  if (rawText.length > MAX_BODY_BYTES) {
    return payloadTooLargeResponse();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawText) as unknown;
  } catch {
    return json({ error: "Тело запроса должно быть JSON." }, 400);
  }

  const envelope = parseEnvelope(payload);
  if (!envelope.ok) {
    return json({ error: envelope.reason }, 400);
  }

  try {
    const stats = await ingestVacancies({
      parser: envelope.data.parser,
      startedAt: envelope.data.startedAt,
      items: envelope.data.items,
    });
    await touchCities(stats.citySlugs);
    return json({
      добавлено: stats.added,
      обновлено: stats.updated,
      дублей: stats.duplicates,
      наМодерации: stats.pending,
      заблокировано: stats.blocked,
      пропущеноПоГороду: stats.skippedCity,
      отброшеноКакСВО: stats.discardedSvo,
      maybe: stats.maybe,
      ошибок: stats.errors,
      ошибки: stats.errorItems,
      пропускиПоГороду: stats.skippedCityItems,
      runId: stats.runId,
      elapsedMs: stats.elapsedMs,
      added: stats.added,
      updated: stats.updated,
      duplicates: stats.duplicates,
      pending: stats.pending,
      blocked: stats.blocked,
      skippedCity: stats.skippedCity,
      discardedSvo: stats.discardedSvo,
      errors: stats.errors,
    });
  } catch (cause) {
    log.error("api/parser/upload", "пачка не принята", cause);
    return json({ ok: false, code: "INTERNAL", message: "Не удалось принять пачку." }, 500);
  }
}
