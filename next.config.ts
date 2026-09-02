import type { NextConfig } from "next";
import { IMAGE_ADAPTIVE_QUALITY, IMAGE_REMOTE_PATTERNS, IMAGE_THUMB_QUALITY } from "./src/lib/images/remote";

const nextConfig: NextConfig = {
  // Не создавать AGENTS.md / CLAUDE.md при каждом запуске dev-сервера
  agentRules: false,
  // Prisma — нативный модуль, Next не должен упаковывать его в бандл сервера.
  serverExternalPackages: ["@prisma/client"],
  // Dev-ресурсы по умолчанию только с localhost. Браузер на 127.0.0.1 иначе
  // не получает JS, и формы входа/регистрации выглядят «сломанными».
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Тонкий путь читает tokens.css / modes.css с диска — файлы должны попасть в серверный бандл.
  outputFileTracingIncludes: {
    "/u": ["./src/styles/tokens.css", "./src/styles/modes.css"],
    "/u/[[...path]]": ["./src/styles/tokens.css", "./src/styles/modes.css"],
    "/opengraph-image": ["./src/styles/tokens.css"],
    "/[city]/job/[slug]/opengraph-image": ["./src/styles/tokens.css"],
  },
  /**
   * Картинки только с чужих CDN. Файлы логотипов мы не храним (Закон 10).
   * Список доменов и зачем каждый хост — IMAGE_REMOTE_PATTERNS в src/lib/images/remote.ts.
   * Форматы avif/webp; quality 40 — Lite-превью, 75 — Full. Ширины 32/40/48 — логотипы.
   */
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [IMAGE_THUMB_QUALITY, IMAGE_ADAPTIVE_QUALITY],
    imageSizes: [16, 32, 40, 48, 64, 96, 128, 256, 384],
    remotePatterns: IMAGE_REMOTE_PATTERNS,
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  async rewrites() {
    // Браузер всё равно спрашивает /favicon.ico. Не отдаём тяжёлый растр из app/icon —
    // тот же лёгкий SVG, что в metadata (бюджет Lite ≤ 60 КБ на картинки).
    return [
      { source: "/favicon.ico", destination: "/icons/app.svg" },
      { source: "/yandex_:code.html", destination: "/seo-verify/yandex/:code" },
      { source: "/google:code.html", destination: "/seo-verify/google/:code" },
    ];
  },
  async headers() {
    const noIndex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    const privateStore = { key: "Cache-Control", value: "private, no-store" };
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/admin",
        headers: [privateStore, noIndex],
      },
      {
        source: "/admin/:path*",
        headers: [privateStore, noIndex],
      },
      {
        source: "/api/:path*",
        headers: [noIndex],
      },
      {
        source: "/auth",
        headers: [privateStore, noIndex],
      },
      {
        source: "/auth/:path*",
        headers: [privateStore, noIndex],
      },
      {
        source: "/employer",
        headers: [privateStore, noIndex],
      },
      {
        source: "/employer/:path*",
        headers: [privateStore, noIndex],
      },
      {
        source: "/profile",
        headers: [privateStore, noIndex],
      },
      {
        source: "/profile/:path*",
        headers: [privateStore, noIndex],
      },
      {
        source: "/login",
        headers: [privateStore, noIndex],
      },
    ];
  },
};

export default nextConfig;