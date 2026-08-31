/**
 * Куда вернуть человека после входа. Только относительный путь своего сайта,
 * иначе «next=https://evil.example» уведёт с формы куда не надо.
 */
export function safeNextPath(value: string | string[] | null | undefined, fallback = "/"): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  if (raw.includes("://") || raw.includes("\\")) {
    return fallback;
  }
  return raw;
}

export function firstQuery(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
