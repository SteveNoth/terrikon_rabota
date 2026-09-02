import type { ModerationStatus, WorkFormat } from "@prisma/client";

export type PolicyWorkFormat = "LOCAL" | "VAHTA" | "REMOTE";

export type ContactVerdictValue = "TRUSTED" | "BLOCKED" | null;

export type KeywordEntry = {
  id?: string;
  stem?: string;
  phrase?: string;
  pattern?: string;
  endings?: string[];
  requireEnding?: boolean;
  weight?: number;
  label?: string;
  requireNoPhone?: boolean;
};

export type PolicyFlag = {
  id: string;
  points: number;
  label: string;
  sample: string;
  detail: string;
  hard: boolean;
};

export type MarketRow = {
  median: number;
  sample: number;
};

export type ProfessionMarket = {
  LOCAL?: MarketRow;
  VAHTA?: MarketRow;
  REMOTE?: MarketRow;
  median?: number;
  sample?: number;
};

export type MarketSnapshot = {
  byProfession: Record<string, ProfessionMarket>;
};

export type PolicyVacancyInput = {
  title: string;
  description: string;
  professionSlug: string | null;
  sphere?: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: string | null;
  workFormat: PolicyWorkFormat | WorkFormat | string;
  citySlug: string;
  contactPhone: string | null;
  contactTelegram: string | null;
  contactEmail?: string | null;
  employerName?: string | null;
  employerId: string;
  userId: string;
  housingProvided?: boolean;
  rotationPattern?: string | null;
  vahtaDays?: number | null;
  workLocationText?: string | null;
};

export type PolicyContext = {
  /** Без области PUBLISH — отказ до словарей. */
  publishBlocked: boolean;
  contactVerdict: ContactVerdictValue;
  isVerified: boolean;
  market?: MarketSnapshot | null;
};

export type PolicyDecision = {
  moderationStatus: ModerationStatus;
  trustScore: number;
  trustFlags: PolicyFlag[];
  ruleIds: string[];
  publicMessage: string;
  /** Жёсткий флаг / СВО / чёрный список / стоп — в очередь кабинета не кладём. */
  goesToQueue: boolean;
  shouldBlacklistContact: boolean;
  highRisk: boolean;
  /** false, если остановились на блоке аккаунта или чёрном списке контакта. */
  usedDictionaries: boolean;
  hoursPerDay: number | null;
  monthlySalary: number | null;
};
