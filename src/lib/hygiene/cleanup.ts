import { ParsedPostStatus } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { clearMemoryCache } from "@/lib/adapters/cache";
import { log } from "@/lib/log";
import {
  daysAgo,
  DEACTIVATE_SKIP_SOURCES,
  DELETE_INACTIVE_AFTER_DAYS,
  INACTIVE_AFTER_DAYS,
  PARSER_RUN_DAYS,
  REJECTED_POST_DAYS,
} from "@/lib/hygiene/constants";
import { recomputeVacancyCounts } from "@/lib/hygiene/counters";
import type { CleanupPlan, CleanupResult } from "@/lib/hygiene/plan";

export type { CleanupPlan, CleanupResult } from "@/lib/hygiene/plan";
export { formatCleanupReport } from "@/lib/hygiene/text";

const DELETE_CHUNK = 200;

function staleActiveWhere(cutoff: Date) {
  return {
    isActive: true,
    lastSeenAt: { lt: cutoff },
    source: { notIn: DEACTIVATE_SKIP_SOURCES },
  };
}

function inactiveOldWhere(cutoff: Date) {
  return {
    isActive: false,
    lastSeenAt: { lt: cutoff },
  };
}

export async function planCleanup(now = new Date()): Promise<CleanupPlan> {
  const staleAt = daysAgo(INACTIVE_AFTER_DAYS, now);
  const deleteAt = daysAgo(DELETE_INACTIVE_AFTER_DAYS, now);
  const rejectedAt = daysAgo(REJECTED_POST_DAYS, now);
  const runAt = daysAgo(PARSER_RUN_DAYS, now);

  const [deactivate, deleteVacancies, deleteParsedPosts, deleteParserRuns, geocodeCacheKept] =
    await Promise.all([
      prisma.vacancy.count({ where: staleActiveWhere(staleAt) }),
      prisma.vacancy.count({ where: inactiveOldWhere(deleteAt) }),
      prisma.parsedPost.count({
        where: { status: ParsedPostStatus.REJECTED, createdAt: { lt: rejectedAt } },
      }),
      prisma.parserRun.count({ where: { startedAt: { lt: runAt } } }),
      prisma.geocodeCache.count(),
    ]);

  return {
    deactivate,
    deleteVacancies,
    deleteParsedPosts,
    deleteParserRuns,
    geocodeCacheKept,
    totalDeletes: deleteVacancies + deleteParsedPosts + deleteParserRuns,
  };
}

async function reassignOrDropGroups(vacancyIds: string[]): Promise<void> {
  if (vacancyIds.length === 0) {
    return;
  }
  const groups = await prisma.vacancyGroup.findMany({
    where: { primaryVacancyId: { in: vacancyIds } },
    select: { id: true },
  });
  for (const group of groups) {
    const next = await prisma.vacancy.findFirst({
      where: { groupId: group.id, id: { notIn: vacancyIds } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
    if (next) {
      await prisma.vacancyGroup.update({
        where: { id: group.id },
        data: { primaryVacancyId: next.id },
      });
    } else {
      await prisma.vacancyGroup.delete({ where: { id: group.id } });
    }
  }
}

async function deleteVacanciesByIds(ids: string[]): Promise<number> {
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += DELETE_CHUNK) {
    const chunk = ids.slice(offset, offset + DELETE_CHUNK);
    await reassignOrDropGroups(chunk);
    const result = await prisma.vacancy.deleteMany({ where: { id: { in: chunk } } });
    deleted += result.count;
  }
  return deleted;
}

export async function deactivateStaleVacancies(
  days = INACTIVE_AFTER_DAYS,
  now = new Date(),
): Promise<{ deactivated: number; days: number }> {
  const cutoff = daysAgo(days, now);
  const result = await prisma.vacancy.updateMany({
    where: staleActiveWhere(cutoff),
    data: { isActive: false },
  });
  if (result.count > 0) {
    clearMemoryCache();
  }
  return { deactivated: result.count, days };
}

export async function applyCleanup(now = new Date()): Promise<CleanupPlan> {
  const deleteAt = daysAgo(DELETE_INACTIVE_AFTER_DAYS, now);
  const rejectedAt = daysAgo(REJECTED_POST_DAYS, now);
  const runAt = daysAgo(PARSER_RUN_DAYS, now);

  const deactivated = await deactivateStaleVacancies(INACTIVE_AFTER_DAYS, now);

  const doomed = await prisma.vacancy.findMany({
    where: inactiveOldWhere(deleteAt),
    select: { id: true },
  });
  const deleteVacancies = await deleteVacanciesByIds(doomed.map((row) => row.id));

  const posts = await prisma.parsedPost.deleteMany({
    where: { status: ParsedPostStatus.REJECTED, createdAt: { lt: rejectedAt } },
  });
  const runs = await prisma.parserRun.deleteMany({
    where: { startedAt: { lt: runAt } },
  });
  const geocodeCacheKept = await prisma.geocodeCache.count();

  await recomputeVacancyCounts();
  clearMemoryCache();

  const plan: CleanupPlan = {
    deactivate: deactivated.deactivated,
    deleteVacancies,
    deleteParsedPosts: posts.count,
    deleteParserRuns: runs.count,
    geocodeCacheKept,
    totalDeletes: deleteVacancies + posts.count + runs.count,
  };
  log.info("hygiene", "очистка применена", {
    deactivate: plan.deactivate,
    deleteVacancies: plan.deleteVacancies,
    deleteParsedPosts: plan.deleteParsedPosts,
    deleteParserRuns: plan.deleteParserRuns,
  });
  return plan;
}

export async function runCleanup(options: { dryRun: boolean; now?: Date }): Promise<CleanupResult> {
  if (options.dryRun) {
    const plan = await planCleanup(options.now);
    return { ...plan, dryRun: true, applied: false };
  }
  const plan = await applyCleanup(options.now);
  return { ...plan, dryRun: false, applied: true };
}
