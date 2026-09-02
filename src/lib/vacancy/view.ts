import type { EmployerKind, EmploymentType, Experience, Source } from "@prisma/client";
import { formatDate } from "@/lib/format/date";
import { employerKindLabel, employmentLabel, experienceLabel } from "@/lib/format/labels";
import { formatMoney, salaryGrossNote } from "@/lib/format/money";
import { emailHref, formatPhone, phoneTelHref, telegramHref } from "@/lib/format/phone";
import { plural } from "@/lib/format/plural";
import { formatSource, openDataAttribution } from "@/lib/format/source";
import { cityName, districtName, isCitySlug } from "@/lib/geo";
import type { VacancyRecord } from "@/lib/repo/vacancies";
import { stripHtml, toParagraphs } from "@/lib/vacancy/sanitize";
import { employerVacanciesHref, vacancyApplyHref, vacancyPath } from "@/lib/vacancy/path";

/**
 * Единственный тип, который получают компоненты карточки (раздел 11.10).
 * Сборка вида из полей записи: канонический заголовок, сводка, зарплата,
 * разделы, признак «текст обработан автоматически», ссылка на оригинал.
 * `rawText` сюда попадает только как `originalText` — для блока
 * «Показать оригинал». Компонент описания это поле не получает.
 */
export type VacancyFact = {
  label: string;
  value: string;
};

export type VacancyDescriptionSections = {
  description: string | null;
  tasks: string[];
  requirements: string[];
  conditions: string[];
};

export type VacancyPhoneView = {
  telHref: string;
  readable: string;
  reversed: string;
};

export type VacancyVahtaView = {
  workLocation: string;
  hiringFrom: string;
  rotation: string | null;
  duration: string | null;
  housing: boolean;
  meals: boolean;
  travel: boolean;
  advance: boolean;
  whoHires: string | null;
};

export type VacancyDuplicateGroupView = {
  line: string;
  sources: string[];
};

export type VacancyView = {
  id: string;
  slug: string;
  href: string;
  title: string;
  summaryLine: string | null;
  /** 0–100 из правил нормализатора. Компоненты не считают полноту сами. */
  completeness: number;
  salary: string;
  /** «до вычета налога» / «на руки». 13 % не пересчитываем. */
  salaryGrossNote: string | null;
  employer: {
    slug: string;
    name: string;
    description: string | null;
    isVerified: boolean;
    logoUrl: string | null;
    vacanciesHref: string;
  } | null;
  source: Source;
  citySlug: string;
  cityName: string;
  districtName: string | null;
  isVahta: boolean;
  vahta: VacancyVahtaView | null;
  facts: VacancyFact[];
  publishedLabel: string;
  publishedIso: string;
  freshnessLabel: string | null;
  phone: VacancyPhoneView | null;
  telegramHref: string | null;
  telegramLabel: string | null;
  emailHref: string | null;
  emailLabel: string | null;
  /** Если есть — рисуем разделы. Если нет — `descriptionParagraphs`. */
  descriptionSections: VacancyDescriptionSections | null;
  descriptionParagraphs: string[];
  sourceLabel: string;
  originalHref: string | null;
  openDataAttribution: { label: string; href: string } | null;
  postedByEmployer: boolean;
  autoNormalized: boolean;
  /** Только для <details>. Компонент описания это поле не получает. */
  originalText: string | null;
  duplicateGroup: VacancyDuplicateGroupView | null;
  missingInfo: string[];
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  applyHref: string;
  /** Снята с публикации. Ссылку из откликов всё равно показываем. */
  isClosed: boolean;
  sphere: string;
  professionSlug: string | null;
  districtSlug: string | null;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => stripHtml(item).trim())
    .filter(Boolean);
}

