import supportJson from "@shared/support.json";
import { formatRubles } from "@/lib/format/money";

export type SupportFile = typeof supportJson;
export type SupportMethodJson = SupportFile["methods"][number];
export type SupportExpenseJson = SupportFile["expenses"][number];
export type SupportNonMoneyJson = SupportFile["nonMoney"][number];
export type SupportMethod = SupportMethodJson;
export type SupportExpense = SupportExpenseJson;
export type SupportReport = {
  period: string;
  title: string;
  href: string;
};

export type SupportGoal = {
  monthLabel: string;
  target: number;
  collected: number;
  percent: number;
  targetLabel: string;
  collectedLabel: string;
  note: string;
};

/**
 * Единственное место, которое читает NEXT_PUBLIC_DONATIONS_ENABLED.
 * Пусто, «false» и опечатка — модуль выключен. Включается только строкой true.
 */
export function isSupportEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DONATIONS_ENABLED === "true";
}

export function getSupportConfig(): SupportFile {
  return supportJson;
}

/** Только включённые способы. Реквизиты берутся из JSON, не из компонентов. */
export function getSupportMethods(): SupportMethod[] {
  return supportJson.methods.filter((method) => method.enabled);
}

export function getSupportGoal(): SupportGoal {
  const collected = Math.max(0, supportJson.goal.collected);
  const target = Math.max(0, supportJson.goal.target);
  const percent = target === 0 ? 0 : Math.min(100, Math.round((collected / target) * 100));
  return {
    monthLabel: supportJson.goal.monthLabel,
    target,
    collected,
    percent,
    targetLabel: formatRubles(target),
    collectedLabel: formatRubles(collected),
    note: supportJson.goalNote,
  };
}

export function getSupportExpenses(): SupportExpense[] {
  return supportJson.expenses;
}

export function getSupportReports(): SupportReport[] {
  return supportJson.reports as SupportReport[];
}

export function methodAriaLabel(method: SupportMethod): string {
  const action = method.windowLabel || method.name;
  if (method.url) {
    return `Поддержать проект ${action}, откроется в новом окне`;
  }
  return `Поддержать проект ${action}`;
}
