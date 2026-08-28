import { PrismaClient } from "@prisma/client";

/**
 * Единый клиент Prisma на процесс.
 *
 * В режиме разработки Next.js при сохранении файла заново выполняет модули,
 * не выключая процесс. Без этой защиты каждый раз создавался бы новый
 * PrismaClient — и бесплатный пул Supabase быстро заканчивал соединения
 * («too many connections»). В production процесс один, глобальный кэш не нужен.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
