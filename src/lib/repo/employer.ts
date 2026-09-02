import { ApplicationStatus, ContactVerdictKind, EmployerKind, ModerationStatus, Prisma, Source, WorkFormat } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { clearMemoryCache } from "@/lib/adapters/cache";
import { prisma } from "@/lib/adapters/db";
import { storage } from "@/lib/adapters/storage";
import {
  FOREIGN_VACANCY_MESSAGE,
  MAX_ACTIVE_VACANCIES,
  MAX_ACTIVE_VACANCIES_MESSAGE,
} from "@/lib/auth/constants";
import {
  cityMustBeActive,
  cityMustBeKnown,
  companyProfileSchema,
  districtMustMatchCity,
  employerVacancySchema,
  firstZodMessage,
  professionMustBeKnown,
  sphereMustBeKnown,
  type EmployerVacancyInput,
} from "@/lib/auth/schemas";
import { applyVacancyGeocode } from "@/lib/geo/geocode";
import { formatPhone } from "@/lib/format/phone";
import { blockReasonForFlags, contactKey } from "@/lib/parser/contact";
import { contentHash } from "@/lib/parser/dedupe";
import { qualityScoreFrom } from "@/lib/parser/quality";
import { truncateDescription } from "@/lib/parser/schema";
import { uniqueSlug, vacancySlug } from "@/lib/parser/slug";
import { cityDisplayName } from "@/lib/geo";
import { userPublishBlocked } from "@/lib/auth/blocks";
import {
  evaluateEmployerVacancy,
  loadProfessionMarket,
  occupiesEmployerLimit,
  saveNoticeFor,
  type PolicyDecision,
  type PolicyVacancyInput,
} from "@/lib/policy";

export const ACTIVE_VACANCY_LIMIT = MAX_ACTIVE_VACANCIES;

export type EmployerCompany = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  citySlug: string;
  sphere: string;
  isVerified: boolean;
  logoUrl: string | null;
  phone: string | null;
  telegram: string | null;
  email: string | null;
  website: string | null;
};

export type EmployerVacancyRow = {
  id: string;
  slug: string;
  title: string;
  citySlug: string;
  cityName: string;
  isActive: boolean;
  moderationStatus: ModerationStatus;
  trustFlags: { id: string }[];
  viewsCount: number;
  publishedAt: Date;
  applicationsCount: number;
};

export type EmployerApplicationRow = {
  id: string;
  vacancyId: string;
  vacancyTitle: string;
  vacancySlug: string;
  citySlug: string;
  status: ApplicationStatus;
  message: string | null;
  createdAt: Date;
  applicantName: string;
  applicantEmail: string;
};

export type SaveResult =
  | { ok: true; id?: string; notice?: string; noticeKind?: "notice" | "review" | "error" }
  | { ok: false; error: string };

function flagIds(value: Prisma.JsonValue | null | undefined): { id: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: { id: string }[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item) && typeof (item as { id?: unknown }).id === "string") {
      out.push({ id: (item as { id: string }).id });
    }
  }
  return out;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function boolFromForm(form: FormData, name: string): boolean {
  return form.getAll(name).includes("on") || form.getAll(name).includes("true");
}

function formString(form: FormData, name: string): string {
  const raw = form.get(name);
  return typeof raw === "string" ? raw : "";
}

export async function getEmployerCompany(employerId: string): Promise<EmployerCompany | null> {
  const row = await prisma.employer.findUnique({ where: { id: employerId } });
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    citySlug: row.citySlug,
    sphere: row.sphere,
    isVerified: row.isVerified,
    logoUrl: row.logoUrl,
    phone: row.phone,
    telegram: row.telegram,
    email: row.email,
    website: row.website,
  };
}

