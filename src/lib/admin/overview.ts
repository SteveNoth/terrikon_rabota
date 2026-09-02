import { ModerationStatus } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { DB_LIMIT_BYTES } from "@/lib/admin/constants";
import { readDatabaseBytes } from "@/lib/health/database";
import { cityDisplayName } from "@/lib/geo";
import { listSpheres } from "@/lib/professions";
import { queueSummary } from "@/lib/admin/queue";
import { employerQueueSummary } from "@/lib/admin/employer-queue";
import { formatBytes, formatPercent } from "@/lib/admin/format";

export type Overview = {
  activeTotal: number;
  byCity: { slug: string; name: string; count: number }[];
  bySphere: { slug: string; name: string; count: number }[];
  new7d: number;
  dbBytes: number | null;
  dbLimitBytes: number;
  dbShare: string;
  dbLabel: string;
  botSubscribers: number;
  queueSize: number;
  oldestQueue: string | null;
  employerQueueSize: number;
  oldestEmployerQueue: string | null;
};

export async function loadOverview(): Promise<Overview> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const published = {
    isActive: true,
    moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] },
  };
  const [activeTotal, byCityRows, bySphereRows, new7d, botSubscribers, queue, employerQueue, dbBytes] = await Promise.all([
    prisma.vacancy.count({ where: published }),
    prisma.vacancy.groupBy({
      by: ["citySlug"],
      where: published,
      _count: true,
    }),
    prisma.vacancy.groupBy({
      by: ["sphere"],
      where: published,
      _count: true,
    }),
    prisma.vacancy.count({ where: { ...published, publishedAt: { gte: weekAgo } } }),
    prisma.telegramUser.count({ where: { isActive: true } }),
    queueSummary(),
    employerQueueSummary(),
    readDatabaseBytes(),
  ]);

  const sphereNames = new Map(listSpheres().map((item) => [item.slug, item.name]));

  return {
    activeTotal,
    byCity: byCityRows
      .map((row) => ({
        slug: row.citySlug,
        name: cityDisplayName(row.citySlug),
        count: row._count,
      }))
      .sort((a, b) => b.count - a.count),
    bySphere: bySphereRows
      .map((row) => ({
        slug: row.sphere,
        name: sphereNames.get(row.sphere) ?? row.sphere,
        count: row._count,
      }))
      .sort((a, b) => b.count - a.count),
    new7d,
    dbBytes,
    dbLimitBytes: DB_LIMIT_BYTES,
    dbShare: dbBytes == null ? "—" : formatPercent(dbBytes, DB_LIMIT_BYTES),
    dbLabel: dbBytes == null ? "размер базы неизвестен" : `${formatBytes(dbBytes)} из ${formatBytes(DB_LIMIT_BYTES)}`,
    botSubscribers,
    queueSize: queue.total,
    oldestQueue: queue.oldestLabel,
    employerQueueSize: employerQueue.total,
    oldestEmployerQueue: employerQueue.oldestLabel,
  };
}
