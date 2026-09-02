import { ApplicationStatus, EventType, ModerationStatus, Prisma } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/adapters/db";
import { CITY_COOKIE, cityDisplayName, getDefaultCity, isSelectableCity } from "@/lib/geo";
import { assertCanApply } from "@/lib/auth/blocks";
import {
  applyMessageSchema,
  cityMustBeKnown,
  firstZodMessage,
  seekerProfileSchema,
} from "@/lib/auth/schemas";
import { MODE_COOKIE, MODE_COOKIE_MAX_AGE, MODE_HEADER, isQualityMode, isQualityPreference } from "@/lib/quality/types";
import { repoError } from "@/lib/repo/errors";
import { APPLY_MESSAGE_MAX_CHARS, VACANCY_CLOSED_LABEL } from "@/lib/seeker/constants";
import { activeCitySlugs, filterSeekerCity, isListedSeekerCity } from "@/lib/seeker/city-filter";
import type { ApplyUiState } from "@/lib/seeker/labels";
import { generateTelegramLinkCode } from "@/lib/seeker/link-code";
import { formatPhone } from "@/lib/format/phone";
import { vacancyPath } from "@/lib/vacancy/path";
import { deviceClassFromUserAgent } from "@/lib/stats/device";
import { defaultQualityMode } from "@/lib/quality/server";
import { SESSION_COOKIE, isSessionHash } from "@/lib/stats/session";
import { log } from "@/lib/log";

export type SaveResult = { ok: true } | { ok: false; error: string };

export type ApplyResult =
  | { ok: true; applicationId: string; duplicate?: boolean }
  | { ok: false; error: string; code: "blocked" | "closed" | "not_found" | "invalid" };

export type SeekerProfile = {
  id: string;
  email: string;
  name: string;
  phone: string;
  citySlug: string;
  preferredMode: string;
  resumeText: string;
  resumeUrl: string;
  notifyTelegram: boolean;
  telegramLinkCode: string;
};

export type SeekerApplicationRow = {
  id: string;
  status: ApplicationStatus;
  message: string | null;
  createdAt: Date;
  vacancyId: string;
  vacancyTitle: string;
  vacancySlug: string;
  citySlug: string;
  cityName: string;
  href: string;
  closed: boolean;
};

export type SeekerFavoriteRow = {
  vacancyId: string;
  addedAt: Date;
  title: string;
  href: string;
  citySlug: string;
  cityName: string;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: string;
  salaryCurrency: string;
  closed: boolean;
};

export type ApplyVacancy = {
  id: string;
  title: string;
  slug: string;
  citySlug: string;
  href: string;
  closed: boolean;
};

function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

function formString(form: FormData, name: string): string {
  const raw = form.get(name);
  return typeof raw === "string" ? raw : "";
}

function formChecked(form: FormData, name: string): boolean {
  const raw = form.get(name);
  return raw === "on" || raw === "true" || raw === "1";
}

function approvedWhere(): Prisma.VacancyWhereInput {
  return { moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] } };
}

function publishedWhere(): Prisma.VacancyWhereInput {
  return { isActive: true, ...approvedWhere() };
}

function isClosedVacancy(row: { isActive: boolean; moderationStatus: ModerationStatus }): boolean {
  const listed =
    row.moderationStatus === ModerationStatus.AUTO_OK || row.moderationStatus === ModerationStatus.APPROVED;
  return !row.isActive || !listed;
}

async function ensureLinkCode(userId: string, existing: string | null): Promise<string> {
  if (existing) {
    return existing;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateTelegramLinkCode();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { telegramLinkCode: code },
      });
      return code;
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
        continue;
      }
      throw cause;
    }
  }
  throw repoError("выдать код привязки Telegram", new Error("не удалось подобрать уникальный код"));
}

export async function getSeekerProfile(userId: string): Promise<SeekerProfile | null> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        citySlug: true,
        preferredMode: true,
        resumeText: true,
        resumeUrl: true,
        notifyTelegram: true,
        telegramLinkCode: true,
      },
    });
    if (!row) {
      return null;
    }
    const telegramLinkCode = await ensureLinkCode(userId, row.telegramLinkCode);
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone ?? "",
      citySlug: row.citySlug,
      preferredMode: isQualityPreference(row.preferredMode) ? row.preferredMode : "lite",
      resumeText: row.resumeText ?? "",
      resumeUrl: row.resumeUrl ?? "",
      notifyTelegram: row.notifyTelegram,
      telegramLinkCode,
    };
  } catch (cause) {
    throw repoError("открыть профиль соискателя", cause);
  }
}

