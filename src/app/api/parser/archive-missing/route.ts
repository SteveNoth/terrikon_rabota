import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeParserRequest, unauthorizedResponse } from "@/lib/parser/auth";
import { archiveMissingOfficial } from "@/lib/parser/archive";
import { allowRequest, clientKey, tooManyResponse } from "@/lib/parser/limits";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const BodySchema = z
  .object({
    source: z.literal("TRUDVSEM"),
    seenExternalIds: z.array(z.string().min(1).max(160)).max(20_000),
    fetchedCount: z.number().int().min(0),
    cityMatchCount: z.number().int().min(0).optional(),
    citySlugs: z.array(z.string().min(1).max(40)).max(20).optional(),
  })
  .strict();

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
  if (!allowRequest(`archive-missing:${clientKey(request)}`)) {
    return tooManyResponse();
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Тело запроса должно быть JSON." }, 400);
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: "Некорректное тело: source=TRUDVSEM, seenExternalIds, fetchedCount." }, 400);
  }

  try {
    const result = await archiveMissingOfficial({
      source: parsed.data.source,
      seenExternalIds: parsed.data.seenExternalIds,
      fetchedCount: parsed.data.fetchedCount,
      cityMatchCount: parsed.data.cityMatchCount ?? parsed.data.seenExternalIds.length,
      citySlugs: parsed.data.citySlugs ?? [],
    });
    return json({
      archived: result.archived,
      skippedReason: result.skippedReason,
      previousFetched: result.previousFetched,
      snapshotRecorded: result.snapshotRecorded,
      снято: result.archived,
      причинаПропуска: result.skippedReason,
    });
  } catch (cause) {
    console.error("[api/parser/archive-missing]", cause);
    return json({ error: "Не удалось снять исчезнувшие вакансии." }, 500);
  }
}
