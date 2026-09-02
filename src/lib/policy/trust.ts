/**
 * Оценка доверия для формы кабинета. Смысл как scripts/trust.py:
 * стартуем со 100, вычитаем веса из блока fraud. Жёсткий флаг — BLOCKED,
 * баллы не считаем. Зарплата против медианы той же профессии и того же workFormat.
 * Выборки < 5 — потолок сферы из JSON, не константа в коде.
 */

import { compiled, getFraud, professionName, professionSphere } from "@/lib/policy/dictionaries";
import { iterHits, normalizeText } from "@/lib/policy/text";
import type {
  ContactVerdictValue,
  MarketSnapshot,
  PolicyFlag,
  PolicyVacancyInput,
  PolicyWorkFormat,
} from "@/lib/policy/types";

const PAIR_HOURS_RE = /(\d+(?:[.,]\d+)?)\s*[-–—-]\s*(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч)(?![\p{L}\p{N}_])/iu;
const ONE_HOURS_RE = /(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч)\s*(?:в\s+день|в\s+сутки)(?![\p{L}\p{N}_])/iu;
const PARU_HOURS_RE = /(?<![\p{L}\p{N}_])пар[уыеа]\s+час/iu;
const CLOCK_SPAN_RE = /с\s+(\d{1,2})[:.](\d{2})\s+до\s+(\d{1,2})[:.](\d{2})/iu;

export type TrustScoreResult = {
  score: number;
  flags: PolicyFlag[];
  hard: boolean;
  highRisk: boolean;
  hoursPerDay: number | null;
  monthlySalary: number | null;
  newContact: boolean;
};

function asWorkFormat(value: string | null | undefined): PolicyWorkFormat {
  const token = String(value || "LOCAL").toUpperCase();
  if (token === "VAHTA" || token === "REMOTE" || token === "LOCAL") {
    return token;
  }
  return "LOCAL";
}

function addFlag(
  flags: PolicyFlag[],
  input: { id: string; points: number; sample?: string; label?: string; detail?: string; hard?: boolean },
): void {
  flags.push({
    id: input.id,
    points: input.points,
    sample: input.sample ?? "",
    label: input.label || input.id,
    detail: input.detail ?? "",
    hard: Boolean(input.hard),
  });
}

export function extractHoursPerDay(text: string): number | null {
  const body = normalizeText(text || "");
  if (!body) {
    return null;
  }
  if (PARU_HOURS_RE.test(body)) {
    return 2;
  }
  const pair = body.match(PAIR_HOURS_RE);
  if (pair) {
    const left = Number(String(pair[1]).replace(",", "."));
    const right = Number(String(pair[2]).replace(",", "."));
    if (left > 0 && left <= 16 && right > 0 && right <= 16) {
      return Math.round(((left + right) / 2) * 100) / 100;
    }
  }
  const one = body.match(ONE_HOURS_RE);
  if (one) {
    const value = Number(String(one[1]).replace(",", "."));
    if (value > 0 && value <= 16) {
      return value;
    }
  }
  const clock = body.match(CLOCK_SPAN_RE);
  if (clock) {
    const start = Number(clock[1]) + Number(clock[2]) / 60;
    let end = Number(clock[3]) + Number(clock[4]) / 60;
    if (end <= start) {
      end += 24;
    }
    const hours = end - start;
    if (hours >= 1 && hours <= 16) {
      return Math.round(hours * 100) / 100;
    }
  }
  return null;
}

export function monthlyEquivalent(amount: number, period: string | null | undefined): number {
  const cfg = getFraud();
  const token = String(period || "month").toLowerCase();
  const days = Number(cfg.workDaysPerMonth || 22);
  const hours = Number(cfg.hoursPerDayDefault || 8);
  const shiftAsMonth = Number(cfg.shiftAsMonthlyAbove || 40000);
  if (token === "month" || token === "monthly") {
    return Math.trunc(amount);
  }
  if (token === "hour" || token === "hourly") {
    return Math.trunc(amount * days * hours);
  }
  if (token === "day" || token === "daily") {
    return Math.trunc(amount * days);
  }
  if (token === "shift" || token === "piece") {
    if (amount >= shiftAsMonth) {
      return Math.trunc(amount);
    }
    return Math.trunc(amount * days);
  }
  return Math.trunc(amount);
}

function salaryAmount(input: PolicyVacancyInput): { amount: number | null; period: string | null } {
  const amounts = [input.salaryFrom, input.salaryTo].filter((item): item is number => item != null);
  if (amounts.length === 0) {
    return { amount: null, period: input.salaryPeriod };
  }
  return { amount: Math.max(...amounts), period: input.salaryPeriod };
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU").replace(/\u00a0/g, " ")} ₽`;
}

