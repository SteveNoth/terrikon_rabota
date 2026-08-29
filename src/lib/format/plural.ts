/**
 * Русское склонение: 1 вакансия, 2 вакансии, 5 вакансий.
 * Правило: 11–14 всегда «много», иначе смотрим последнюю цифру.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) {
    return many;
  }
  if (last === 1) {
    return one;
  }
  if (last >= 2 && last <= 4) {
    return few;
  }
  return many;
}

export function pluralVacancies(count: number): string {
  return `${count} ${plural(count, "вакансия", "вакансии", "вакансий")}`;
}
