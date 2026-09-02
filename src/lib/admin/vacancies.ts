import {
  EmployerKind,
  ModerationStatus,
  Prisma,
  SalaryPeriod,
  Source,
  WorkFormat,
} from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { cityDisplayName, getCity, isActiveCity, publishOnlyActiveMessage } from "@/lib/geo";
import { applyVacancyGeocode } from "@/lib/geo/geocode";
import { contentHash } from "@/lib/parser/dedupe";
import { uniqueSlug, vacancySlug } from "@/lib/parser/slug";
import { truncateDescription } from "@/lib/parser/schema";
import { qualityScoreFrom } from "@/lib/parser/quality";
import { sectionsFromForm, sectionsPayload } from "@/lib/admin/sections";
import { REVIEWED_BY } from "@/lib/admin/constants";
import { touchSite } from "@/lib/admin/decisions";

export { publishOnlyActiveMessage };

export type AdminVacancyListItem = {
  id: string;
  slug: string;
  title: string;
  citySlug: string;
  cityName: string;
  sphere: string;
  source: Source;
  sourceName: string | null;
  moderationStatus: ModerationStatus;
  isActive: boolean;
  publishedAt: Date;
  reportCount: number;
  salaryIsGross: boolean | null;
  employerInn: string | null;
};

export type AdminVacancyFilters = {
  city?: string;
  status?: string;
  source?: string;
  sphere?: string;
  q?: string;
  from?: string;
  to?: string;
  hasReports?: boolean;
  page?: number;
};

function parseEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value) {
    return undefined;
  }
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function boolFromForm(form: FormData, name: string): boolean {
  return form.getAll(name).includes("on") || form.getAll(name).includes("true");
}

function intOrNull(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function strOrNull(raw: FormDataEntryValue | null, max = 400): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim();
  return value ? value.slice(0, max) : null;
}

