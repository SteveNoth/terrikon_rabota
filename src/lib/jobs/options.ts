import { SOURCE_LABEL } from "@/lib/format/source";
import type { VacancySort } from "@/lib/repo/vacancies";

export const EXPERIENCE_OPTIONS = [
  { value: "NONE", label: "Без опыта" },
  { value: "UP_TO_1", label: "До 1 года" },
  { value: "FROM_1_TO_3", label: "От 1 до 3 лет" },
  { value: "FROM_3", label: "От 3 лет" },
] as const;

export const EMPLOYMENT_OPTIONS = [
  { value: "FULL", label: "Полная занятость" },
  { value: "PART", label: "Частичная" },
  { value: "SHIFT", label: "Сменная" },
  { value: "TEMPORARY", label: "Временная" },
  { value: "REMOTE", label: "Удалённая" },
] as const;

export const SCHEDULE_OPTIONS = [
  { value: "2/2", label: "2/2" },
  { value: "5/2", label: "5/2" },
  { value: "6/1", label: "6/1" },
  { value: "сменный", label: "Сменный" },
  { value: "гибкий", label: "Гибкий" },
] as const;

export const PUBLISHED_OPTIONS = [
  { value: 1, label: "За сутки" },
  { value: 3, label: "За 3 дня" },
  { value: 7, label: "За неделю" },
  { value: 30, label: "За месяц" },
] as const;

export const SOURCE_OPTIONS = (["VK", "TELEGRAM", "WEBSITE", "MANUAL", "EMPLOYER"] as const).map(
  (value) => ({ value, label: SOURCE_LABEL[value] }),
);

export const ROTATION_OPTIONS = [
  { value: "15/15", label: "15/15" },
  { value: "30/15", label: "30/15" },
  { value: "30/30", label: "30/30" },
  { value: "45/15", label: "45/15" },
  { value: "45/45", label: "45/45" },
  { value: "60/30", label: "60/30" },
] as const;

export const VAHTA_DAYS_OPTIONS = [
  { value: 15, label: "15 дней" },
  { value: 30, label: "30 дней" },
  { value: 45, label: "45 дней" },
  { value: 60, label: "60 дней" },
] as const;

export const SORT_OPTIONS: { value: VacancySort; label: string }[] = [
  { value: "date", label: "По дате" },
  { value: "salary_desc", label: "Сначала выше зарплата" },
  { value: "salary_asc", label: "Сначала ниже зарплата" },
  { value: "quality", label: "По полноте" },
];
