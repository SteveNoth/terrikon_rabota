import { createHash } from "node:crypto";
import { DEDUPE_WINDOW_DAYS } from "@/lib/parser/limits";

/** sha1(первые 500 символов + телефон) — уровень 2 из 11.5. */
export function contentHash(text: string, phone: string | null | undefined): string {
  const body = text.replace(/\s+/g, " ").trim().slice(0, 500);
  const payload = `${body}|${phone ?? ""}`;
  return createHash("sha1").update(payload).digest("hex");
}

export function isSha1(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{40}$/i.test(value));
}

/** Расстояние Левенштейна без библиотек. Заголовки короткие — таблица крошечная. */
export function levenshtein(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return right.length;
  }
  if (!right) {
    return left.length;
  }
  const rows = left.length + 1;
  const cols = right.length + 1;
  const prev = new Array<number>(cols);
  const cur = new Array<number>(cols);
  for (let j = 0; j < cols; j += 1) {
    prev[j] = j;
  }
  for (let i = 1; i < rows; i += 1) {
    cur[0] = i;
    const a = left.charCodeAt(i - 1);
    for (let j = 1; j < cols; j += 1) {
      const cost = a === right.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j < cols; j += 1) {
      prev[j] = cur[j] ?? 0;
    }
  }
  return prev[cols - 1] ?? 0;
}

export function titlesSimilar(left: string, right: string): boolean {
  const a = left.trim().toLocaleLowerCase("ru-RU");
  const b = right.trim().toLocaleLowerCase("ru-RU");
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const longest = Math.max(a.length, b.length);
  if (longest <= 2) {
    return a === b;
  }
  const distance = levenshtein(a, b);
  if (distance <= 2) {
    return true;
  }
  return distance / longest <= 0.2;
}

export function dedupeCutoff(now = new Date()): Date {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - DEDUPE_WINDOW_DAYS);
  return date;
}

export function samePostUnits(leftPostId: string, rightPostId: string): boolean {
  return Boolean(leftPostId) && leftPostId === rightPostId;
}
