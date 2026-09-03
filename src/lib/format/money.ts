/**
 * Деньги для карточки. Считаем из чисел, не из сырой строки объявления:
 * так «45000», «45 000 руб.» и «45 тыс.» выглядят одинаково.
 */
export type SalaryPeriodCode = "MONTH" | "SHIFT" | "HOUR" | "PIECE";

export type MoneyInput = {
  salaryFrom?: number | null;
  salaryTo?: number | null;
  salaryPeriod?: SalaryPeriodCode | null;
};

function groupThousands(value: number): string {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return rounded < 0 ? `−${abs}` : abs;
}

function unit(period: SalaryPeriodCode | null | undefined): string {
  switch (period) {
    case "SHIFT":
      return "₽/смена";
    case "HOUR":
      return "₽/час";
    case "PIECE":
      return "₽/шт";
    default:
      return "₽";
  }
}

/** Сумма из конфига, не зарплата вакансии: «2 000 ₽». */
export function formatRubles(value: number): string {
  return `${groupThousands(value)} ₽`;
}

export function formatMoney(input: MoneyInput): string {
  const from = input.salaryFrom ?? null;
  const to = input.salaryTo ?? null;
  const suffix = unit(input.salaryPeriod);

  if (from == null && to == null) {
    return "По договорённости";
  }
  if (from != null && to != null) {
    if (from === to) {
      return `${groupThousands(from)} ${suffix}`;
    }
    return `${groupThousands(from)} – ${groupThousands(to)} ${suffix}`;
  }
  if (from != null) {
    return `от ${groupThousands(from)} ${suffix}`;
  }
  return `до ${groupThousands(to!)} ${suffix}`;
}

/** Подпись к зарплате как в источнике. 13 % молча не пересчитываем (13.3). */
export function salaryGrossNote(isGross: boolean | null | undefined): string | null {
  if (isGross === true) {
    return "до вычета налога";
  }
  if (isGross === false) {
    return "на руки";
  }
  return null;
}
