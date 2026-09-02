import { ModerationStatus, type WorkFormat } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { getFraud } from "@/lib/policy/dictionaries";
import { monthlyEquivalent } from "@/lib/policy/trust";
import type { MarketRow, MarketSnapshot, PolicyWorkFormat } from "@/lib/policy/types";

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

function asFormat(value: WorkFormat | string): PolicyWorkFormat {
  if (value === "VAHTA" || value === "REMOTE") {
    return value;
  }
  return "LOCAL";
}

/**
 * Медиана зарплаты опубликованных вакансий той же профессии и формата.
 * Для скрытого СВО всегда нужна местная (LOCAL) медиана — вахту в неё не мешаем.
 */
export async function loadProfessionMarket(
  professionSlug: string | null,
  workFormat: PolicyWorkFormat | WorkFormat | string,
  exceptId?: string,
): Promise<MarketSnapshot> {
  const empty: MarketSnapshot = { byProfession: {} };
  if (!professionSlug) {
    return empty;
  }
  const fmt = asFormat(String(workFormat));
  const formats: PolicyWorkFormat[] = fmt === "LOCAL" ? ["LOCAL"] : ["LOCAL", fmt];
  const rows = await prisma.vacancy.findMany({
    where: {
      professionSlug,
      workFormat: { in: formats },
      isActive: true,
      moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] },
      OR: [{ salaryFrom: { not: null } }, { salaryTo: { not: null } }],
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: {
      salaryFrom: true,
      salaryTo: true,
      salaryPeriod: true,
      workFormat: true,
    },
    take: 400,
  });

  const byFormat: Record<string, number[]> = { LOCAL: [], VAHTA: [], REMOTE: [] };
  for (const row of rows) {
    const amounts = [row.salaryFrom, row.salaryTo].filter((item): item is number => item != null);
    if (amounts.length === 0) {
      continue;
    }
    const monthly = monthlyEquivalent(Math.max(...amounts), row.salaryPeriod);
    const key = asFormat(row.workFormat);
    byFormat[key]?.push(monthly);
  }

  const profession: MarketSnapshot["byProfession"][string] = {};
  for (const key of formats) {
    const values = byFormat[key] ?? [];
    const mid = median(values);
    if (mid != null) {
      const row: MarketRow = { median: mid, sample: values.length };
      profession[key] = row;
    } else {
      profession[key] = { median: 0, sample: 0 };
    }
  }
  return { byProfession: { [professionSlug]: profession } };
}

export function minSample(): number {
  return Number(getFraud().minSample || 5);
}