export async function listEmployerVacancies(employerId: string): Promise<EmployerVacancyRow[]> {
  const rows = await prisma.vacancy.findMany({
    where: { employerId },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      citySlug: true,
      isActive: true,
      moderationStatus: true,
      trustFlags: true,
      viewsCount: true,
      publishedAt: true,
      _count: { select: { applications: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    citySlug: row.citySlug,
    cityName: cityDisplayName(row.citySlug),
    isActive: row.isActive,
    moderationStatus: row.moderationStatus,
    trustFlags: flagIds(row.trustFlags),
    viewsCount: row.viewsCount,
    publishedAt: row.publishedAt,
    applicationsCount: row._count.applications,
  }));
}

/** Лимит 20: хочет на сайт (isActive) и статус PENDING / AUTO_OK / APPROVED. BLOCKED и REJECTED слот не занимают. */
export async function countActiveVacancies(employerId: string, exceptId?: string): Promise<number> {
  return prisma.vacancy.count({
    where: {
      employerId,
      isActive: true,
      moderationStatus: {
        in: [ModerationStatus.PENDING, ModerationStatus.AUTO_OK, ModerationStatus.APPROVED],
      },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}

export async function getOwnVacancy(employerId: string, vacancyId: string) {
  const row = await prisma.vacancy.findUnique({ where: { id: vacancyId } });
  if (!row) {
    return { ok: false as const, error: "Вакансия не найдена." };
  }
  if (row.employerId !== employerId) {
    return { ok: false as const, error: FOREIGN_VACANCY_MESSAGE };
  }
  return { ok: true as const, vacancy: row };
}

export async function listEmployerApplications(employerId: string): Promise<EmployerApplicationRow[]> {
  const rows = await prisma.application.findMany({
    where: { vacancy: { employerId } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      vacancy: { select: { id: true, title: true, slug: true, citySlug: true } },
      user: { select: { name: true, email: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    vacancyId: row.vacancy.id,
    vacancyTitle: row.vacancy.title,
    vacancySlug: row.vacancy.slug,
    citySlug: row.vacancy.citySlug,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt,
    applicantName: row.user.name,
    applicantEmail: row.user.email,
  }));
}

function touchPublic(citySlug: string, slug?: string) {
  clearMemoryCache();
  try {
    revalidatePath(`/${citySlug}`);
    revalidatePath(`/${citySlug}/jobs`);
    revalidatePath(`/${citySlug}/vahta`);
    if (slug) {
      revalidatePath(`/${citySlug}/job/${slug}`);
    }
    revalidatePath("/employer/dashboard");
  } catch {
    // Вне запроса Next кэш страниц не сбросить.
  }
}

export async function saveCompanyProfile(employerId: string, form: FormData): Promise<SaveResult> {
  const parsed = companyProfileSchema.safeParse({
    name: formString(form, "name"),
    description: formString(form, "description"),
    citySlug: formString(form, "citySlug"),
    sphere: formString(form, "sphere"),
    phone: formString(form, "phone"),
    telegram: formString(form, "telegram"),
    email: formString(form, "email"),
    website: formString(form, "website"),
    logoUrl: formString(form, "logoUrl"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  const data = parsed.data;
  const cityError = cityMustBeKnown(data.citySlug);
  if (cityError) {
    return { ok: false, error: cityError };
  }
  const sphereError = sphereMustBeKnown(data.sphere);
  if (sphereError) {
    return { ok: false, error: sphereError };
  }

  await prisma.employer.update({
    where: { id: employerId },
    data: {
      name: data.name,
      description: emptyToNull(data.description),
      citySlug: data.citySlug,
      sphere: data.sphere,
      phone: data.phone ? formatPhone(data.phone) : null,
      telegram: emptyToNull(data.telegram),
      email: emptyToNull(data.email),
      website: emptyToNull(data.website),
      logoUrl: storage.publicUrl(emptyToNull(data.logoUrl)),
    },
  });
  touchPublic(data.citySlug);
  return { ok: true };
}

function employerCompleteness(input: {
  salaryFrom: number | null;
  salaryTo: number | null;
  schedule: string | null;
  rotationPattern: string | null;
  address: string | null;
  districtSlug: string | null;
  experience: string | null;
  employmentType: string | null;
  contactPhone: string | null;
  contactTelegram: string | null;
  contactEmail: string | null;
  description: string;
  employerName: string;
}): number {
  let score = 0;
  if (input.salaryFrom != null || input.salaryTo != null) {
    score += 18;
  }
  if (input.schedule || input.rotationPattern) {
    score += 10;
  }
  if (input.address || input.districtSlug) {
    score += 10;
  }
  if (input.experience) {
    score += 8;
  }
  if (input.employmentType) {
    score += 8;
  }
  if (input.contactPhone || input.contactTelegram || input.contactEmail) {
    score += 18;
  }
  if (input.description.length >= 40) {
    score += 10;
  }
  if (input.description.length >= 120) {
    score += 10;
  }
  if (input.employerName.trim()) {
    score += 8;
  }
  return Math.min(100, score);
}

function parseVacancyForm(form: FormData): { ok: true; data: EmployerVacancyInput } | { ok: false; error: string } {
  const parsed = employerVacancySchema.safeParse({
    title: formString(form, "title"),
    description: formString(form, "description"),
    citySlug: formString(form, "citySlug"),
    districtSlug: formString(form, "districtSlug"),
    address: formString(form, "address"),
    sphere: formString(form, "sphere"),
    professionSlug: formString(form, "professionSlug"),
    salaryFrom: formString(form, "salaryFrom"),
    salaryTo: formString(form, "salaryTo"),
    salaryPeriod: formString(form, "salaryPeriod") || "MONTH",
    workFormat: formString(form, "workFormat") || "LOCAL",
    workLocationText: formString(form, "workLocationText"),
    rotationPattern: formString(form, "rotationPattern"),
    vahtaDays: formString(form, "vahtaDays"),
    housingProvided: boolFromForm(form, "housingProvided"),
    mealsProvided: boolFromForm(form, "mealsProvided"),
    travelPaid: boolFromForm(form, "travelPaid"),
    schedule: formString(form, "schedule"),
    experience: formString(form, "experience"),
    employmentType: formString(form, "employmentType"),
    contactPhone: formString(form, "contactPhone"),
    contactTelegram: formString(form, "contactTelegram"),
    contactEmail: formString(form, "contactEmail"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  const cityError = cityMustBeActive(parsed.data.citySlug);
  if (cityError) {
    return { ok: false, error: cityError };
  }
  const districtError = districtMustMatchCity(parsed.data.citySlug, parsed.data.districtSlug);
  if (districtError) {
    return { ok: false, error: districtError };
  }
  const sphereError = sphereMustBeKnown(parsed.data.sphere);
  if (sphereError) {
    return { ok: false, error: sphereError };
  }
  const professionError = professionMustBeKnown(parsed.data.professionSlug);
  if (professionError) {
    return { ok: false, error: professionError };
  }
  if (!parsed.data.contactPhone && !parsed.data.contactTelegram && !parsed.data.contactEmail) {
    return { ok: false, error: "Укажите хотя бы один контакт: телефон, Telegram или почту" };
  }
  return { ok: true, data: parsed.data };
}

export type PolicyActor = {
  userId: string;
  publishBlocked?: boolean;
};

async function lookupContactVerdict(phone: string | null, telegram: string | null): Promise<ContactVerdictKind | null> {
  const key = contactKey(phone, telegram);
  if (!key) {
    return null;
  }
  const row = await prisma.contactVerdict.findUnique({ where: { contact: key } });
  return row?.verdict ?? null;
}

async function blacklistContact(phone: string | null, telegram: string | null, reason: string): Promise<void> {
  const key = contactKey(phone, telegram);
  if (!key) {
    return;
  }
  await prisma.contactVerdict.upsert({
    where: { contact: key },
    create: { contact: key, verdict: ContactVerdictKind.BLOCKED, reason, vacanciesCount: 1 },
    update: { verdict: ContactVerdictKind.BLOCKED, reason, decidedAt: new Date(), vacanciesCount: { increment: 1 } },
  });
}

function toPolicyInput(
  input: {
    title: string;
    description: string;
    professionSlug: string | null;
    sphere: string;
    salaryFrom: number | null;
    salaryTo: number | null;
    salaryPeriod: string;
    workFormat: WorkFormat | string;
    citySlug: string;
    contactPhone: string | null;
    contactTelegram: string | null;
    contactEmail: string | null;
    housingProvided: boolean;
    rotationPattern: string | null;
    vahtaDays: number | null;
    workLocationText: string | null;
  },
  company: EmployerCompany,
  employerId: string,
  userId: string,
): PolicyVacancyInput {
  return {
    title: input.title,
    description: input.description,
    professionSlug: input.professionSlug,
    sphere: input.sphere,
    salaryFrom: input.salaryFrom,
    salaryTo: input.salaryTo,
    salaryPeriod: input.salaryPeriod,
    workFormat: input.workFormat,
    citySlug: input.citySlug,
    contactPhone: input.contactPhone,
    contactTelegram: input.contactTelegram,
    contactEmail: input.contactEmail,
    employerName: company.name,
    employerId,
    userId,
    housingProvided: input.housingProvided,
    rotationPattern: input.rotationPattern,
    vahtaDays: input.vahtaDays,
    workLocationText: input.workLocationText,
  };
}

async function runCabinetPolicy(input: PolicyVacancyInput, company: EmployerCompany, exceptId: string | undefined, publishBlocked: boolean): Promise<PolicyDecision> {
  const [contactVerdict, market, blocked] = await Promise.all([
    lookupContactVerdict(input.contactPhone, input.contactTelegram),
    loadProfessionMarket(input.professionSlug, input.workFormat, exceptId),
    userPublishBlocked(input.userId),
  ]);
  return evaluateEmployerVacancy(input, {
    publishBlocked: Boolean(publishBlocked || blocked),
    contactVerdict,
    isVerified: company.isVerified,
    market,
  });
}

function noticeFrom(decision: PolicyDecision): { notice: string; noticeKind: "notice" | "review" | "error" } {
  const mapped = saveNoticeFor(decision.moderationStatus, decision.publicMessage);
  return { notice: mapped.text, noticeKind: mapped.kind };
}

/**
 * Дверь кабинета. Поля формы не перезаписываем разбором поста:
 * работодатель уже указал профессию, зарплату и формат. Политика только решает статус.
 */
export async function saveEmployerVacancy(
  employerId: string,
  form: FormData,
  existingId?: string,
  actor?: PolicyActor,
): Promise<SaveResult & { id?: string }> {
  const company = await getEmployerCompany(employerId);
  if (!company) {
    return { ok: false, error: "Сначала заполните профиль компании." };
  }
  if (!company.name.trim() || company.name.trim().length < 2) {
    return { ok: false, error: "Сначала укажите название компании в профиле." };
  }

  const parsed = parseVacancyForm(form);
  if (!parsed.ok) {
    return parsed;
  }
  const input = parsed.data;

  const existing = existingId
    ? await prisma.vacancy.findUnique({ where: { id: existingId } })
    : null;
  if (existingId) {
    if (!existing) {
      return { ok: false, error: "Вакансия не найдена." };
    }
    if (existing.employerId !== employerId) {
      return { ok: false, error: FOREIGN_VACANCY_MESSAGE };
    }
  }

  const description = truncateDescription(input.description);
  const contactPhone = input.contactPhone ? formatPhone(input.contactPhone) : null;
  const professionSlug = emptyToNull(input.professionSlug);
  const workFormat = input.workFormat as WorkFormat;
  const contactTelegram = emptyToNull(input.contactTelegram);
  const contactEmail = emptyToNull(input.contactEmail);
  const rotationPattern = workFormat === WorkFormat.VAHTA ? emptyToNull(input.rotationPattern) : null;
  const workLocationText = workFormat === WorkFormat.VAHTA ? emptyToNull(input.workLocationText) : null;
  const housingProvided = workFormat === WorkFormat.VAHTA ? input.housingProvided : false;

  const decision = await runCabinetPolicy(
    toPolicyInput(
      {
        title: input.title,
        description,
        professionSlug,
        sphere: input.sphere,
        salaryFrom: input.salaryFrom,
        salaryTo: input.salaryTo,
        salaryPeriod: input.salaryPeriod,
        workFormat,
        citySlug: input.citySlug,
        contactPhone,
        contactTelegram,
        contactEmail,
        housingProvided,
        rotationPattern,
        vahtaDays: workFormat === WorkFormat.VAHTA ? input.vahtaDays : null,
        workLocationText,
      },
      company,
      employerId,
      actor?.userId ?? "",
    ),
    company,
    existing?.id,
    Boolean(actor?.publishBlocked),
  );

  const wantsSlot = occupiesEmployerLimit(decision.moderationStatus, true);
  if (wantsSlot) {
    const active = await countActiveVacancies(employerId, existing?.id);
    if (active >= MAX_ACTIVE_VACANCIES) {
      return { ok: false, error: MAX_ACTIVE_VACANCIES_MESSAGE };
    }
  }

  if (decision.shouldBlacklistContact) {
    await blacklistContact(contactPhone, contactTelegram, blockReasonForFlags(decision.ruleIds));
  }

  const completeness = employerCompleteness({
    salaryFrom: input.salaryFrom,
    salaryTo: input.salaryTo,
    schedule: emptyToNull(input.schedule),
    rotationPattern,
    address: emptyToNull(input.address),
    districtSlug: emptyToNull(input.districtSlug),
    experience: emptyToNull(input.experience),
    employmentType: emptyToNull(input.employmentType),
    contactPhone,
    contactTelegram,
    contactEmail,
    description,
    employerName: company.name,
  });
  const qualityScore = qualityScoreFrom({
    completeness,
    hasSalary: input.salaryFrom != null || input.salaryTo != null,
    hasContact: Boolean(contactPhone || contactTelegram || contactEmail),
    descriptionLength: description.length,
  });
  const salaryText =
    input.salaryFrom != null || input.salaryTo != null
      ? [input.salaryFrom, input.salaryTo].filter((item) => item != null).join("–")
      : null;

  const shared = {
    title: input.title,
    titleOriginal: input.title,
    titleNormalized: input.title.toLocaleLowerCase("ru-RU"),
    description,
    summaryLine: description.slice(0, 180),
    completeness,
    normalizerVersion: "employer-1",
    salaryFrom: input.salaryFrom,
    salaryTo: input.salaryTo,
    salaryText,
    salaryPeriod: input.salaryPeriod,
    citySlug: input.citySlug,
    districtSlug: emptyToNull(input.districtSlug),
    address: emptyToNull(input.address),
    workFormat,
    workLocationText,
    rotationPattern,
    vahtaDays: workFormat === WorkFormat.VAHTA ? input.vahtaDays : null,
    housingProvided,
    mealsProvided: workFormat === WorkFormat.VAHTA ? input.mealsProvided : false,
    travelPaid: workFormat === WorkFormat.VAHTA ? input.travelPaid : false,
    employerKind: EmployerKind.DIRECT,
    sphere: input.sphere,
    professionSlug,
    schedule: workFormat === WorkFormat.VAHTA ? null : emptyToNull(input.schedule),
    contactPhone,
    contactTelegram,
    contactEmail,
    source: Source.EMPLOYER,
    sourceName: company.name,
    contentHash: contentHash(description, contactPhone),
    signature: [professionSlug || "unknown", workFormat, input.citySlug, contactPhone || "none", company.id].join("|"),
    qualityScore,
    trustScore: decision.trustScore,
    trustFlags: decision.trustFlags as Prisma.InputJsonValue,
    moderationStatus: decision.moderationStatus,
    hoursPerDay: decision.hoursPerDay != null ? Math.round(decision.hoursPerDay) : null,
    employerId,
    isActive: true,
    experience:
      input.experience === "NONE" ||
      input.experience === "UP_TO_1" ||
      input.experience === "FROM_1_TO_3" ||
      input.experience === "FROM_3"
        ? input.experience
        : null,
    employmentType:
      input.employmentType === "FULL" ||
      input.employmentType === "PART" ||
      input.employmentType === "SHIFT" ||
      input.employmentType === "TEMPORARY" ||
      input.employmentType === "REMOTE"
        ? input.employmentType
        : null,
  };

  const feedback = noticeFrom(decision);

  if (existing) {
    await prisma.vacancy.update({
      where: { id: existing.id },
      data: {
        ...shared,
        lastSeenAt: new Date(),
      },
    });
    if (shared.address && shared.address !== existing.address) {
      await applyVacancyGeocode(existing.id);
    }
    touchPublic(input.citySlug, existing.slug);
    return { ok: true, id: existing.id, ...feedback };
  }

  const taken = new Set((await prisma.vacancy.findMany({ select: { slug: true }, take: 8000 })).map((row) => row.slug));
  const externalId = `employer:${employerId}:${crypto.randomUUID()}`;
  const slug = uniqueSlug(
    vacancySlug({
      professionSlug,
      title: input.title,
      citySlug: input.citySlug,
      source: Source.EMPLOYER,
      externalId,
    }),
    taken,
  );
  const created = await prisma.vacancy.create({
    data: {
      ...shared,
      slug,
      rawText: description,
      sourcePostExternalId: externalId,
      externalId,
      publishedAt: new Date(),
      isActive: true,
    },
  });
  if (shared.address) {
    await applyVacancyGeocode(created.id);
  }
  touchPublic(input.citySlug, created.slug);
  return { ok: true, id: created.id, ...feedback };
}

export async function setVacancyActive(
  employerId: string,
  vacancyId: string,
  isActive: boolean,
  actor?: PolicyActor,
): Promise<SaveResult> {
  const found = await getOwnVacancy(employerId, vacancyId);
  if (!found.ok) {
    return found;
  }
  const company = await getEmployerCompany(employerId);
  if (!company) {
    return { ok: false, error: "Сначала заполните профиль компании." };
  }

  if (!isActive) {
    await prisma.vacancy.update({
      where: { id: vacancyId },
      data: { isActive: false, lastSeenAt: new Date() },
    });
    touchPublic(found.vacancy.citySlug, found.vacancy.slug);
    return { ok: true, notice: "Вакансия снята с публикации.", noticeKind: "notice" };
  }

  const row = found.vacancy;
  const decision = await runCabinetPolicy(
    toPolicyInput(
      {
        title: row.title,
        description: row.description,
        professionSlug: row.professionSlug,
        sphere: row.sphere,
        salaryFrom: row.salaryFrom,
        salaryTo: row.salaryTo,
        salaryPeriod: row.salaryPeriod,
        workFormat: row.workFormat,
        citySlug: row.citySlug,
        contactPhone: row.contactPhone,
        contactTelegram: row.contactTelegram,
        contactEmail: row.contactEmail,
        housingProvided: row.housingProvided,
        rotationPattern: row.rotationPattern,
        vahtaDays: row.vahtaDays,
        workLocationText: row.workLocationText,
      },
      company,
      employerId,
      actor?.userId ?? "",
    ),
    company,
    row.id,
    Boolean(actor?.publishBlocked),
  );

  if (occupiesEmployerLimit(decision.moderationStatus, true)) {
    const active = await countActiveVacancies(employerId, vacancyId);
    if (active >= MAX_ACTIVE_VACANCIES) {
      return { ok: false, error: MAX_ACTIVE_VACANCIES_MESSAGE };
    }
  }

  if (decision.shouldBlacklistContact) {
    await blacklistContact(row.contactPhone, row.contactTelegram, blockReasonForFlags(decision.ruleIds));
  }

  await prisma.vacancy.update({
    where: { id: vacancyId },
    data: {
      isActive: true,
      lastSeenAt: new Date(),
      moderationStatus: decision.moderationStatus,
      trustScore: decision.trustScore,
      trustFlags: decision.trustFlags as Prisma.InputJsonValue,
      hoursPerDay: decision.hoursPerDay != null ? Math.round(decision.hoursPerDay) : row.hoursPerDay,
    },
  });
  touchPublic(row.citySlug, row.slug);
  return { ok: true, ...noticeFrom(decision) };
}

export async function setApplicationStatus(
  employerId: string,
  applicationId: string,
  status: ApplicationStatus,
): Promise<SaveResult> {
  if (status !== "VIEWED" && status !== "INVITED" && status !== "REJECTED") {
    return { ok: false, error: "Можно поставить статус: просмотрен, приглашён или отказ." };
  }
  const row = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { vacancy: { select: { employerId: true } } },
  });
  if (!row || row.vacancy.employerId !== employerId) {
    return { ok: false, error: "Этот отклик вам не принадлежит." };
  }
  await prisma.application.update({
    where: { id: applicationId },
    data: { status },
  });
  return { ok: true };
}

export function vacancyToFormValues(row: {
  title: string;
  description: string;
  citySlug: string;
  districtSlug: string | null;
  address: string | null;
  sphere: string;
  professionSlug: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: string;
  workFormat: WorkFormat;
  workLocationText: string | null;
  rotationPattern: string | null;
  vahtaDays: number | null;
  housingProvided: boolean;
  mealsProvided: boolean;
  travelPaid: boolean;
  schedule: string | null;
  experience: string | null;
  employmentType: string | null;
  contactPhone: string | null;
  contactTelegram: string | null;
  contactEmail: string | null;
}): EmployerVacancyInput {
  return {
    title: row.title,
    description: row.description,
    citySlug: row.citySlug,
    districtSlug: row.districtSlug ?? "",
    address: row.address ?? "",
    sphere: row.sphere,
    professionSlug: row.professionSlug ?? "",
    salaryFrom: row.salaryFrom,
    salaryTo: row.salaryTo,
    salaryPeriod: (row.salaryPeriod as EmployerVacancyInput["salaryPeriod"]) || "MONTH",
    workFormat: row.workFormat,
    workLocationText: row.workLocationText ?? "",
    rotationPattern: row.rotationPattern ?? "",
    vahtaDays: row.vahtaDays,
    housingProvided: row.housingProvided,
    mealsProvided: row.mealsProvided,
    travelPaid: row.travelPaid,
    schedule: row.schedule ?? "",
    experience: (row.experience as EmployerVacancyInput["experience"]) || "",
    employmentType: (row.employmentType as EmployerVacancyInput["employmentType"]) || "",
    contactPhone: row.contactPhone ?? "",
    contactTelegram: row.contactTelegram ?? "",
    contactEmail: row.contactEmail ?? "",
  };
}
