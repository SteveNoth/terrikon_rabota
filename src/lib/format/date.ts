import { plural } from "@/lib/format/plural";

const MOSCOW = "Europe/Moscow";

function ymd(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { y: num("year"), m: num("month"), d: num("day") };
}

function calendarDaysAgo(then: Date, now: Date): number {
  const a = ymd(then);
  const b = ymd(now);
  const utcA = Date.UTC(a.y, a.m - 1, a.d);
  const utcB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((utcB - utcA) / 86_400_000);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** «сегодня», «вчера», «3 дня назад», дальше 12.08.2026. Календарь — московский. */
export function formatDate(value: Date | string, now = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diff = calendarDaysAgo(date, now);
  if (diff < 0) {
    const { d, m, y } = ymd(date);
    return `${pad2(d)}.${pad2(m)}.${y}`;
  }
  if (diff === 0) {
    return "сегодня";
  }
  if (diff === 1) {
    return "вчера";
  }
  if (diff < 7) {
    return `${diff} ${plural(diff, "день", "дня", "дней")} назад`;
  }

  const { d, m, y } = ymd(date);
  return `${pad2(d)}.${pad2(m)}.${y}`;
}
