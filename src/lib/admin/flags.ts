import type { Prisma } from "@prisma/client";

export type TrustFlag = {
  id: string;
  points: number;
  label: string;
  sample: string;
  detail: string;
  hard: boolean;
};

const VACANCY_DOUBT_IDS = new Set([
  "empty_profession",
  "empty_company",
  "short_description",
]);

const DUPLICATE_IDS = new Set(["many_phones_in_group", "phone_many_professions"]);

const NOT_FRAUD_IDS = new Set(["new_contact", ...VACANCY_DOUBT_IDS, ...DUPLICATE_IDS]);

export function parseTrustFlags(value: Prisma.JsonValue | null | undefined): TrustFlag[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const flags: TrustFlag[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) {
      continue;
    }
    flags.push({
      id,
      points: typeof row.points === "number" ? row.points : 0,
      label: typeof row.label === "string" ? row.label : id,
      sample: typeof row.sample === "string" ? row.sample : "",
      detail: typeof row.detail === "string" ? row.detail : "",
      hard: row.hard === true,
    });
  }
  return flags;
}

export function isFraudFlag(flag: TrustFlag): boolean {
  if (NOT_FRAUD_IDS.has(flag.id) || VACANCY_DOUBT_IDS.has(flag.id) || DUPLICATE_IDS.has(flag.id)) {
    return false;
  }
  return true;
}

export function isVacancyDoubtFlag(flag: TrustFlag): boolean {
  return VACANCY_DOUBT_IDS.has(flag.id);
}

export function isDuplicateFlag(flag: TrustFlag): boolean {
  return DUPLICATE_IDS.has(flag.id);
}

export function salaryExplanation(flags: TrustFlag[]): string | null {
  const hit = flags.find(
    (flag) =>
      (flag.id === "salary_vs_median" || flag.id === "salary_vs_ceiling" || flag.id === "hourly_vs_median") &&
      flag.detail,
  );
  return hit?.detail ?? null;
}

export type QueueDoubts = {
  fraud: boolean;
  vacancy: boolean;
  duplicate: boolean;
};

export function classifyDoubts(input: {
  flags: TrustFlag[];
  trustScore: number;
  highRiskThreshold: number;
  fraudReportCount: number;
  duplicateOfId: string | null;
  groupPostings: number;
  completeness: number;
}): QueueDoubts {
  const fraudFromFlags = input.flags.some(isFraudFlag);
  const vacancyFromFlags = input.flags.some(isVacancyDoubtFlag);
  return {
    fraud:
      fraudFromFlags ||
      input.fraudReportCount > 0 ||
      input.trustScore < input.highRiskThreshold,
    vacancy: vacancyFromFlags || input.completeness < 20,
    duplicate:
      Boolean(input.duplicateOfId) ||
      input.groupPostings > 1 ||
      input.flags.some(isDuplicateFlag),
  };
}

export function parseStringList(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
      continue;
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const label =
        (typeof row.label === "string" && row.label) ||
        (typeof row.id === "string" && row.id) ||
        (typeof row.reason === "string" && row.reason);
      if (label) {
        out.push(label);
      }
    }
  }
  return out;
}
