/**
 * СВО для формы кабинета. Те же словари, что scripts/svo.py, другой вход:
 * явный слой — title+description; скрытый — поля формы, не extract_*.
 */

import { compiled, getKeywords, getSvo, professionSphere } from "@/lib/policy/dictionaries";
import { iterHits, normalizeText } from "@/lib/policy/text";
import type { MarketSnapshot, PolicyFlag, PolicyVacancyInput, PolicyWorkFormat } from "@/lib/policy/types";

export type SvoVerdict = "reject" | "maybe" | "clear";

export type SvoResult = {
  verdict: SvoVerdict;
  layer: "explicit" | "hidden";
  flags: PolicyFlag[];
  score: number;
};

function asWorkFormat(value: string | null | undefined): PolicyWorkFormat {
  const token = String(value || "LOCAL").toUpperCase();
  if (token === "VAHTA" || token === "REMOTE" || token === "LOCAL") {
    return token;
  }
  return "LOCAL";
}

function thresholds(): { reject: number; maybe: number } {
  const cfg = getSvo().thresholds;
  return { reject: Number(cfg.reject || 40), maybe: Number(cfg.maybe || 20) };
}

function toFlag(id: string, points: number, sample: string, label: string): PolicyFlag {
  return { id, points, label, sample, detail: "", hard: false };
}

export function explicitSvo(text: string): SvoResult {
  const { reject, maybe } = thresholds();
  const body = normalizeText(text || "");
  const flags: PolicyFlag[] = [];
  for (const hit of iterHits(compiled.svoExplicit, body)) {
    flags.push(
      toFlag(
        String(hit.entry.id || hit.sample),
        Number(hit.entry.weight || 10),
        hit.sample,
        String(hit.entry.label || hit.entry.id || hit.sample),
      ),
    );
  }
  const score = flags.reduce((sum, item) => sum + item.points, 0);
  let verdict: SvoVerdict = "clear";
  if (score >= reject) {
    verdict = "reject";
  } else if (score >= maybe) {
    verdict = "maybe";
  }
  return { verdict, layer: "explicit", flags, score };
}

function salaryAmount(input: PolicyVacancyInput): { amount: number | null; period: string | null } {
  const amounts = [input.salaryFrom, input.salaryTo].filter((item): item is number => item != null && item > 0);
  if (amounts.length === 0) {
    return { amount: null, period: input.salaryPeriod };
  }
  return { amount: Math.max(...amounts), period: input.salaryPeriod };
}

function periodIsMonthly(period: string | null | undefined): boolean {
  if (!period) {
    return true;
  }
  const token = period.toUpperCase();
  if (token === "HOUR" || token === "HOURLY" || token === "DAY" || token === "DAILY" || token === "SHIFT" || token === "PIECE") {
    return false;
  }
  return true;
}

function vahtaSigns(input: PolicyVacancyInput): string[] {
  const signs: string[] = [];
  if (asWorkFormat(String(input.workFormat)) === "VAHTA") {
    signs.push("workFormat");
  }
  const rotationMin = Number(getKeywords().vahta.rotationMin || 15);
  if (input.rotationPattern?.trim()) {
    signs.push("rotation");
  } else if (typeof input.vahtaDays === "number" && input.vahtaDays >= rotationMin) {
    signs.push("rotation");
  }
  if (input.workLocationText?.trim()) {
    signs.push("destination");
  }
  if (input.housingProvided) {
    signs.push("housing");
  }
  return signs;
}

function localMarketRow(market: MarketSnapshot | null | undefined, slug: string | null): { median?: number; sample: number } | null {
  if (!slug) {
    return null;
  }
  const row = market?.byProfession?.[slug];
  if (!row) {
    return null;
  }
  if (row.LOCAL && (row.LOCAL.median != null || row.LOCAL.sample != null)) {
    return row.LOCAL;
  }
  if (row.median != null) {
    return { median: row.median, sample: row.sample ?? 0 };
  }
  return null;
}

