export type SphereCountRow = {
  sphere: string;
  count: number;
};

/**
 * Пустой SphereStat при живом CityStat — не снимок, а «ещё не считали».
 * Иначе главная рисует нули, пока hourly cron не пробежит.
 */
export function storedSphereSnapshot(
  cityFound: boolean,
  rows: SphereCountRow[],
): SphereCountRow[] | null {
  if (!cityFound || rows.length === 0) {
    return null;
  }
  return rows;
}
