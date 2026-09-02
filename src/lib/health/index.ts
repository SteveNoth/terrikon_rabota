import { ModerationStatus } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { DB_LIMIT_BYTES } from "@/lib/admin/constants";
import { formatBytes, formatPercent } from "@/lib/admin/format";
import { pingDatabase, readAppliedMigrations, readDatabaseBytes } from "@/lib/health/database";
import { EXPECTED_MIGRATIONS } from "@/lib/health/migrations";
import {
  describeParser,
  WATCHED_PARSERS,
  type ParserHealthItem,
  type ParserRunSnapshot,
} from "@/lib/health/parsers";
import type { HealthStatus } from "@/lib/health/types";

export type { HealthStatus } from "@/lib/health/types";
export { healthHttpStatus } from "@/lib/health/status";

export type HealthReport = {
  ok: boolean;
  status: HealthStatus;
  checkedAt: string;
  database: {
    ok: boolean;
    latencyMs: number;
    sizeBytes: number | null;
    sizeLabel: string;
    limitBytes: number;
    limitShare: string;
  };
  migrations: {
    ok: boolean;
    applied: number;
    pending: string[];
  };
  vacancies: {
    active: number;
  };
  parsers: ParserHealthItem[];
};

function pendingMigrations(applied: string[] | null): string[] {
  if (!applied) {
    return [...EXPECTED_MIGRATIONS];
  }
  const have = new Set(applied);
  return EXPECTED_MIGRATIONS.filter((name) => !have.has(name));
}

export async function collectHealth(): Promise<HealthReport> {
  const ping = await pingDatabase();
  if (!ping.ok) {
    return {
      ok: false,
      status: "down",
      checkedAt: new Date().toISOString(),
      database: {
        ok: false,
        latencyMs: ping.latencyMs,
        sizeBytes: null,
        sizeLabel: "база не отвечает",
        limitBytes: DB_LIMIT_BYTES,
        limitShare: "—",
      },
      migrations: { ok: false, applied: 0, pending: [...EXPECTED_MIGRATIONS] },
      vacancies: { active: 0 },
      parsers: WATCHED_PARSERS.map((parser) => describeParser(parser, [], new Date())),
    };
  }

  const now = new Date();
  const [sizeBytes, applied, active, runRows] = await Promise.all([
    readDatabaseBytes(),
    readAppliedMigrations(),
    prisma.vacancy.count({
      where: {
        isActive: true,
        moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] },
      },
    }),
    prisma.parserRun.findMany({
      where: { parser: { in: [...WATCHED_PARSERS] } },
      orderBy: { startedAt: "desc" },
      take: 40,
      select: {
        parser: true,
        startedAt: true,
        finishedAt: true,
        postsAccepted: true,
        vacanciesCreated: true,
      },
    }),
  ]);

  const byParser = new Map<string, ParserRunSnapshot[]>();
  for (const row of runRows) {
    const list = byParser.get(row.parser) ?? [];
    list.push(row);
    byParser.set(row.parser, list);
  }
  const parsers = WATCHED_PARSERS.map((parser) => describeParser(parser, byParser.get(parser) ?? [], now));
  const pending = pendingMigrations(applied);
  const migrationsOk = applied != null && pending.length === 0;
  const parsersOk = parsers.every((item) => item.ok);
  const status: HealthStatus = !migrationsOk ? "down" : parsersOk ? "ok" : "degraded";

  return {
    ok: status === "ok",
    status,
    checkedAt: now.toISOString(),
    database: {
      ok: true,
      latencyMs: ping.latencyMs,
      sizeBytes,
      sizeLabel: sizeBytes == null ? "размер неизвестен" : formatBytes(sizeBytes),
      limitBytes: DB_LIMIT_BYTES,
      limitShare: sizeBytes == null ? "—" : formatPercent(sizeBytes, DB_LIMIT_BYTES),
    },
    migrations: {
      ok: migrationsOk,
      applied: applied?.length ?? 0,
      pending,
    },
    vacancies: { active },
    parsers,
  };
}