function parseSections(value: VacancyRecord["descriptionSections"]): VacancyDescriptionSections | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const descriptionRaw = typeof record.description === "string" ? stripHtml(record.description).trim() : "";
  const tasks = asStringList(record.tasks);
  const requirements = asStringList(record.requirements);
  const conditions = asStringList(record.conditions);

  if (!descriptionRaw && tasks.length === 0 && requirements.length === 0 && conditions.length === 0) {
    return null;
  }

  return {
    description: descriptionRaw || null,
    tasks,
    requirements,
    conditions,
  };
}

function cityLabel(slug: string): string {
  return isCitySlug(slug) ? cityName(slug, "nom") : slug;
}

function hiringFromLabel(slug: string): string {
  return isCitySlug(slug) ? cityName(slug, "gen") : slug;
}

function isoDate(value: Date): string {
  return value.toISOString();
}

function durationLabel(days: number | null): string | null {
  if (days == null || days < 1) {
    return null;
  }
  return `${days} ${plural(days, "день", "дня", "дней")}`;
}

function hoursLabel(hours: number | null): string | null {
  if (hours == null || hours < 1) {
    return null;
  }
  return `${hours} ${plural(hours, "час", "часа", "часов")} в день`;
}

function buildFacts(record: VacancyRecord, isVahta: boolean): VacancyFact[] {
  const facts: VacancyFact[] = [];
  const schedule = isVahta ? null : record.schedule?.trim() || null;
  const experience = experienceLabel(record.experience as Experience | null);
  const employment = employmentLabel(record.employmentType as EmploymentType | null);
  const hours = hoursLabel(record.hoursPerDay);

  if (schedule) {
    facts.push({ label: "График", value: schedule });
  }
  if (experience) {
    facts.push({ label: "Опыт", value: experience });
  }
  if (employment) {
    facts.push({ label: "Занятость", value: employment });
  }
  if (hours) {
    facts.push({ label: "Рабочий день", value: hours });
  }
  return facts;
}

function buildMissing(record: VacancyRecord, isVahta: boolean): string[] {
  const missing: string[] = [];
  if (record.salaryFrom == null && record.salaryTo == null) {
    missing.push("зарплату");
  }
  if (isVahta) {
    if (!record.rotationPattern?.trim()) {
      missing.push("схему смен");
    }
  } else if (!record.schedule?.trim()) {
    missing.push("график");
  }
  if (!record.experience) {
    missing.push("опыт");
  }
  if (!record.employmentType) {
    missing.push("тип занятости");
  }
  if (!isVahta && !record.address?.trim()) {
    missing.push("точный адрес");
  }
  if (!record.contactPhone && !record.contactTelegram && !record.contactEmail) {
    missing.push("телефон или другой контакт");
  }
  if (!record.employer) {
    missing.push("название компании");
  }
  return missing;
}

function buildVahta(record: VacancyRecord): VacancyVahtaView | null {
  if (record.workFormat !== "VAHTA") {
    return null;
  }
  return {
    workLocation: record.workLocationText?.trim() || "",
    hiringFrom: hiringFromLabel(record.citySlug),
    rotation: record.rotationPattern?.trim() || null,
    duration: durationLabel(record.vahtaDays),
    housing: record.housingProvided,
    meals: record.mealsProvided,
    travel: record.travelPaid,
    advance: record.advancePayment,
    whoHires: employerKindLabel(record.employerKind as EmployerKind),
  };
}

