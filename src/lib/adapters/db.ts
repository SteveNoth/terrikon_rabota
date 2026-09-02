import { PrismaClient } from "@prisma/client";

/**
 * Единый клиент Prisma на процесс.
 *
 * В режиме разработки Next.js при сохранении файла заново выполняет модули,
 * не выключая процесс. Без этой защиты каждый раз создавался бы новый
 * PrismaClient — и бесплатный пул Supabase быстро заканчивал соединения
 * («too many connections»). В production процесс один, глобальный кэш не нужен.
 *
 * URL: на Vercel — DATABASE_URL (пул 6543, много коротких лямбд). Локально
 * процесс один и живёт долго, как Python-скрипты: DIRECT_URL (сессия 5432).
 * Иначе движок Prisma с таймаутом 5 с пишет «Can't reach …:6543», хотя
 * TCP и psycopg уже отвечают. sslmode и connect_timeout — как в scripts/db_pg.py.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaUrl: string | undefined;
};

function rawDatabaseUrl(): string | undefined {
  const pooled = process.env.DATABASE_URL;
  const session = process.env.DIRECT_URL;
  if (process.env.VERCEL) return pooled;
  return session || pooled;
}

function withPrismaParams(url: string | undefined): string | undefined {
  if (!url) return url;
  const qIndex = url.indexOf("?");
  const base = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const search = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : "");
  if (!search.has("sslmode")) search.set("sslmode", "require");
  if (!search.has("connect_timeout")) search.set("connect_timeout", "30");
  if (!search.has("pool_timeout")) search.set("pool_timeout", "30");
  if (!process.env.VERCEL && !search.has("connection_limit")) {
    search.set("connection_limit", "5");
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

function createPrisma(url: string | undefined): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

const prismaUrl = withPrismaParams(rawDatabaseUrl());

if (globalForPrisma.prisma && globalForPrisma.prismaUrl !== prismaUrl) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrisma(prismaUrl);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUrl = prismaUrl;
}

export default prisma;
