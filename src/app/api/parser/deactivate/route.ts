import { NextResponse, type NextRequest } from "next/server";
import { authorizeParserRequest, unauthorizedResponse } from "@/lib/parser/auth";
import { deactivateStaleVacancies } from "@/lib/parser/ingest";
import { allowRequest, clientKey, tooManyResponse, INACTIVE_AFTER_DAYS } from "@/lib/parser/limits";

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
  if (!allowRequest(`deactivate:${clientKey(request)}`)) {
    return tooManyResponse();
  }

  let days = INACTIVE_AFTER_DAYS;
  try {
    const text = await request.text();
    if (text.trim()) {
      const payload = JSON.parse(text) as { days?: unknown };
      if (typeof payload?.days === "number" && Number.isFinite(payload.days)) {
        days = Math.min(365, Math.max(1, Math.floor(payload.days)));
      }
    }
  } catch {
    days = INACTIVE_AFTER_DAYS;
  }

  try {
    const result = await deactivateStaleVacancies(days);
    return json({
      deactivated: result.deactivated,
      days: result.days,
      неактивных: result.deactivated,
    });
  } catch (cause) {
    console.error("[api/parser/deactivate]", cause);
    return json({ error: "Не удалось пометить неактивные вакансии." }, 500);
  }
}
