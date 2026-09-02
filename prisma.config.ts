import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });

/**
 * Конфиг CLI Prisma (миграции и сиды).
 * Сайт в рантайме берёт DATABASE_URL из schema.prisma — это пул.
 * CLI берёт DIRECT_URL: миграции нельзя гонять через пул.
 *
 * Заглушка нужна, чтобы `prisma generate` и `npm run build` работали
 * на машине, где строки подключения ещё не вставили.
 */
const directUrl =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://unconfigured:unconfigured@127.0.0.1:5432/unconfigured";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  engine: "classic",
  datasource: {
    url: directUrl,
  },
});
