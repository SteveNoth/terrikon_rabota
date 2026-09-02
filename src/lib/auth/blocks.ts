/**
 * Блокировка аккаунта: три области, журнал + флаги на User.
 * Флаг без строки журнала и строка без флага — ошибка этапа. Меняем только здесь.
 *
 * assertCanApply один: офлайн-очередь и POST отклика (этап 21)
 * зовут его же. Иначе через месяц появятся два разных отказа.
 */

import { AccountBlockScope, ContactVerdictKind, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { REVIEWED_BY } from "@/lib/admin/constants";
import { touchSite } from "@/lib/admin/touch";
import { POLICY_PHRASES } from "@/lib/policy/messages";
import { contactKey } from "@/lib/parser/contact";

export const LOGIN_BLOCKED_MESSAGE = "Этот аккаунт заблокирован";

export const APPLY_BLOCKED_MESSAGE =
  "Отклик с этого аккаунта сейчас недоступен. Если это ошибка — напишите нам.";

export const PUBLISH_BLOCKED_MESSAGE = POLICY_PHRASES.publishBlocked;

export type BlockResult = { ok: true; message: string } | { ok: false; error: string };

export type ApplyCheck = { ok: true } | { ok: false; error: string };

export function isApplyAllowed(applyBlocked: boolean): boolean {
  return !applyBlocked;
}

export async function assertCanApply(userId: string): Promise<ApplyCheck> {
  if (!userId) {
    return { ok: false, error: APPLY_BLOCKED_MESSAGE };
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { applyBlocked: true },
  });
  if (!row || !isApplyAllowed(row.applyBlocked)) {
    return { ok: false, error: APPLY_BLOCKED_MESSAGE };
  }
  return { ok: true };
}

export async function userPublishBlocked(userId: string | undefined): Promise<boolean> {
  if (!userId) {
    return false;
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { publishBlocked: true },
  });
  return Boolean(row?.publishBlocked);
}

export async function activePublishNote(userId: string): Promise<string | null> {
  const row = await prisma.accountBlock.findFirst({
    where: { userId, scope: AccountBlockScope.PUBLISH, liftedAt: null },
    orderBy: { createdAt: "desc" },
    select: { publicNote: true },
  });
  return row?.publicNote ?? null;
}

function flagField(scope: AccountBlockScope): "publishBlocked" | "applyBlocked" | "loginBlocked" {
  if (scope === AccountBlockScope.PUBLISH) {
    return "publishBlocked";
  }
  if (scope === AccountBlockScope.APPLY) {
    return "applyBlocked";
  }
  return "loginBlocked";
}

async function upsertContactBlocked(contact: string, reason: string): Promise<void> {
  await prisma.contactVerdict.upsert({
    where: { contact },
    create: { contact, verdict: ContactVerdictKind.BLOCKED, reason, vacanciesCount: 1 },
    update: { verdict: ContactVerdictKind.BLOCKED, reason, decidedAt: new Date() },
  });
}

async function cascadePublish(userId: string): Promise<void> {
  const employer = await prisma.employer.findUnique({
    where: { userId },
    select: {
      id: true,
      phone: true,
      telegram: true,
      vacancies: { select: { id: true, citySlug: true, slug: true, contactPhone: true, contactTelegram: true } },
    },
  });
  if (!employer) {
    return;
  }
  const keys = new Set<string>();
  const companyKey = contactKey(employer.phone, employer.telegram);
  if (companyKey) {
    keys.add(companyKey);
  }
  for (const vacancy of employer.vacancies) {
    const key = contactKey(vacancy.contactPhone, vacancy.contactTelegram);
    if (key) {
      keys.add(key);
    }
  }
  await prisma.vacancy.updateMany({
    where: { employerId: employer.id, isActive: true },
    data: { isActive: false },
  });
  for (const key of keys) {
    await upsertContactBlocked(key, "каскад PUBLISH");
  }
  const cities = new Set(employer.vacancies.map((item) => item.citySlug));
  for (const city of cities) {
    await touchSite(city);
  }
}

export async function imposeAccountBlock(input: {
  userId: string;
  scope: AccountBlockScope;
  reason: string;
  publicNote: string;
  decidedBy?: string;
}): Promise<BlockResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, publishBlocked: true, applyBlocked: true, loginBlocked: true },
  });
  if (!user) {
    return { ok: false, error: "Аккаунт не найден." };
  }
  const field = flagField(input.scope);
  if (user[field]) {
    return { ok: true, message: "Этот блок уже стоит." };
  }
  const decidedBy = input.decidedBy || REVIEWED_BY;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.userId },
      data: { [field]: true },
    }),
    prisma.accountBlock.create({
      data: {
        userId: input.userId,
        scope: input.scope,
        reason: input.reason,
        publicNote: input.publicNote,
        decidedBy,
      },
    }),
  ]);
  if (input.scope === AccountBlockScope.PUBLISH) {
    await cascadePublish(input.userId);
  }
  return {
    ok: true,
    message:
      input.scope === AccountBlockScope.PUBLISH
        ? "Публикация аккаунта отключена. Вакансии сняты с сайта, контакты в чёрном списке."
        : input.scope === AccountBlockScope.APPLY
          ? "Отклики с этого аккаунта отключены."
          : "Вход с этого аккаунта отключён.",
  };
}

export async function liftAccountBlock(input: {
  userId: string;
  scope: AccountBlockScope;
  liftedBy?: string;
}): Promise<BlockResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, publishBlocked: true, applyBlocked: true, loginBlocked: true },
  });
  if (!user) {
    return { ok: false, error: "Аккаунт не найден." };
  }
  const field = flagField(input.scope);
  if (!user[field]) {
    return { ok: true, message: "Этого блока и так нет." };
  }
  const liftedBy = input.liftedBy || REVIEWED_BY;
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.userId },
      data: { [field]: false },
    }),
    prisma.accountBlock.updateMany({
      where: { userId: input.userId, scope: input.scope, liftedAt: null },
      data: { liftedAt: now, liftedBy },
    }),
  ]);
  return {
    ok: true,
    message:
      input.scope === AccountBlockScope.PUBLISH
        ? "Блок публикации снят. Контакты в чёрном списке сами не оживают — их белят отдельно."
        : "Блок снят.",
  };
}

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  citySlug: string;
  publishBlocked: boolean;
  applyBlocked: boolean;
  loginBlocked: boolean;
  employerId: string | null;
  employerName: string | null;
  createdAt: Date;
};

export async function listAdminUsers(filter: {
  role?: UserRole | "";
  email?: string;
  block?: AccountBlockScope | "";
}): Promise<AdminUserRow[]> {
  const where = {
    ...(filter.role ? { role: filter.role } : {}),
    ...(filter.email?.trim()
      ? { email: { contains: filter.email.trim().toLowerCase(), mode: "insensitive" as const } }
      : {}),
    ...(filter.block === AccountBlockScope.PUBLISH
      ? { publishBlocked: true }
      : filter.block === AccountBlockScope.APPLY
        ? { applyBlocked: true }
        : filter.block === AccountBlockScope.LOGIN
          ? { loginBlocked: true }
          : {}),
  };
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      citySlug: true,
      publishBlocked: true,
      applyBlocked: true,
      loginBlocked: true,
      createdAt: true,
      employer: { select: { id: true, name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    citySlug: row.citySlug,
    publishBlocked: row.publishBlocked,
    applyBlocked: row.applyBlocked,
    loginBlocked: row.loginBlocked,
    employerId: row.employer?.id ?? null,
    employerName: row.employer?.name ?? null,
    createdAt: row.createdAt,
  }));
}