function marketRow(
  market: MarketSnapshot | null | undefined,
  slug: string | null,
  workFormat: PolicyWorkFormat,
): { median?: number; sample: number } | null {
  if (!slug) {
    return null;
  }
  const row = market?.byProfession?.[slug];
  if (!row) {
    return null;
  }
  const nested = row[workFormat];
  if (nested && (nested.median != null || nested.sample != null)) {
    return nested;
  }
  if (workFormat === "LOCAL" && row.median != null) {
    return { median: row.median, sample: row.sample ?? 0 };
  }
  return null;
}

function ceiling(workFormat: PolicyWorkFormat, sphere: string | null): number | null {
  const block = (getFraud().sphereSalaryCeiling as Record<string, Record<string, number>>)[workFormat] || {};
  if (sphere && block[sphere] != null) {
    return Number(block[sphere]);
  }
  if (block.default != null) {
    return Number(block.default);
  }
  return null;
}

function bigMoneyBar(workFormat: PolicyWorkFormat): number {
  const bars = getFraud().bigMoneyMonthly as Record<string, number>;
  if (bars[workFormat] != null) {
    return Number(bars[workFormat]);
  }
  return Number(bars.LOCAL || 80000);
}

function phraseHits(
  group: typeof compiled.fastMoney,
  body: string,
  hasPhone: boolean,
  flags: PolicyFlag[],
): void {
  for (const hit of iterHits(group, body)) {
    if (hit.entry.requireNoPhone && hasPhone) {
      continue;
    }
    addFlag(flags, {
      id: String(hit.entry.id || hit.sample),
      points: Number(hit.entry.weight || 0),
      sample: hit.sample,
      label: String(hit.entry.label || hit.entry.id || hit.sample),
    });
  }
}

export function scanHardFlags(input: {
  text: string;
  professionSlug: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: string | null;
  workFormat: PolicyWorkFormat;
  market?: MarketSnapshot | null;
}): { hard: boolean; flags: PolicyFlag[] } {
  const body = normalizeText(input.text);
  const flags: PolicyFlag[] = [];
  let hard = false;
  for (const hit of iterHits(compiled.hardFlags, body)) {
    hard = true;
    addFlag(flags, {
      id: String(hit.entry.id || hit.sample),
      points: 0,
      sample: hit.sample,
      label: String(hit.entry.label || hit.entry.id || hit.sample),
      hard: true,
    });
  }
  const abroad = iterHits(compiled.abroad, body);
  const docs = iterHits(compiled.documentsHelp, body);
  if (abroad.length > 0 && docs.length > 0 && hard) {
    addFlag(flags, {
      id: "trafficking_combo",
      points: 0,
      sample: abroad[0]?.sample ?? "",
      label: "признаки торговли людьми",
      detail: "работа за границей + документы + предоплата",
      hard: true,
    });
  }
  const klady = iterHits(compiled.klady, body);
  if (klady.length > 0) {
    hard = true;
    addFlag(flags, {
      id: String(klady[0]?.entry.id || "klady"),
      points: 0,
      sample: klady[0]?.sample ?? "",
      label: String(klady[0]?.entry.label || "клады / расфасовка"),
      hard: true,
    });
  }
  const { amount, period } = salaryAmount({
    title: "",
    description: "",
    professionSlug: input.professionSlug,
    salaryFrom: input.salaryFrom,
    salaryTo: input.salaryTo,
    salaryPeriod: input.salaryPeriod,
    workFormat: input.workFormat,
    citySlug: "",
    contactPhone: null,
    contactTelegram: null,
    employerId: "",
    userId: "",
  });
  const monthly = amount != null ? monthlyEquivalent(amount, period) : null;
  const daily = iterHits(compiled.dailyPay, body).length > 0 || (period != null && ["day", "daily"].includes(period.toLowerCase()));
  if (input.professionSlug === "kurer" && daily && monthly != null) {
    const cfg = getFraud();
    const row = marketRow(input.market, input.professionSlug, input.workFormat);
    const minSample = Number(cfg.minSample || 5);
    const multiplier = Number(cfg.salaryMultiplier || 3);
    if (row && (row.sample || 0) >= minSample && row.median) {
      if (monthly >= row.median * multiplier) {
        hard = true;
        addFlag(flags, {
          id: "courier_daily_high",
          points: 0,
          sample: String(monthly),
          label: "курьер + ежедневная оплата + зарплата втрое выше медианы",
          hard: true,
        });
      }
    }
  }
  return { hard, flags };
}

