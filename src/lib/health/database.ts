import { prisma } from "@/lib/adapters/db";
import { log } from "@/lib/log";

export async function pingDatabase(): Promise<{ ok: true; latencyMs: number } | { ok: false; latencyMs: number }> {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (cause) {
    log.error("health", "база не отвечает", cause);
    return { ok: false, latencyMs: Math.round(performance.now() - started) };
  }
}

export async function readDatabaseBytes(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ bytes: bigint | number | string }>>`
      SELECT pg_database_size(current_database()) AS bytes
    `;
    const raw = rows[0]?.bytes;
    if (typeof raw === "bigint") {
      return Number(raw);
    }
    if (typeof raw === "number") {
      return raw;
    }
    if (typeof raw === "string") {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  } catch (cause) {
    log.error("health", "размер базы", cause);
    return null;
  }
}

type MigrationRow = {
  migration_name: string;
  finished_at: Date | string | null;
  rolled_back_at: Date | string | null;
};

export async function readAppliedMigrations(): Promise<string[] | null> {
  try {
    const rows = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
    `;
    return rows
      .filter((row) => row.finished_at && !row.rolled_back_at)
      .map((row) => row.migration_name)
      .sort();
  } catch (cause) {
    log.error("health", "таблица миграций недоступна", cause);
    return null;
  }
}
