/**
 * Приводит российский номер к виду +7 949 123-45-67.
 * Если цифр не 10–11, ничего не выдумываем — возвращаем как было.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) {
    return "";
  }

  const digits = raw.replace(/\D/g, "");
  let normalized = digits;

  if (normalized.length === 11 && normalized.startsWith("8")) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (normalized.length === 10) {
    normalized = `7${normalized}`;
  }
  if (normalized.length !== 11 || !normalized.startsWith("7")) {
    return raw.trim();
  }

  const code = normalized.slice(1, 4);
  const a = normalized.slice(4, 7);
  const b = normalized.slice(7, 9);
  const c = normalized.slice(9, 11);
  return `+7 ${code} ${a}-${b}-${c}`;
}
