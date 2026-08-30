import { z } from "zod";
import { MAX_BATCH_SIZE, MAX_DESCRIPTION_CHARS, MAX_IMAGE_URLS, MAX_STRING, MAX_URL } from "@/lib/parser/limits";

const SOURCES = ["VK", "TELEGRAM", "WEBSITE", "TRUDVSEM", "MANUAL", "EMPLOYER"] as const;
const WORK_FORMATS = ["LOCAL", "VAHTA", "REMOTE"] as const;
const SALARY_PERIODS = ["MONTH", "SHIFT", "HOUR", "PIECE"] as const;
const EXPERIENCE = ["NONE", "UP_TO_1", "FROM_1_TO_3", "FROM_3"] as const;
const EMPLOYMENT = ["FULL", "PART", "SHIFT", "TEMPORARY", "REMOTE"] as const;
const EMPLOYER_KIND = ["DIRECT", "AGENCY", "UNKNOWN"] as const;
const VERDICTS = ["accept", "maybe", "svo", "reject"] as const;
const MODERATION = ["AUTO_OK", "PENDING", "APPROVED", "REJECTED", "BLOCKED"] as const;

function optString(max = MAX_STRING) {
  return z.string().max(max).optional().nullable();
}

function optInt() {
  return z.number().int().optional().nullable();
}

function optBool() {
  return z.boolean().optional().nullable();
}

const TrustFlagSchema = z
  .object({
    id: z.string().min(1).max(80),
    points: z.number().int().optional(),
    label: z.string().max(200).optional(),
    sample: z.string().max(400).optional(),
    detail: z.string().max(500).optional(),
    hard: z.boolean().optional(),
  })
  .strict();

/**
 * Разделы карточки — структура, не свободный текст.
 * Лишние ключи (например `html`) отвергаем: иначе в карточку протечёт чужая разметка.
 */
export const DescriptionSectionsSchema = z
  .object({
    description: z.string().max(MAX_DESCRIPTION_CHARS).optional(),
    tasks: z.array(z.string().max(500)).max(40).optional(),
    requirements: z.array(z.string().max(500)).max(40).optional(),
    conditions: z.array(z.string().max(500)).max(40).optional(),
  })
  .strict();

const VacancyRecordSchema = z
  .object({
    rawText: z.string({
      required_error: "Нет поля rawText: оригинал подписи обязателен. Пустая строка допустима, если есть ocrText.",
      invalid_type_error: "rawText должен быть строкой. Пустая строка допустима, если есть ocrText.",
    }),
    ocrText: optString(20_000),
    imageUrls: z.array(z.string().url().max(MAX_URL)).max(MAX_IMAGE_URLS).optional().nullable(),
    splitIndex: z.number().int().min(0).max(20).optional().nullable(),
    sourcePostExternalId: optString(120),
    externalId: z.string().min(1).max(160),
    title: z.string().min(1).max(200),
    titleOriginal: optString(200),
    titleNormalized: optString(200),
    description: optString(20_000),
    descriptionSections: DescriptionSectionsSchema.optional().nullable(),
    summaryLine: optString(300),
    completeness: z.number().int().min(0).max(100).optional().nullable(),
    normalizerVersion: optString(40),
    ocrVersion: z.union([z.string().max(20), z.number().int()]).optional().nullable(),
    splitterVersion: z.union([z.string().max(20), z.number().int()]).optional().nullable(),
    needsAiReview: optBool(),
    needsHumanReview: optBool(),
    salaryFrom: optInt(),
    salaryTo: optInt(),
    salaryText: optString(80),
    salaryCurrency: optString(8),
    salaryPeriod: z.enum(SALARY_PERIODS).optional().nullable(),
    citySlug: optString(40),
    cityName: optString(80),
    districtSlug: optString(40),
    address: optString(200),
    workFormat: z.enum(WORK_FORMATS).optional().nullable(),
    workLocationText: optString(200),
    workCitySlug: optString(40),
    rotationPattern: optString(40),
    vahtaDays: optInt(),
    housingProvided: optBool(),
    mealsProvided: optBool(),
    travelPaid: optBool(),
    advancePayment: optBool(),
    employerKind: z.enum(EMPLOYER_KIND).optional().nullable(),
    sphere: optString(40),
    professionSlug: optString(80),
    schedule: optString(40),
    hoursPerDay: z.number().min(0).max(24).optional().nullable(),
    experience: z.enum(EXPERIENCE).optional().nullable(),
    employmentType: z.enum(EMPLOYMENT).optional().nullable(),
    contactPhone: optString(32),
    contactTelegram: optString(64),
    contactEmail: optString(120),
    source: z.enum(SOURCES),
    sourceName: optString(120),
    sourceUrl: optString(MAX_URL),
    salaryIsGross: optBool(),
    employerInn: optString(20),
    employerName: optString(200),
    contentHash: optString(64),
    signature: optString(200),
    qualityScore: z.number().int().min(0).max(100).optional().nullable(),
    trustScore: z.number().int().min(0).max(100).optional().nullable(),
    trustFlags: z.array(TrustFlagSchema).max(40).optional().nullable(),
    moderationStatus: z.enum(MODERATION).optional().nullable(),
    hard: optBool(),
    highRisk: optBool(),
    vacancyVerdict: z.enum(VERDICTS).optional().nullable(),
    svoVerdict: optString(20),
    reasons: z.array(z.string().max(200)).max(40).optional().nullable(),
    filterScore: optInt(),
    filterReasons: z.array(z.string().max(200)).max(40).optional().nullable(),
    publishedAt: z.string().datetime({ offset: true }).optional().nullable(),
    unitText: optString(20_000),
  })
  .superRefine((value, ctx) => {
    if (value.rawText.length === 0 && !(value.ocrText && value.ocrText.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rawText"],
        message:
          "Пустая подпись допустима только вместе с непустым ocrText: смысл был на картинке, оригинал подписи — пустая строка.",
      });
    }
  });