function buildDuplicateGroup(record: VacancyRecord): VacancyDuplicateGroupView | null {
  const group = record.group;
  if (!group || group.postingsCount < 2) {
    return null;
  }
  const count = group.postingsCount;
  const groupsWord = plural(count, "группе", "группах", "группах");
  const firstSeen = formatDate(group.firstSeenAt);
  const sources = [
    ...new Set(
      group.vacancies
        .map((item) => formatSource(item.source as Source, item.sourceName))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  return {
    line: `Размещено в ${count} ${groupsWord}, впервые ${firstSeen}`,
    sources,
  };
}

function buildPhone(raw: string | null): VacancyPhoneView | null {
  if (!raw?.trim()) {
    return null;
  }
  const readable = formatPhone(raw);
  return {
    telHref: phoneTelHref(raw),
    readable,
    reversed: [...readable].reverse().join(""),
  };
}

export function toVacancyView(record: VacancyRecord): VacancyView {
  const isVahta = record.workFormat === "VAHTA";
  const postedByEmployer = record.source === "MANUAL" || record.source === "EMPLOYER";
  const descriptionSections = parseSections(record.descriptionSections);
  const descriptionParagraphs = descriptionSections
    ? []
    : toParagraphs(record.description || "");
  const telegram = telegramHref(record.contactTelegram);
  const email = emailHref(record.contactEmail);
  const telegramUser = record.contactTelegram?.trim().replace(/^@/, "") || null;

  return {
    id: record.id,
    slug: record.slug,
    href: vacancyPath(record.citySlug, record.slug),
    title: record.title,
    summaryLine: record.summaryLine?.trim() || null,
    completeness: record.completeness,
    salary: formatMoney(record),
    salaryGrossNote: salaryGrossNote(record.salaryIsGross),
    employer: record.employer
      ? {
          slug: record.employer.slug,
          name: record.employer.name,
          description: record.employer.description?.trim() || null,
          isVerified: record.employer.isVerified,
          logoUrl: record.employer.logoUrl,
          vacanciesHref: employerVacanciesHref(record.citySlug, record.employer.slug, isVahta),
        }
      : null,
    source: record.source as Source,
    citySlug: record.citySlug,
    cityName: cityLabel(record.citySlug),
    districtName: districtName(record.citySlug, record.districtSlug),
    isVahta,
    vahta: buildVahta(record),
    facts: buildFacts(record, isVahta),
    publishedLabel: formatDate(record.publishedAt),
    publishedIso: isoDate(record.publishedAt),
    freshnessLabel: `обновлено ${formatDate(record.lastSeenAt)}`,
    phone: buildPhone(record.contactPhone),
    telegramHref: telegram,
    telegramLabel: telegram && telegramUser ? `@${telegramUser}` : null,
    emailHref: email,
    emailLabel: email && record.contactEmail ? record.contactEmail.trim() : null,
    descriptionSections,
    descriptionParagraphs,
    sourceLabel: formatSource(record.source, record.sourceName),
    originalHref: record.sourceUrl?.trim() || null,
    openDataAttribution: openDataAttribution(record.source as Source),
    postedByEmployer,
    autoNormalized: !postedByEmployer,
    originalText: record.rawText?.trim() || null,
    duplicateGroup: buildDuplicateGroup(record),
    missingInfo: buildMissing(record, isVahta),
    address: isVahta ? null : record.address?.trim() || null,
    latitude: isVahta ? null : record.latitude,
    longitude: isVahta ? null : record.longitude,
    applyHref: vacancyApplyHref(record.id),
    isClosed: record.isActive === false,
    sphere: record.sphere,
    professionSlug: record.professionSlug,
    districtSlug: record.districtSlug,
  };
}

export function vacancyMetaTitle(view: VacancyView): string {
  const place = view.isVahta && view.vahta
    ? `вахта, ${view.vahta.workLocation}`
    : `работа в ${isCitySlug(view.citySlug) ? cityName(view.citySlug, "loc") : view.cityName}`;
  return `${view.title} — ${place}, ${view.salary} | Террикон Работа`;
}

export function vacancyMetaDescription(view: VacancyView): string {
  if (view.summaryLine) {
    return view.summaryLine;
  }
  if (view.isVahta && view.vahta) {
    return `${view.title}. Работа: ${view.vahta.workLocation}. Набор из ${view.vahta.hiringFrom}. ${view.salary}.`;
  }
  const district = view.districtName ? `, ${view.districtName}` : "";
  return `${view.title} — ${view.salary}. ${view.cityName}${district}.`;
}
