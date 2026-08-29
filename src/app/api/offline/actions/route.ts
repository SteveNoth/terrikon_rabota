import { EventType, ModerationStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/adapters/db";
import { defaultQualityMode, resolveMode } from "@/lib/quality/server";
import { isQualityMode } from "@/lib/quality/types";
import { deviceClassFromUserAgent } from "@/lib/stats/device";
import { SESSION_COOKIE, isSessionHash } from "@/lib/stats/session";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  id: z.string().min(8).max(80),
  type: z.enum(["apply", "favorite"]),
  op: z.enum(["add", "remove"]).default("add"),
  vacancyId: z.string().min(8).max(64),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Принимает отложенные действия из IndexedDB.
 * Кабинет соискателя (Этап 21) ещё не пишет Application/Favorite в аккаунт —
 * здесь фиксируем факт «дошло» событием, один раз на сессию и вакансию.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, message: "Не удалось прочитать запрос." }, 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, message: "Некорректное действие." }, 400);
  }

  const { id: clientId, type, op, vacancyId } = parsed.data;
  const sessionHash = request.cookies.get(SESSION_COOKIE)?.value;
  const resolved = resolveMode(request);
  const qualityMode = isQualityMode(resolved.mode) ? resolved.mode : defaultQualityMode();

  const vacancy = await prisma.vacancy.findFirst({
    where: {
      id: vacancyId,
      isActive: true,
      moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] },
    },
    select: {
      id: true,
      citySlug: true,
      districtSlug: true,
      sphere: true,
      professionSlug: true,
    },
  });

  if (!vacancy) {
    return json({ ok: true, skipped: true, id: clientId });
  }

  if (!isSessionHash(sessionHash)) {
    return json({ ok: true, queued: true, id: clientId });
  }

  const eventType = type === "apply" ? EventType.APPLY_SENT : EventType.FAVORITE_ADD;
  if (type === "favorite" && op === "remove") {
    return json({ ok: true, id: clientId });
  }

  const existing = await prisma.event.findFirst({
    where: {
      type: eventType,
      vacancyId: vacancy.id,
      sessionHash,
    },
    select: { id: true },
  });
  if (existing) {
    return json({ ok: true, duplicate: true, id: clientId });
  }

  await prisma.event.create({
    data: {
      type: eventType,
      vacancyId: vacancy.id,
      citySlug: vacancy.citySlug,
      districtSlug: vacancy.districtSlug,
      sphere: vacancy.sphere,
      professionSlug: vacancy.professionSlug,
      sessionHash,
      deviceClass: deviceClassFromUserAgent(request.headers.get("user-agent")),
      qualityMode,
    },
  });

  return json({ ok: true, id: clientId });
}