function dateOrNull(raw: string | undefined): Date | undefined {
  if (!raw) {
    return undefined;
  }
  const date = new Date(`${raw}T00:00:00+03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function listAdminVacancies(filters: AdminVacancyFilters): Promise<{
  items: AdminVacancyListItem[];
  total: number;
  page: number;
  pages: number;
  soonEmpty: boolean;
  soonName: string | null;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = 40;
  const city = filters.city?.trim();
  if (city) {
    const geo = getCity(city);
    if (geo?.status === "soon") {
      return { items: [], total: 0, page: 1, pages: 1, soonEmpty: true, soonName: geo.name.nom };
    }
  }

  const where: Prisma.VacancyWhereInput = {};
  if (city) {
    where.citySlug = city;
  }
  const status = parseEnum(filters.status, ["AUTO_OK", "PENDING", "APPROVED", "REJECTED", "BLOCKED"] as const);
  if (status) {
    where.moderationStatus = status;
  }
  const source = parseEnum(filters.source, ["VK", "TELEGRAM", "WEBSITE", "TRUDVSEM", "MANUAL", "EMPLOYER"] as const);
  if (source) {
    where.source = source;
  }
  if (filters.sphere) {
    where.sphere = filters.sphere;
  }
  if (filters.hasReports) {
    where.reports = { some: { status: "NEW" } };
  }
  const from = dateOrNull(filters.from);
  const to = dateOrNull(filters.to);
  if (from || to) {
    where.publishedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: new Date(to.getTime() + 86_400_000) } : {}),
    };
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { contactPhone: { contains: q } },
      { employerInn: { contains: q } },
      { sourceName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.vacancy.count({ where }),
    prisma.vacancy.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        title: true,
        citySlug: true,
        sphere: true,
        source: true,
        sourceName: true,
        moderationStatus: true,
        isActive: true,
        publishedAt: true,
        salaryIsGross: true,
        employerInn: true,
        _count: { select: { reports: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      citySlug: row.citySlug,
      cityName: cityDisplayName(row.citySlug),
      sphere: row.sphere,
      source: row.source,
      sourceName: row.sourceName,
      moderationStatus: row.moderationStatus,
      isActive: row.isActive,
      publishedAt: row.publishedAt,
      reportCount: row._count.reports,
      salaryIsGross: row.salaryIsGross,
      employerInn: row.employerInn,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    soonEmpty: false,
    soonName: null,
  };
}

export async function getAdminVacancy(id: string) {
  return prisma.vacancy.findUnique({
    where: { id },
    include: {
      employer: { select: { name: true, slug: true } },
      _count: { select: { reports: true } },
    },
  });
}

function readSalaryIsGross(form: FormData, source: Source, existing: boolean | null): boolean | null {
  const raw = form.get("salaryIsGross");
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  if (raw === "unknown") {
    return source === Source.TRUDVSEM ? true : null;
  }
  if (source === Source.TRUDVSEM) {
    return existing ?? true;
  }
  return existing;
}

export type VacancyFormResult = { ok: true; id: string; slug: string } | { ok: false; error: string };

export async function saveVacancyFromForm(form: FormData, existingId?: string): Promise<VacancyFormResult> {
  const title = strOrNull(form.get("title"), 200);
  if (!title) {
    return { ok: false, error: "Нужно название." };
  }
  const citySlug = strOrNull(form.get("citySlug"), 40);
  if (!citySlug) {
    return { ok: false, error: "Нужен город." };
  }
  if (!isActiveCity(citySlug)) {
    return { ok: false, error: publishOnlyActiveMessage() };
  }

  const existing = existingId
    ? await prisma.vacancy.findUnique({ where: { id: existingId } })
    : null;
  if (existingId && !existing) {
    return { ok: false, error: "Вакансия не найдена." };
  }

  const source = parseEnum(String(form.get("source") ?? existing?.source ?? "MANUAL"), [
    "VK",
    "TELEGRAM",
    "WEBSITE",
    "TRUDVSEM",
    "MANUAL",
    "EMPLOYER",
  ] as const) ?? Source.MANUAL;
  const workFormat =
    parseEnum(String(form.get("workFormat") ?? existing?.workFormat ?? "LOCAL"), ["LOCAL", "VAHTA", "REMOTE"] as const) ??
    WorkFormat.LOCAL;
  const description = truncateDescription(strOrNull(form.get("description"), 20_000) ?? existing?.description ?? title);
  const contactPhone = strOrNull(form.get("contactPhone"), 32);
  const sections = sectionsFromForm(form);
  const completeness = intOrNull(form.get("completeness")) ?? existing?.completeness ?? 0;
  const salaryFrom = intOrNull(form.get("salaryFrom"));
  const salaryTo = intOrNull(form.get("salaryTo"));
  const salaryIsGross = readSalaryIsGross(form, source, existing?.salaryIsGross ?? null);
  const hash = contentHash(existing?.rawText || description, contactPhone);
  const signature =
    existing?.signature ||
    [strOrNull(form.get("professionSlug"), 80) || "unknown", workFormat, citySlug, contactPhone || "none", ""].join("|");
  const qualityScore = qualityScoreFrom({
    completeness,
    hasSalary: salaryFrom != null || salaryTo != null,
    hasContact: Boolean(contactPhone || strOrNull(form.get("contactTelegram")) || strOrNull(form.get("contactEmail"))),
    descriptionLength: description.length,
  });

  const status =
    parseEnum(String(form.get("moderationStatus") ?? existing?.moderationStatus ?? "APPROVED"), [
      "AUTO_OK",
      "PENDING",
      "APPROVED",
      "REJECTED",
      "BLOCKED",
    ] as const) ?? ModerationStatus.APPROVED;

  const data = {
    title,
    titleOriginal: strOrNull(form.get("titleOriginal"), 200) ?? existing?.titleOriginal ?? title,
    titleNormalized: title.toLocaleLowerCase("ru-RU"),
    description,
    descriptionSections: sectionsPayload(sections) ?? Prisma.JsonNull,
    summaryLine: strOrNull(form.get("summaryLine"), 300),
    completeness,
    normalizerVersion: existing?.normalizerVersion || "1",
    salaryFrom,
    salaryTo,
    salaryText: strOrNull(form.get("salaryText"), 80),
    salaryCurrency: strOrNull(form.get("salaryCurrency"), 8) || "RUB",
    salaryPeriod:
      parseEnum(String(form.get("salaryPeriod") ?? "MONTH"), ["MONTH", "SHIFT", "HOUR", "PIECE"] as const) ??
      SalaryPeriod.MONTH,
    citySlug,
    districtSlug: strOrNull(form.get("districtSlug"), 40),
    address: strOrNull(form.get("address"), 200),
    workFormat,
    workLocationText: strOrNull(form.get("workLocationText"), 200),
    workCitySlug: strOrNull(form.get("workCitySlug"), 40),
    rotationPattern: strOrNull(form.get("rotationPattern"), 40),
    vahtaDays: intOrNull(form.get("vahtaDays")),
    housingProvided: boolFromForm(form, "housingProvided"),
    mealsProvided: boolFromForm(form, "mealsProvided"),
    travelPaid: boolFromForm(form, "travelPaid"),
    advancePayment: boolFromForm(form, "advancePayment"),
    employerKind:
      parseEnum(String(form.get("employerKind") ?? "UNKNOWN"), ["DIRECT", "AGENCY", "UNKNOWN"] as const) ??
      EmployerKind.UNKNOWN,
    sphere: strOrNull(form.get("sphere"), 40) || existing?.sphere || "unknown",
    professionSlug: strOrNull(form.get("professionSlug"), 80),
    schedule: workFormat === WorkFormat.VAHTA ? null : strOrNull(form.get("schedule"), 40),
    hoursPerDay: intOrNull(form.get("hoursPerDay")),
    experience: parseEnum(String(form.get("experience") ?? ""), ["NONE", "UP_TO_1", "FROM_1_TO_3", "FROM_3"] as const) ?? null,
    employmentType:
      parseEnum(String(form.get("employmentType") ?? ""), ["FULL", "PART", "SHIFT", "TEMPORARY", "REMOTE"] as const) ??
      null,
    contactPhone,
    contactTelegram: strOrNull(form.get("contactTelegram"), 64),
    contactEmail: strOrNull(form.get("contactEmail"), 120),
    source,
    sourceName: strOrNull(form.get("sourceName"), 120),
    sourceUrl: strOrNull(form.get("sourceUrl"), 2000),
    salaryIsGross,
    employerInn: strOrNull(form.get("employerInn"), 20)?.replace(/\D/g, "") || null,
    contentHash: hash,
    signature,
    qualityScore,
    moderationStatus: status,
    isActive: boolFromForm(form, "isActive") && status !== ModerationStatus.BLOCKED && status !== ModerationStatus.REJECTED && status !== ModerationStatus.PENDING,
    needsHumanReview: boolFromForm(form, "needsHumanReview"),
  };

  if (existing) {
    const wasGross = existing.salaryIsGross;
    await prisma.vacancy.update({
      where: { id: existing.id },
      data: {
        ...data,
        salaryIsGross: data.salaryIsGross === null && wasGross != null ? wasGross : data.salaryIsGross,
        reviewedAt: new Date(),
        reviewedBy: REVIEWED_BY,
      },
    });
    if (data.address && data.address !== existing.address) {
      await applyVacancyGeocode(existing.id);
    }
    await touchSite(citySlug, existing.slug);
    return { ok: true, id: existing.id, slug: existing.slug };
  }

  const taken = new Set((await prisma.vacancy.findMany({ select: { slug: true }, take: 5000 })).map((row) => row.slug));
  const externalId = strOrNull(form.get("externalId"), 160) || `manual-${Date.now()}`;
  const slug = uniqueSlug(
    vacancySlug({
      professionSlug: data.professionSlug,
      title,
      citySlug,
      source,
      externalId,
    }),
    taken,
  );
  const created = await prisma.vacancy.create({
    data: {
      ...data,
      slug,
      rawText: strOrNull(form.get("rawText"), 20_000) || title,
      sourcePostExternalId: externalId,
      externalId,
      publishedAt: new Date(),
      descriptionSections: sectionsPayload(sections),
      moderationStatus: ModerationStatus.APPROVED,
      isActive: true,
      reviewedAt: new Date(),
      reviewedBy: REVIEWED_BY,
    },
  });
  if (data.address) {
    await applyVacancyGeocode(created.id);
  }
  await touchSite(citySlug, created.slug);
  return { ok: true, id: created.id, slug: created.slug };
}

export async function bulkVacancies(
  ids: string[],
  action: "activate" | "deactivate" | "delete",
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, error: "Ничего не выбрано." };
  }
  if (action === "delete") {
    const result = await prisma.vacancy.deleteMany({ where: { id: { in: unique } } });
    clearCaches();
    return { ok: true, count: result.count };
  }
  const result = await prisma.vacancy.updateMany({
    where: { id: { in: unique } },
    data: { isActive: action === "activate" },
  });
  clearCaches();
  return { ok: true, count: result.count };
}

function clearCaches() {
  void touchSite("gorlovka");
}