export type ParserVacancyInput = z.infer<typeof VacancyRecordSchema>;

export type ParserErrorItem = {
  index: number;
  externalId: string | null;
  reason: string;
};

export type ParsedEnvelope = {
  parser: string;
  startedAt: Date;
  items: unknown[];
};

const EnvelopeSchema = z.object({
  parser: z.string().min(1).max(80).optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
  vacancies: z.array(z.unknown()).max(MAX_BATCH_SIZE).optional(),
  items: z.array(z.unknown()).max(MAX_BATCH_SIZE).optional(),
});

export function parseEnvelope(raw: unknown): { ok: true; data: ParsedEnvelope } | { ok: false; reason: string } {
  if (Array.isArray(raw)) {
    if (raw.length > MAX_BATCH_SIZE) {
      return { ok: false, reason: `Пачка больше ${MAX_BATCH_SIZE} записей. Разбейте на несколько запросов.` };
    }
    return { ok: true, data: { parser: "unknown", startedAt: new Date(), items: raw } };
  }
  const parsed = EnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "Ожидался массив вакансий или объект { parser, vacancies }." };
  }
  const items = parsed.data.vacancies ?? parsed.data.items;
  if (!items) {
    return { ok: false, reason: "Ожидался массив вакансий или объект { parser, vacancies }." };
  }
  if (items.length > MAX_BATCH_SIZE) {
    return { ok: false, reason: `Пачка больше ${MAX_BATCH_SIZE} записей. Разбейте на несколько запросов.` };
  }
  return {
    ok: true,
    data: {
      parser: parsed.data.parser?.trim() || "unknown",
      startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date(),
      items,
    },
  };
}

export function parseVacancyRecord(
  raw: unknown,
  index: number,
): { ok: true; data: ParserVacancyInput } | { ok: false; error: ParserErrorItem } {
  const parsed = VacancyRecordSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const first = parsed.error.issues[0];
  const path = first?.path?.length ? first.path.join(".") : "запись";
  const message = first?.message ?? "Некорректная запись";
  const externalId =
    raw && typeof raw === "object" && "externalId" in raw && typeof raw.externalId === "string"
      ? raw.externalId
      : null;
  return {
    ok: false,
    error: {
      index,
      externalId,
      reason: `${path}: ${message}`,
    },
  };
}

export function isSvoRecord(input: ParserVacancyInput): boolean {
  if (input.vacancyVerdict === "svo") {
    return true;
  }
  if (input.svoVerdict === "reject") {
    return true;
  }
  const reasons = [...(input.reasons ?? []), ...(input.filterReasons ?? [])];
  return reasons.some((item) => item.toLowerCase().includes("svo"));
}

export function isMaybeRecord(input: ParserVacancyInput): boolean {
  return input.vacancyVerdict === "maybe";
}

export function sourcePostId(input: ParserVacancyInput): string {
  const raw = input.sourcePostExternalId?.trim();
  if (raw) {
    return raw;
  }
  const external = input.externalId;
  const hash = external.indexOf("#");
  return hash === -1 ? external : external.slice(0, hash);
}

export function asVersionString(value: string | number | null | undefined): string | null {
  if (value == null || value === "") {
    return null;
  }
  return String(value);
}

export function truncateDescription(text: string | null | undefined): string {
  const value = text ?? "";
  if (value.length <= MAX_DESCRIPTION_CHARS) {
    return value;
  }
  return value.slice(0, MAX_DESCRIPTION_CHARS);
}
