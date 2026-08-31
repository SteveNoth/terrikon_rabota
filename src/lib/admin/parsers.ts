import { ModerationStatus, Source } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import {
  PARSER_LABEL,
  PARSER_STALE_AFTER_MS,
  PARSER_STALE_DEFAULT_MS,
} from "@/lib/admin/constants";
import { SOURCE_LABEL } from "@/lib/format/source";

export type DayPoint = {
  date: string;
  seen: number;
  accepted: number;
  pending: number;
  rejected: number;
  blocked: number;
};

export type ParserHealth = {
  parser: string;
  label: string;
  lastStartedAt: Date | null;
  stale: boolean;
  staleAfterHours: number;
};

export type ParserStats = {
  days: DayPoint[];
  reasonTop: { reason: string; count: number }[];
  fraudShareBySource: { source: string; label: string; blocked: number; total: number; share: number }[];
  health: ParserHealth[];
};

function ymd(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function bump(map: Record<string, number>, key: string, n = 1) {
  map[key] = (map[key] ?? 0) + n;
}

export async function loadParserStats(days = 14): Promise<ParserStats> {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);
  const runs = await prisma.parserRun.findMany({
    where: { startedAt: { gte: from } },
    orderBy: { startedAt: "asc" },
  });

  const byDay = new Map<string, DayPoint>();
  const reasons: Record<string, number> = {};
  for (let i = 0; i < days; i += 1) {
    const d = new Date(from);
    d.setUTCDate(from.getUTCDate() + i);
    const key = ymd(d);
    byDay.set(key, { date: key, seen: 0, accepted: 0, pending: 0, rejected: 0, blocked: 0 });
  }
  for (const run of runs) {
    const key = ymd(run.startedAt);
    const point = byDay.get(key) ?? {
      date: key,
      seen: 0,
      accepted: 0,
      pending: 0,
      rejected: 0,
      blocked: 0,
    };
    point.seen += run.postsSeen;
    point.accepted += run.postsAccepted;
    point.pending += run.postsPending;
    point.rejected += run.postsRejected;
    point.blocked += run.postsBlocked;
    byDay.set(key, point);
    const raw = run.rejectReasons;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [reason, count] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof count === "number") {
          bump(reasons, reason, count);
        }
      }
    }
  }

  const expected = ["parser_vk", "parser_tg", "parser_web", "parser_trudvsem"];
  const [blockedBySource, totalBySource, lastRuns] = await Promise.all([
    prisma.vacancy.groupBy({
      by: ["source"],
      where: { moderationStatus: ModerationStatus.BLOCKED },
      _count: true,
    }),
    prisma.vacancy.groupBy({
      by: ["source"],
      _count: true,
    }),
    prisma.parserRun.findMany({
      where: { parser: { in: expected } },
      orderBy: { startedAt: "desc" },
      take: 40,
    }),
  ]);

  const totalMap = new Map(totalBySource.map((row) => [row.source, row._count]));
  const fraudShareBySource = blockedBySource
    .map((row) => {
      const total = totalMap.get(row.source) ?? 0;
      return {
        source: row.source,
        label: SOURCE_LABEL[row.source as Source] ?? row.source,
        blocked: row._count,
        total,
        share: total ? row._count / total : 0,
      };
    })
    .sort((a, b) => b.share - a.share);

  const now = Date.now();
  const lastByName = new Map<string, Date>();
  for (const run of lastRuns) {
    if (!lastByName.has(run.parser)) {
      lastByName.set(run.parser, run.startedAt);
    }
  }
  const health: ParserHealth[] = expected.map((parser) => {
    const last = lastByName.get(parser) ?? null;
    const limit = PARSER_STALE_AFTER_MS[parser] ?? PARSER_STALE_DEFAULT_MS;
    const stale = !last || now - last.getTime() > limit;
    return {
      parser,
      label: PARSER_LABEL[parser] ?? parser,
      lastStartedAt: last,
      stale,
      staleAfterHours: Math.round(limit / 3_600_000),
    };
  });

  const reasonTop = Object.entries(reasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    reasonTop,
    fraudShareBySource,
    health,
  };
}
