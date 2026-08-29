import { NextResponse, type NextRequest } from "next/server";
import { ModerationStatus } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { defaultQualityMode, resolveMode } from "@/lib/quality/server";
import { isQualityMode } from "@/lib/quality/types";
import { deviceClassFromUserAgent, isDoNotTrack } from "@/lib/stats/device";
import { recordVacancyView } from "@/lib/stats/events";
import { SESSION_COOKIE, isSessionHash } from "@/lib/stats/session";

export const dynamic = "force-dynamic";

function noContent() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (isDoNotTrack(request.headers.get("dnt") ?? request.headers.get("DNT"))) {
    return noContent();
  }

  const sessionHash = request.cookies.get(SESSION_COOKIE)?.value;
  if (!isSessionHash(sessionHash)) {
    return noContent();
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noContent();
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("type" in payload) ||
    !("vacancyId" in payload) ||
    payload.type !== "VACANCY_VIEW" ||
    typeof payload.vacancyId !== "string" ||
    payload.vacancyId.length < 8
  ) {
    return noContent();
  }

  const vacancyId = payload.vacancyId;

  try {
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
      return noContent();
    }

    const resolved = resolveMode(request);
    const qualityMode = isQualityMode(resolved.mode) ? resolved.mode : defaultQualityMode();

    await recordVacancyView({
      vacancyId: vacancy.id,
      citySlug: vacancy.citySlug,
      districtSlug: vacancy.districtSlug,
      sphere: vacancy.sphere,
      professionSlug: vacancy.professionSlug,
      sessionHash,
      deviceClass: deviceClassFromUserAgent(request.headers.get("user-agent")),
      qualityMode,
    });
  } catch (cause) {
    console.error("[api/events]", cause);
  }

  return noContent();
}
