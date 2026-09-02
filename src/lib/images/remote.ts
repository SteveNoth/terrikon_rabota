/**
 * Домены, с которых Next может тянуть картинки (логотипы работодателей).
 *
 * Закон 10: файлы мы не храним. В базе только внешняя ссылка. Оптимизатор
 * Next (`/_next/image`) не ходит в произвольный интернет — только сюда.
 * Чужой сайт работодателя, которого нет в списке, не запрашиваем: в Lite
 * это легко съело бы лимит 60 КБ. Тогда рисуем буквенный аватар.
 *
 * Зачем каждый хост:
 * - userapi.com / vk.com / vk.ru / vk-cdn — логотипы групп ВК, откуда посты;
 * - telegram.org / telegram-cdn.org — аватарки каналов Telegram;
 * - hhcdn.ru — логотипы работодателей, если объявление пришло с hh;
 * - upload.wikimedia.org — свободные знаки в сидах, не склад наших файлов.
 *   Прямые превью только стандартных ширин (20/40/60/120…), иначе 400 и аватар.
 */
export const IMAGE_REMOTE_PATTERNS = [
  { protocol: "https" as const, hostname: "userapi.com" },
  { protocol: "https" as const, hostname: "**.userapi.com" },
  { protocol: "https" as const, hostname: "vk.com" },
  { protocol: "https" as const, hostname: "**.vk.com" },
  { protocol: "https" as const, hostname: "vk.ru" },
  { protocol: "https" as const, hostname: "**.vk.ru" },
  { protocol: "https" as const, hostname: "**.vk-cdn.net" },
  { protocol: "https" as const, hostname: "**.vkuser.net" },
  { protocol: "https" as const, hostname: "telegram.org" },
  { protocol: "https" as const, hostname: "**.telegram.org" },
  { protocol: "https" as const, hostname: "**.telegram-cdn.org" },
  { protocol: "https" as const, hostname: "hhcdn.ru" },
  { protocol: "https" as const, hostname: "**.hhcdn.ru" },
  {
    protocol: "https" as const,
    hostname: "upload.wikimedia.org",
    pathname: "/wikipedia/**",
  },
];

export const IMAGE_THUMB_PX = 40;
export const IMAGE_ADAPTIVE_PX = 48;
/** Lite: одно маленькое превью, чтобы уложиться в imageMaxKb 20 и суммарно ≤ 60 КБ. */
export const IMAGE_THUMB_QUALITY = 40;
export const IMAGE_ADAPTIVE_QUALITY = 75;

function hostMatches(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const rule = pattern.toLowerCase();
  if (rule.startsWith("**.")) {
    const base = rule.slice(3);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === rule;
}

function pathMatches(pathname: string, pattern: string | undefined): boolean {
  if (!pattern || pattern === "/**") {
    return true;
  }
  const value = pathname || "/";
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(prefix);
  }
  return value === pattern;
}

/** Можно ли отдавать URL в next/image. Иначе аватар, без запроса. */
export function isAllowedRemoteImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }
    const path = url.pathname.toLowerCase();
    if (path.endsWith(".svg") || path.endsWith(".svgz")) {
      return false;
    }
    return IMAGE_REMOTE_PATTERNS.some(
      (pattern) =>
        hostMatches(url.hostname, pattern.hostname) && pathMatches(url.pathname, pattern.pathname),
    );
  } catch {
    return false;
  }
}