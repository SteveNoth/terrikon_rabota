/** Достаём телефон из текста поста, чтобы предзаполнить карточку из модерации. */

export function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+7|8|7)?[\s(]*\d{3}[)\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
  if (!match) {
    return null;
  }
  const digits = match[0].replace(/\D/g, "");
  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith("8")) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (normalized.length === 10) {
    normalized = `7${normalized}`;
  }
  if (normalized.length !== 11 || !normalized.startsWith("7")) {
    return match[0].trim();
  }
  return `+${normalized}`;
}

export function extractTelegram(text: string): string | null {
  const match = text.match(/@([a-zA-Z0-9_]{3,32})/);
  return match ? `@${match[1]}` : null;
}

export function firstTitle(text: string, fallback = "Вакансия"): string {
  const line = text.split(/\n+/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (line.length >= 3) {
    return line.slice(0, 120);
  }
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, 80) || fallback;
}