function salaryBars(
  slug: string | null,
  sphere: string | null,
  market: MarketSnapshot | null | undefined,
): { reject: number | null; maybe: number | null } {
  const cfg = getSvo();
  const multiplier = Number(cfg.salaryMultiplier || 3);
  const maybeMult = Number(cfg.maybeMultiplier || 2.2);
  const minSample = Number(cfg.minSample || 5);
  const ceilings = cfg.sphereSalaryCeiling as Record<string, number>;
  let ceiling = sphere && ceilings[sphere] != null ? Number(ceilings[sphere]) : null;
  if (ceiling == null && ceilings.default != null) {
    ceiling = Number(ceilings.default);
  }
  const maybeRatio = Number(cfg.maybeCeilingRatio || 0.85);
  const row = localMarketRow(market, slug);
  const sample = row?.sample ?? 0;
  const median = row?.median;
  if (sample >= minSample && median != null) {
    return { reject: Math.trunc(median * multiplier), maybe: Math.trunc(median * maybeMult) };
  }
  if (ceiling != null) {
    return { reject: ceiling, maybe: Math.trunc(ceiling * maybeRatio) };
  }
  return { reject: null, maybe: null };
}

/**
 * Скрытый набор по полям формы. Три условия сразу: профессия-прикрытие,
 * зарплата ≥ порога местной медианы (или потолка сферы), нет вахты.
 * Одно без другого — не отсев: вахтовый повар на 180 000 и местный охранник на 28 000 проходят.
 */
export function hiddenSvo(input: PolicyVacancyInput, market?: MarketSnapshot | null): SvoResult {
  const cfg = getSvo();
  const slug = input.professionSlug;
  const sphere = input.sphere || professionSphere(slug);
  const cover = new Set(cfg.coverProfessions || []);
  const isCover = Boolean(slug) && cover.has(slug as typeof cfg.coverProfessions[number]);
  const { amount, period } = salaryAmount(input);
  const monthly = periodIsMonthly(period);
  const signs = vahtaSigns(input);
  const flags: PolicyFlag[] = [];

  if (isCover) {
    flags.push(toFlag("cover", 1, String(slug), "профессия-прикрытие"));
  } else {
    flags.push(toFlag("not_cover", 0, String(slug || ""), "не профессия-прикрытие"));
  }
  for (const sign of signs) {
    flags.push(toFlag(`vahta_${sign}`, 0, sign, `вахтовый признак: ${sign}`));
  }

  let salaryReject = false;
  let salaryMaybe = false;
  if (amount == null) {
    flags.push(toFlag("no_salary", 0, "", "нет зарплаты числом"));
  } else if (!monthly) {
    flags.push(toFlag("salary_period", 0, String(period), "зарплата не за месяц"));
  } else {
    const bars = salaryBars(slug, sphere, market);
    if (bars.reject == null) {
      flags.push(toFlag("no_bar", 0, "", "нет медианы и потолка"));
    } else if (amount >= bars.reject) {
      salaryReject = true;
      flags.push(toFlag("salary_anomaly", 1, `${amount}>${bars.reject}`, "аномальная местная зарплата"));
    } else if (bars.maybe != null && amount >= bars.maybe) {
      salaryMaybe = true;
      flags.push(toFlag("salary_maybe", 1, `${amount}>${bars.maybe}`, "зарплата выше серого порога"));
    } else {
      flags.push(toFlag("salary_ok", 0, String(amount), "зарплата рынка"));
    }
  }

  const noVahta = signs.length === 0;
  if (isCover && salaryReject && noVahta) {
    return {
      verdict: "reject",
      layer: "hidden",
      flags: [toFlag("hidden_svo", 0, slug || "", "скрытый набор"), ...flags],
      score: 2,
    };
  }
  if (isCover && salaryMaybe && noVahta) {
    return {
      verdict: "maybe",
      layer: "hidden",
      flags: [toFlag("hidden_svo_maybe", 0, slug || "", "серый скрытый набор"), ...flags],
      score: 1,
    };
  }
  return { verdict: "clear", layer: "hidden", flags, score: 0 };
}
