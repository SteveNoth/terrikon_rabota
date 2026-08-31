import { plural } from "@/lib/format/plural";

export function formatWait(from: Date, now = new Date()): string {
  const ms = Math.max(0, now.getTime() - from.getTime());
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) {
    return `${days} ${plural(days, "день", "дня", "дней")}`;
  }
  if (hours >= 1) {
    return `${hours} ${plural(hours, "час", "часа", "часов")}`;
  }
  const shown = Math.max(1, minutes);
  return `${shown} ${plural(shown, "минуту", "минуты", "минут")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} КБ`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} МБ`;
}

export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) {
    return "—";
  }
  return `${Math.round((1000 * part) / whole) / 10} %`;
}
