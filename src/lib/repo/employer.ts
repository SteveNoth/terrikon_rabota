import { ApplicationStatus, EmployerKind, Prisma, Source, WorkFormat } from "@prisma/client";
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
import { contentHash } from "@/lib/parser/dedupe";
import { qualityScoreFrom } from "@/lib/parser/quality";
import { truncateDescription } from "@/lib/parser/schema";
import { uniqueSlug, vacancySlug } from "@/lib/parser/slug";
import { cityDisplayName } from "@/lib/geo";

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

export type SaveResult = { ok: true } | { ok: false; error: string };

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
    viewsCount: row.viewsCount,
    publishedAt: row.publishedAt,
    applicationsCount: row._count.applications,
  }));
}

export async function countActiveVacancies(employerId: string, exceptId?: string): Promise<number> {
  return prisma.vacancy.count({
    where: {
      employerId,
      isActive: true,
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

export async function saveEmployerVacancy(
  employerId: string,
  form: FormData,
  existingId?: string,
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
  const completeness = employerCompleteness({
    salaryFrom: input.salaryFrom,
    salaryTo: input.salaryTo,
    schedule: emptyToNull(input.schedule),
    rotationPattern: emptyToNull(input.rotationPattern),
    address: emptyToNull(input.address),
    districtSlug: emptyToNull(input.districtSlug),
    experience: emptyToNull(input.experience),
    employmentType: emptyToNull(input.employmentType),
    contactPhone,
    contactTelegram: emptyToNull(input.contactTelegram),
    contactEmail: emptyToNull(input.contactEmail),
    description,
    employerName: company.name,
  });
  const qualityScore = qualityScoreFrom({
    completeness,
    hasSalary: input.salaryFrom != null || input.salaryTo != null,
    hasContact: Boolean(contactPhone || input.contactTelegram || input.contactEmail),
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
    workLocationText: workFormat === WorkFormat.VAHTA ? emptyToNull(input.workLocationText) : null,
    rotationPattern: workFormat === WorkFormat.VAHTA ? emptyToNull(input.rotationPattern) : null,
    vahtaDays: workFormat === WorkFormat.VAHTA ? input.vahtaDays : null,
    housingProvided: workFormat === WorkFormat.VAHTA ? input.housingProvided : false,
    mealsProvided: workFormat === WorkFormat.VAHTA ? input.mealsProvided : false,
    travelPaid: workFormat === WorkFormat.VAHTA ? input.travelPaid : false,
    employerKind: EmployerKind.DIRECT,
    sphere: input.sphere,
    professionSlug,
    schedule: workFormat === WorkFormat.VAHTA ? null : emptyToNull(input.schedule),
    contactPhone,
    contactTelegram: emptyToNull(input.contactTelegram),
    contactEmail: emptyToNull(input.contactEmail),
    source: Source.EMPLOYER,
    sourceName: company.name,
    contentHash: contentHash(description, contactPhone),
    signature: [professionSlug || "unknown", workFormat, input.citySlug, contactPhone || "none", company.id].join("|"),
    qualityScore,
    trustScore: 80,
    trustFlags: [] as Prisma.InputJsonValue,
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

  const data = shared;

  if (existing) {
    await prisma.vacancy.update({
      where: { id: existing.id },
      data: {
        ...data,
        lastSeenAt: new Date(),
      },
    });
    if (data.address && data.address !== existing.address) {
      await applyVacancyGeocode(existing.id);
    }
    touchPublic(input.citySlug, existing.slug);
    return { ok: true, id: existing.id };
  }

  const active = await countActiveVacancies(employerId);
  if (active >= MAX_ACTIVE_VACANCIES) {
    return { ok: false, error: MAX_ACTIVE_VACANCIES_MESSAGE };
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
      ...data,
      slug,
      rawText: description,
      sourcePostExternalId: externalId,
      externalId,
      publishedAt: new Date(),
      moderationStatus: "APPROVED",
      isActive: true,
    },
  });
  if (data.address) {
    await applyVacancyGeocode(created.id);
  }
  touchPublic(input.citySlug, created.slug);
  return { ok: true, id: created.id };
}

export async function setVacancyActive(
  employerId: string,
  vacancyId: string,
  isActive: boolean,
): Promise<SaveResult> {
  const found = await getOwnVacancy(employerId, vacancyId);
  if (!found.ok) {
    return found;
  }
  if (isActive) {
    const active = await countActiveVacancies(employerId, vacancyId);
    if (active >= MAX_ACTIVE_VACANCIES) {
      return { ok: false, error: MAX_ACTIVE_VACANCIES_MESSAGE };
    }
  }
  await prisma.vacancy.update({
    where: { id: vacancyId },
    data: { isActive, lastSeenAt: new Date() },
  });
  touchPublic(found.vacancy.citySlug, found.vacancy.slug);
  return { ok: true };
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
