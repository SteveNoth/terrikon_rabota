import { Source } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { clearMemoryCache } from "@/lib/adapters/cache";

/** Тот же токен, что у `scripts/parser_trudvsem.py`. Не путать с пачками upload. */
export const TRUDVSEM_COMPLETE_PARSER = "parser_trudvsem_complete";

export type OfficialArchiveInput = {
  source: string;
  seenExternalIds: string[];
  fetchedCount: number;
  cityMatchCount: number;
  citySlugs: string[];
};

export type OfficialArchiveResult = {
  archived: number;
  skippedReason: string | null;
  previousFetched: number | null;
  snapshotRecorded: boolean;
};

export type ArchiveDecision = {
  action: "skip" | "archive";
  reason: string | null;
  recordSnapshot: boolean;
};

export function suspiciouslySmall(current: number, previous: number | null, ratio = 0.5): boolean {
  if (previous == null || previous <= 0) {
    return false;
  }
  return current < previous * ratio;
}

/**
 * Снимать ли официальный слой. Сбой сети сюда не попадает: парсер не вызывает дверь.
 * Первый успешный снимок ничего не снимает, но запоминается. Маленький ответ
 * и ноль городов при живой выдаче — не снимаем и снимок не двигаем.
 */
export function decideOfficialArchive(input: {
  source: string;
  seenCount: number;
  fetchedCount: number;
  previousFetched: number | null;
  hasPreviousRun: boolean;
}): ArchiveDecision {
  if (input.source !== "TRUDVSEM") {
    return { action: "skip", reason: "not_trudvsem", recordSnapshot: false };
  }
  if (input.fetchedCount > 0 && input.seenCount === 0) {
    return { action: "skip", reason: "no_city_matches", recordSnapshot: false };
  }
  if (input.hasPreviousRun && suspiciouslySmall(input.fetchedCount, input.previousFetched)) {
    return {
      action: "skip",
      reason: "suspiciously_small",
      recordSnapshot: false,
    };
  }
  if (!input.hasPreviousRun) {
    return { action: "skip", reason: "first_run", recordSnapshot: true };
  }
  return { action: "archive", reason: null, recordSnapshot: true };
}

export async function archiveMissingOfficial(input: OfficialArchiveInput): Promise<OfficialArchiveResult> {
  const previous = await prisma.parserRun.findFirst({
    where: { parser: TRUDVSEM_COMPLETE_PARSER },
    orderBy: { startedAt: "desc" },
  });
  const decision = decideOfficialArchive({
    source: input.source,
    seenCount: input.seenExternalIds.length,
    fetchedCount: input.fetchedCount,
    previousFetched: previous?.postsSeen ?? null,
    hasPreviousRun: Boolean(previous),
  });

  let archived = 0;
  if (decision.action === "archive" && previous) {
    const seen = [...new Set(input.seenExternalIds.map((item) => item.trim()).filter(Boolean))];
    const citySlugs = [...new Set(input.citySlugs.map((item) => item.trim()).filter(Boolean))];
    if (seen.length > 0) {
      const result = await prisma.vacancy.updateMany({
        where: {
          source: Source.TRUDVSEM,
          isActive: true,
          archivedAt: null,
          lastSeenAt: { lt: previous.startedAt },
          externalId: { notIn: seen },
          ...(citySlugs.length ? { citySlug: { in: citySlugs } } : {}),
        },
        data: {
          isActive: false,
          archivedAt: new Date(),
        },
      });
      archived = result.count;
    }
  }

  if (decision.recordSnapshot) {
    await prisma.parserRun.create({
      data: {
        parser: TRUDVSEM_COMPLETE_PARSER,
        startedAt: new Date(),
        finishedAt: new Date(),
        postsSeen: input.fetchedCount,
        postsAccepted: input.cityMatchCount,
        postsRejected: 0,
        vacanciesCreated: 0,
        vacanciesUpdated: archived,
        errorsCount: 0,
      },
    });
  }

  if (archived > 0) {
    clearMemoryCache();
  }

  return {
    archived,
    skippedReason: decision.reason,
    previousFetched: previous?.postsSeen ?? null,
    snapshotRecorded: decision.recordSnapshot,
  };
}
