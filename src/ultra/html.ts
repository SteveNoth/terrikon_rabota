/** Экранирование для ручной сборки HTML. Без этого чужой текст станет тегами. */

import { siteOrigin } from "@/lib/seo/origin";

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function attr(value: string): string {
  return esc(value).replace(/'/g, "&#39;");
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

export type HtmlHeadersKind = "page" | "none";

export function htmlHeaders(kind: HtmlHeadersKind): HeadersInit {
  const cache =
    kind === "none"
      ? "private, no-store"
      : "private, max-age=60, stale-while-revalidate=300";

  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": cache,
    Vary: "Cookie, Save-Data",
    "X-Content-Type-Options": "nosniff",
  };
}

export function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}`;
  }
  return siteOrigin();
}

export function documentPage({
  title,
  description,
  canonical,
  css,
  body,
  ogImage,
  robots,
}: {
  title: string;
  description: string;
  canonical: string;
  css: string;
  body: string;
  ogImage?: string | null;
  robots?: string;
}): string {
  const image = ogImage
    ? `<meta property="og:image" content="${attr(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${attr(ogImage)}">`
    : `<meta name="twitter:card" content="summary">`;
  const robotsTag = robots ? `<meta name="robots" content="${attr(robots)}">` : "";
  return `<!DOCTYPE html>
<html lang="ru" data-mode="ultra" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${attr(canonical)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(canonical)}">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="Террикон Работа">
${image}
${robotsTag}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}
