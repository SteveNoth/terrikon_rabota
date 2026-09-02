/**
 * Буквенный аватар: цвет из названия, пара фон+текст всегда из токенов
 * (контраст уже заложен в палитре, не считаем HEX на лету).
 */

export const AVATAR_TONE_COUNT = 8;

const LEGAL_PREFIX = new Set([
  "ООО",
  "ОАО",
  "ЗАО",
  "ПАО",
  "НАО",
  "АО",
  "ИП",
  "ЧП",
  "НП",
  "ГУП",
  "МУП",
  "АНО",
  "НКО",
  "НПО",
  "ПК",
  "ТСЖ",
  "СНТ",
  "ТОО",
  "LLC",
  "LTD",
  "INC",
]);

export function initialsFromName(name: string): string {
  const parts = name
    .replace(/[«»„“”"'`]/g, " ")
    .replace(/[()[\],.;:]/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/^[-–—]+|[-–—]+$/g, ""))
    .filter(Boolean)
    .filter((part) => !LEGAL_PREFIX.has(part.toUpperCase()));

  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
  }
  if (parts.length === 1) {
    const letters = parts[0]!.replace(/[^0-9A-Za-zА-Яа-яЁё]/g, "");
    return letters.slice(0, 2).toUpperCase() || "?";
  }
  return "?";
}

export function avatarToneIndex(name: string): number {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % AVATAR_TONE_COUNT;
}

export const AVATAR_TONE_CLASSES = [
  "bg-brand text-brand-text",
  "bg-accent text-accent-text",
  "bg-success text-text-inverse",
  "bg-info text-text-inverse",
  "bg-warning text-accent-text",
  "bg-danger text-text-inverse",
  "bg-surface-inverse text-text-inverse",
  "bg-chart-6 text-text-inverse",
] as const;

export function avatarToneClass(name: string): (typeof AVATAR_TONE_CLASSES)[number] {
  return AVATAR_TONE_CLASSES[avatarToneIndex(name)]!;
}