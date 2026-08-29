/** Причины жалобы. Это выбор человека, не вердикт сайта (Закон 18). */
export const REPORT_REASONS = [
  { id: "fraud", label: "Похоже на мошенничество" },
  { id: "stale", label: "Вакансия уже неактуальна" },
  { id: "contacts", label: "Неверные контакты или адрес" },
  { id: "not_vacancy", label: "Это не вакансия" },
  { id: "duplicate", label: "Дубль другого объявления" },
  { id: "takedown", label: "Просьба удалить (я источник или работодатель)" },
  { id: "other", label: "Другое" },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]["id"];

export function isReportReason(value: string): value is ReportReasonId {
  return REPORT_REASONS.some((item) => item.id === value);
}

export function reportReasonLabel(id: ReportReasonId): string {
  return REPORT_REASONS.find((item) => item.id === id)?.label ?? id;
}
