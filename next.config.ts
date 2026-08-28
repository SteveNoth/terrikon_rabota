import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Не создавать AGENTS.md / CLAUDE.md при каждом запуске dev-сервера
  agentRules: false,
};

export default nextConfig;
