function asOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Постоянный адрес сайта. Не берём VERCEL_URL первым: это одноразовый хост деплоя
 * (`проект-hash-team.vercel.app`). Telegram режет такую длинную ссылку на две,
 * канон и превью тоже уезжают не туда.
 */
export function siteOrigin(): string {
  const fromEnv = asOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (fromEnv) {
    return fromEnv;
  }
  const production = asOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "");
  if (production) {
    return production;
  }
  const deployment = asOrigin(process.env.VERCEL_URL ?? "");
  if (deployment) {
    return deployment;
  }
  return "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const origin = siteOrigin();
  if (!path || path === "/") {
    return origin;
  }
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