export async function saveSeekerProfile(userId: string, form: FormData): Promise<SaveResult> {
  const parsed = seekerProfileSchema.safeParse({
    name: formString(form, "name"),
    phone: formString(form, "phone"),
    citySlug: formString(form, "citySlug"),
    resumeText: formString(form, "resumeText"),
    resumeUrl: formString(form, "resumeUrl"),
    preferredMode: formString(form, "preferredMode") || "lite",
    notifyTelegram: formChecked(form, "notifyTelegram"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  const cityError = cityMustBeKnown(parsed.data.citySlug);
  if (cityError) {
    return { ok: false, error: cityError };
  }

  const phone = parsed.data.phone ? formatPhone(parsed.data.phone) || parsed.data.phone : null;

  try {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramLinkCode: true },
    });
    if (!current) {
      return { ok: false, error: "Аккаунт не найден." };
    }
    const telegramLinkCode = await ensureLinkCode(userId, current.telegramLinkCode);
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: parsed.data.name,
        phone,
        citySlug: parsed.data.citySlug,
        preferredMode: parsed.data.preferredMode,
        resumeText: parsed.data.resumeText || null,
        resumeUrl: parsed.data.resumeUrl || null,
        notifyTelegram: parsed.data.notifyTelegram,
        telegramLinkCode,
      },
    });
  } catch (cause) {
    throw repoError("сохранить профиль соискателя", cause);
  }

  const jar = await cookies();
  if (isSelectableCity(parsed.data.citySlug)) {
    jar.set(CITY_COOKIE, parsed.data.citySlug, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
      secure: cookieSecure(),
    });
  }
  jar.set(MODE_COOKIE, parsed.data.preferredMode, {
    path: "/",
    maxAge: MODE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: cookieSecure(),
  });

  return { ok: true };
}

export async function getApplicationForVacancy(
  userId: string,
  vacancyId: string,
): Promise<{ id: string; createdAt: Date; status: ApplicationStatus } | null> {
  const row = await prisma.application.findUnique({
    where: { userId_vacancyId: { userId, vacancyId } },
    select: { id: true, createdAt: true, status: true },
  });
  return row;
}

export async function getApplyVacancy(vacancyId: string): Promise<ApplyVacancy | null> {
  const row = await prisma.vacancy.findFirst({
    where: { id: vacancyId, ...approvedWhere() },
    select: { id: true, title: true, slug: true, citySlug: true, isActive: true, moderationStatus: true },
  });
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    citySlug: row.citySlug,
    href: vacancyPath(row.citySlug, row.slug),
    closed: isClosedVacancy(row),
  };
}

async function recordApplySent(input: {
  vacancyId: string;
  citySlug: string;
  districtSlug: string | null;
  sphere: string;
  professionSlug: string | null;
}): Promise<void> {
  const jar = await cookies();
  const sessionHash = jar.get(SESSION_COOKIE)?.value;
  if (!isSessionHash(sessionHash)) {
    return;
  }
  const existing = await prisma.event.findFirst({
    where: { type: EventType.APPLY_SENT, vacancyId: input.vacancyId, sessionHash },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  const headerList = await headers();
  const modeHeader = headerList.get(MODE_HEADER);
  await prisma.event.create({
    data: {
      type: EventType.APPLY_SENT,
      vacancyId: input.vacancyId,
      citySlug: input.citySlug,
      districtSlug: input.districtSlug,
      sphere: input.sphere,
      professionSlug: input.professionSlug,
      sessionHash,
      deviceClass: deviceClassFromUserAgent(headerList.get("user-agent")),
      qualityMode: isQualityMode(modeHeader) ? modeHeader : defaultQualityMode(),
    },
  });
}

export async function createApplication(
  userId: string,
  vacancyId: string,
  messageRaw: string,
): Promise<ApplyResult> {
  const allowed = await assertCanApply(userId);
  if (!allowed.ok) {
    return { ok: false, error: allowed.error, code: "blocked" };
  }

  const parsed = applyMessageSchema.safeParse({
    vacancyId,
    message: messageRaw.slice(0, APPLY_MESSAGE_MAX_CHARS + 1),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error), code: "invalid" };
  }

  const vacancy = await prisma.vacancy.findFirst({
    where: { id: parsed.data.vacancyId, ...publishedWhere() },
    select: {
      id: true,
      citySlug: true,
      districtSlug: true,
      sphere: true,
      professionSlug: true,
      isActive: true,
      moderationStatus: true,
    },
  });
  if (!vacancy) {
    const closed = await prisma.vacancy.findFirst({
      where: { id: parsed.data.vacancyId },
      select: { id: true, isActive: true, moderationStatus: true },
    });
    if (closed && isClosedVacancy(closed)) {
      return { ok: false, error: VACANCY_CLOSED_LABEL, code: "closed" };
    }
    return { ok: false, error: "Вакансия не найдена.", code: "not_found" };
  }

  const message = parsed.data.message || null;

  try {
    const created = await prisma.application.create({
      data: {
        userId,
        vacancyId: vacancy.id,
        message,
      },
      select: { id: true },
    });
    try {
      await recordApplySent({
        vacancyId: vacancy.id,
        citySlug: vacancy.citySlug,
        districtSlug: vacancy.districtSlug,
        sphere: vacancy.sphere,
        professionSlug: vacancy.professionSlug,
      });
    } catch (cause) {
      log.error("seeker", "не удалось записать событие отклика", cause);
    }
    return { ok: true, applicationId: created.id };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      const existing = await prisma.application.findUnique({
        where: { userId_vacancyId: { userId, vacancyId: vacancy.id } },
        select: { id: true },
      });
      return { ok: true, applicationId: existing?.id ?? "", duplicate: true };
    }
    throw repoError("отправить отклик", cause);
  }
}

