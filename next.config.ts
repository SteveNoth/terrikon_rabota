import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Не создавать AGENTS.md / CLAUDE.md при каждом запуске dev-сервера
  agentRules: false,
  // Prisma — нативный модуль, Next не должен упаковывать его в бандл сервера.
  serverExternalPackages: ["@prisma/client"],
  // Тонкий путь читает tokens.css / modes.css с диска — файлы должны попасть в серверный бандл.
  outputFileTracingIncludes: {
    "/u": ["./src/styles/tokens.css", "./src/styles/modes.css"],
    "/u/[[...path]]": ["./src/styles/tokens.css", "./src/styles/modes.css"],
  },
};

export default nextConfig;
