import type { EmployerKind, EmploymentType, Experience } from "@prisma/client";

const EXPERIENCE_LABEL: Record<Experience, string> = {
  NONE: "без опыта",
  UP_TO_1: "до 1 года",
  FROM_1_TO_3: "1–3 года",
  FROM_3: "от 3 лет",
};

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL: "полная занятость",
  PART: "частичная занятость",
  SHIFT: "сменная занятость",
  TEMPORARY: "временная работа",
  REMOTE: "удалённо",
};

const EMPLOYER_KIND_LABEL: Record<EmployerKind, string | null> = {
  DIRECT: "напрямую от работодателя",
  AGENCY: "посредник",
  UNKNOWN: null,
};

export function experienceLabel(value: Experience | null | undefined): string | null {
  return value ? EXPERIENCE_LABEL[value] : null;
}

export function employmentLabel(value: EmploymentType | null | undefined): string | null {
  return value ? EMPLOYMENT_LABEL[value] : null;
}

export function employerKindLabel(value: EmployerKind | null | undefined): string | null {
  return value ? EMPLOYER_KIND_LABEL[value] : null;
}

export function workFormatAdminLabel(value: string | null | undefined): string {
  if (value === "VAHTA") {
    return "вахта";
  }
  if (value === "REMOTE") {
    return "удалённо";
  }
  return "местная";
}
