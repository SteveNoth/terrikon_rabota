import { AccountBlockScope, ContactVerdictKind, ModerationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { REVIEWED_BY } from "@/lib/admin/constants";
import {
  loadVacancy,
  publishVacancy,
  recordDecision,
  type DecisionResult,
} from "@/lib/admin/decisions";
import { setEmployerVerified } from "@/lib/admin/employers";
import { touchSite } from "@/lib/admin/touch";
import { imposeAccountBlock } from "@/lib/auth/blocks";
import { POLICY_PHRASES, assertPublicPhrase } from "@/lib/policy/messages";
import { contactKey } from "@/lib/parser/contact";

function asFlags(value: Prisma.JsonValue): Prisma.InputJsonValue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as Prisma.InputJsonValue[];
}

function withFlag(flags: Prisma.JsonValue, extra: { id: string; label: string }): Prisma.InputJsonValue {
  const next = asFlags(flags).filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return true;
    }
    return (item as { id?: string }).id !== extra.id;
  });
  next.push({
    id: extra.id,
    points: 0,
    label: extra.label,
    sample: "",
    detail: "",
    hard: extra.id === "admin_forbidden",
  });
  return next;
}

export async function publishCabinetVacancy(
  id: string,
  options: { trustContact?: boolean; verifyCompany?: boolean } = {},
): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  if (row.source !== "EMPLOYER") {
    return { ok: false, error: "Это не карточка кабинета." };
  }
  const published = await publishVacancy(id, Boolean(options.trustContact));
  if (!published.ok) {
    return published;
  }
  if (options.verifyCompany && row.employerId) {
    const verified = await setEmployerVerified(row.employerId, true);
    if (!verified.ok) {
      return verified;
    }
    await recordDecision({
      vacancyId: id,
      decision: "PUBLISH_VERIFY",
      flags: row.trustFlags,
    });
    return {
      ok: true,
      message: "Опубликовано. Компания отмечена как проверенная.",
    };
  }
  return published;
}

export async function rejectCabinetVacancy(id: string, note?: string): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  if (row.source !== "EMPLOYER") {
    return { ok: false, error: "Это не карточка кабинета." };
  }
  const trimmed = (note ?? "").trim().slice(0, 280);
  const publicNote = trimmed ? assertPublicPhrase(trimmed) : POLICY_PHRASES.unpublished;
  const flags = withFlag(row.trustFlags, { id: "admin_reject", label: publicNote });
  await prisma.vacancy.update({
    where: { id },
    data: {
      moderationStatus: ModerationStatus.REJECTED,
      isActive: false,
      needsHumanReview: false,
      reviewedAt: new Date(),
      reviewedBy: REVIEWED_BY,
      trustFlags: flags,
    },
  });
  await recordDecision({
    vacancyId: id,
    decision: "REJECT_CABINET",
    flags: flags as Prisma.JsonValue,
    comment: trimmed || null,
  });
  await touchSite(row.citySlug, row.slug);
  return { ok: true, message: "Отклонено. На сайте нет, в кабинете — фраза без обвинения." };
}

export async function markForbiddenText(id: string): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  if (row.source !== "EMPLOYER") {
    return { ok: false, error: "Это не карточка кабинета." };
  }
  const flags = withFlag(row.trustFlags, { id: "admin_forbidden", label: POLICY_PHRASES.forbiddenText });
  await prisma.vacancy.update({
    where: { id },
    data: {
      moderationStatus: ModerationStatus.BLOCKED,
      isActive: false,
      needsHumanReview: false,
      reviewedAt: new Date(),
      reviewedBy: REVIEWED_BY,
      trustFlags: flags,
    },
  });
  const key = contactKey(row.contactPhone, row.contactTelegram);
  if (key) {
    await prisma.contactVerdict.upsert({
      where: { contact: key },
      create: { contact: key, verdict: ContactVerdictKind.BLOCKED, reason: "запрещённый текст", vacanciesCount: 1 },
      update: { verdict: ContactVerdictKind.BLOCKED, reason: "запрещённый текст", decidedAt: new Date() },
    });
  }
  await recordDecision({ vacancyId: id, decision: "FORBIDDEN_TEXT", flags: flags as Prisma.JsonValue });
  await touchSite(row.citySlug, row.slug);
  return {
    ok: true,
    message: key
      ? "В блок. Контакт в чёрном списке. В кабинете — «такой текст мы не публикуем»."
      : "В блок. Контакта не было — в чёрный список класть нечего.",
  };
}

export async function disableEmployerPublish(id: string): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  const userId = row.employer?.userId;
  if (!userId) {
    return { ok: false, error: "У этой карточки нет аккаунта работодателя." };
  }
  const blocked = await imposeAccountBlock({
    userId,
    scope: AccountBlockScope.PUBLISH,
    reason: "очередь кабинета: отключить публикацию",
    publicNote: POLICY_PHRASES.publishBlocked,
  });
  if (!blocked.ok) {
    return blocked;
  }
  await recordDecision({
    vacancyId: id,
    decision: "DISABLE_PUBLISH",
    flags: row.trustFlags,
  });
  await touchSite(row.citySlug, row.slug);
  return { ok: true, message: blocked.message };
}
