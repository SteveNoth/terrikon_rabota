import { SITE_NAME } from "@/lib/seo/brand";
import { siteOrigin } from "@/lib/seo/origin";

/** Пути, которые поисковик не должен обходить и не должен считать страницами сайта. */
export const ROBOTS_DISALLOW = [
  "/admin",
  "/api",
  "/profile",
  "/employer",
  "/auth",
  "/login",
  "/dev",
  "/offline",
  "/u",
  "/*?*mode=",
  "/*?*sort=",
  "/*?*page=",
  "/*?*filters=",
  "/*?*reset=",
  "/*?*report=",
  "/*?*notified=",
  "/*?*q=",
] as const;

export function robotsTxt(): string {
  const origin = siteOrigin();
  const host = new URL(origin).host;
  const disallow = ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`).join("\n");
  return `User-agent: *
Allow: /
${disallow}

Host: ${host}
Sitemap: ${origin}/sitemap.xml
`;
}

export function robotsComment(): string {
  return `${SITE_NAME}: служебные кабинеты и параметры сортировки закрыты, sitemap указан.`;
}