export async function listSeekerApplications(
  userId: string,
  citySlug?: string | null,
): Promise<SeekerApplicationRow[]> {
  const rows = await prisma.application.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      vacancy: {
        select: {
          id: true,
          title: true,
          slug: true,
          citySlug: true,
          isActive: true,
          moderationStatus: true,
        },
      },
    },
  });
  const mapped: SeekerApplicationRow[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt,
    vacancyId: row.vacancy.id,
    vacancyTitle: row.vacancy.title,
    vacancySlug: row.vacancy.slug,
    citySlug: row.vacancy.citySlug,
    cityName: cityDisplayName(row.vacancy.citySlug),
    href: vacancyPath(row.vacancy.citySlug, row.vacancy.slug),
    closed: isClosedVacancy(row.vacancy),
  }));
  return filterSeekerCity(mapped, citySlug ?? null);
}

export async function listSeekerFavorites(
  userId: string,
  citySlug?: string | null,
): Promise<SeekerFavoriteRow[]> {
  const cities = activeCitySlugs();
  const rows = await prisma.favorite.findMany({
    where: {
      userId,
      vacancy: { citySlug: { in: cities } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      vacancy: {
        select: {
          id: true,
          title: true,
          slug: true,
          citySlug: true,
          isActive: true,
          moderationStatus: true,
          salaryFrom: true,
          salaryTo: true,
          salaryPeriod: true,
          salaryCurrency: true,
        },
      },
    },
  });
  const mapped: SeekerFavoriteRow[] = rows.map((row) => ({
    vacancyId: row.vacancy.id,
    addedAt: row.createdAt,
    title: row.vacancy.title,
    href: vacancyPath(row.vacancy.citySlug, row.vacancy.slug),
    citySlug: row.vacancy.citySlug,
    cityName: cityDisplayName(row.vacancy.citySlug),
    salaryFrom: row.vacancy.salaryFrom,
    salaryTo: row.vacancy.salaryTo,
    salaryPeriod: row.vacancy.salaryPeriod,
    salaryCurrency: row.vacancy.salaryCurrency,
    closed: isClosedVacancy(row.vacancy),
  }));
  return filterSeekerCity(mapped, citySlug ?? null);
}

export async function setFavorite(userId: string, vacancyId: string, add: boolean): Promise<SaveResult> {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId },
    select: { id: true, citySlug: true },
  });
  if (!vacancy) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  if (!isListedSeekerCity(vacancy.citySlug)) {
    return { ok: false, error: "Эту вакансию нельзя сохранить: город пока не активен." };
  }
  try {
    if (add) {
      await prisma.favorite.upsert({
        where: { userId_vacancyId: { userId, vacancyId: vacancy.id } },
        create: { userId, vacancyId: vacancy.id },
        update: {},
      });
    } else {
      await prisma.favorite.deleteMany({
        where: { userId, vacancyId: vacancy.id },
      });
    }
    return { ok: true };
  } catch (cause) {
    throw repoError("сохранить избранное", cause);
  }
}

export async function syncSeekerFavorites(
  userId: string,
  incoming: { vacancyId: string; addedAt?: number }[],
): Promise<SeekerFavoriteRow[]> {
  const ids = [...new Set(incoming.map((item) => item.vacancyId).filter((id) => id.length >= 8 && id.length <= 64))];
  if (ids.length > 0) {
    const vacancies = await prisma.vacancy.findMany({
      where: { id: { in: ids }, citySlug: { in: activeCitySlugs() } },
      select: { id: true },
    });
    const known = new Set(vacancies.map((item) => item.id));
    for (const id of ids) {
      if (!known.has(id)) {
        continue;
      }
      await prisma.favorite.upsert({
        where: { userId_vacancyId: { userId, vacancyId: id } },
        create: { userId, vacancyId: id },
        update: {},
      });
    }
  }
  return listSeekerFavorites(userId);
}

export async function getApplyUiState(userId: string | null, vacancyId: string): Promise<ApplyUiState> {
  if (!userId) {
    return { signedIn: false, appliedAt: null, blocked: false, blockedMessage: "" };
  }
  const [allowed, existing] = await Promise.all([
    assertCanApply(userId),
    getApplicationForVacancy(userId, vacancyId),
  ]);
  return {
    signedIn: true,
    appliedAt: existing?.createdAt ?? null,
    blocked: !allowed.ok,
    blockedMessage: allowed.ok ? "" : allowed.error,
  };
}

export function defaultSeekerCityCookie(cookieValue: string | undefined, profileCity: string): string {
  if (cookieValue && isListedSeekerCity(cookieValue)) {
    return cookieValue;
  }
  if (isListedSeekerCity(profileCity)) {
    return profileCity;
  }
  return getDefaultCity().slug;
}
