import { DEDUPE_WINDOW_DAYS } from "@/lib/parser/limits";

const STOP = new Set([
  "и",
  "в",
  "на",
  "с",
  "по",
  "для",
  "от",
  "до",
  "или",
  "а",
  "но",
  "это",
  "как",
  "из",
  "к",
  "у",
  "о",
  "за",
  "при",
  "не",
  "то",
  "же",
]);

function shingles(text: string, size = 3): Set<string> {
  const words = text
    .toLocaleLowerCase("ru-RU")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOP.has(word));
  const out = new Set<string>();
  if (words.length === 0) {
    return out;
  }
  if (words.length < size) {
    out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i <= words.length - size; i += 1) {
    out.add(words.slice(i, i + size).join(" "));
  }
  return out;
}

/** Доля общих шинглов. Для пункта очереди «похожесть с другим размещением». */
export function jaccardPercent(left: string, right: string): number {
  const a = shingles(left);
  const b = shingles(right);
  if (a.size === 0 && b.size === 0) {
    return 100;
  }
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const item of a) {
    if (b.has(item)) {
      inter += 1;
    }
  }
  const union = a.size + b.size - inter;
  if (union === 0) {
    return 0;
  }
  return Math.round((100 * inter) / union);
}

export function withinDedupeWindow(date: Date, now = new Date()): boolean {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - DEDUPE_WINDOW_DAYS);
  return date >= cutoff;
}