export function scoreTrust(input: {
  vacancy: PolicyVacancyInput;
  text: string;
  market?: MarketSnapshot | null;
  contactVerdict: ContactVerdictValue;
}): TrustScoreResult {
  const cfg = getFraud();
  const vacancy = input.vacancy;
  const body = normalizeText(input.text);
  const fmt = asWorkFormat(String(vacancy.workFormat));
  const flags: PolicyFlag[] = [];
  const hours = extractHoursPerDay(input.text);
  const { amount, period } = salaryAmount(vacancy);
  const monthly = amount != null ? monthlyEquivalent(amount, period) : null;
  const slug = vacancy.professionSlug;
  const sphere = vacancy.sphere || professionSphere(slug);
  const hasPhone = Boolean(vacancy.contactPhone);

  phraseHits(compiled.fastMoney, body, hasPhone, flags);
  phraseHits(compiled.privacy, body, hasPhone, flags);
  phraseHits(compiled.denials, body, hasPhone, flags);

  const minSample = Number(cfg.minSample || 5);
  const multiplier = Number(cfg.salaryMultiplier || 3);
  const weights = cfg.weights;

  if (monthly != null) {
    const row = marketRow(input.market, slug, fmt);
    const sampleN = row?.sample ?? 0;
    const median = row?.median != null ? Number(row.median) : null;
    if (sampleN >= minSample && median) {
      if (monthly >= Math.trunc(median * multiplier)) {
        addFlag(flags, {
          id: "salary_vs_median",
          points: Number(weights.salaryVsMedian || 40),
          sample: String(monthly),
          label: "зарплата выше медианы более чем втрое",
          detail: `${formatMoney(monthly)} при медиане ${formatMoney(median)} по профессии ${professionName(slug)} (выборка ${sampleN})`,
        });
      }
    } else {
      const cap = ceiling(fmt, sphere);
      if (cap && monthly > cap) {
        addFlag(flags, {
          id: "salary_vs_ceiling",
          points: Number(weights.salaryVsMedian || 40),
          sample: String(monthly),
          label: "зарплата выше потолка сферы",
          detail: `${formatMoney(monthly)} при потолке ${formatMoney(cap)} по сфере ${sphere || "default"} (выборка ${sampleN})`,
        });
      }
    }

    if (hours) {
      const days = Number(cfg.workDaysPerMonth || 22);
      const implied = monthly / (hours * days);
      const defaultHours = Number(cfg.hoursPerDayDefault || 8);
      let medianHourly: number;
      if (median) {
        medianHourly = median / (defaultHours * days);
      } else {
        const cap = ceiling(fmt, sphere) || bigMoneyBar(fmt);
        medianHourly = cap / (defaultHours * days) / multiplier;
      }
      const hourlyMult = Number(cfg.hourlyMultiplier || 3);
      if (implied >= medianHourly * hourlyMult) {
        addFlag(flags, {
          id: "hourly_vs_median",
          points: Number(weights.hourlyVsMedian || 25),
          sample: String(hours),
          label: "деньги против труда",
          detail: `около ${Math.round(implied).toLocaleString("ru-RU")} ₽ в час при медиане ${Math.round(medianHourly).toLocaleString("ru-RU")}`,
        });
      }
    }

    const big = monthly >= bigMoneyBar(fmt);
    if (big) {
      const desc = vacancy.description || input.text || "";
      if (!slug) {
        addFlag(flags, {
          id: "empty_profession",
          points: Number(weights.emptyProfession || 15),
          label: "большие деньги без профессии из словаря",
        });
      }
      if (!vacancy.employerName) {
        addFlag(flags, {
          id: "empty_company",
          points: Number(weights.emptyCompany || 8),
          label: "большие деньги без названия компании",
        });
      }
      if (desc.length < Number(cfg.shortDescriptionChars || 150)) {
        addFlag(flags, {
          id: "short_description",
          points: Number(weights.shortDescription || 12),
          label: "большие деньги при коротком описании",
        });
      }
      if (vacancy.contactTelegram && !vacancy.contactPhone) {
        addFlag(flags, {
          id: "account_no_phone",
          points: Number(weights.accountNoPhone || 15),
          label: "только аккаунт без телефона",
        });
      }
    }
  }

  const deducted = flags.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(100, 100 - deducted));
  const reviewAt = Number(cfg.thresholds.review || 40);
  const newContact = input.contactVerdict !== "TRUSTED";
  if (newContact) {
    addFlag(flags, {
      id: "new_contact",
      points: 0,
      sample: vacancy.contactPhone || vacancy.contactTelegram || "",
      label: "новый контакт — первое одобрение",
    });
  }

  return {
    score,
    flags,
    hard: false,
    highRisk: score < reviewAt,
    hoursPerDay: hours,
    monthlySalary: monthly,
    newContact,
  };
}
