import { ContactVerdictKind, ModerationStatus, Prisma, ReportStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { clearMemoryCache } from "@/lib/adapters/cache";
import { prisma } from "@/lib/adapters/db";
import { AUTO_PUBLISH_SCORE, REVIEWED_BY } from "@/lib/admin/constants";
import { addFraudPhrase, addStopWord } from "@/lib/admin/dictionaries";
import { parseTrustFlags } from "@/lib/admin/flags";
import { contactKey } from "@/lib/parser/contact";

export type DecisionCode =
  | "PUBLISH"
  | "PUBLISH_TRUST"
  | "FRAUD"
  | "NOT_VACANCY"
  | "MERGE_DUPLICATE"
  | "APPROVE_GROUP"
  | "UNBLOCK_TO_QUEUE"
  | "HIDE"
  | "DISMISS_REPORT";

export type DecisionResult = {
  ok: true;
  message: string;
  dictWarning?: string;
} | {
  ok: false;
  error: string;
};

function jsonFlags(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function touchSite(citySlug: string, slug?: string) {
  clearMemoryCache();
  try {
    revalidatePath(`/${citySlug}`);
    revalidatePath(`/${citySlug}/jobs`);
    revalidatePath(`/${citySlug}/vahta`);
    if (slug) {
      revalidatePath(`/${citySlug}/job/${slug}`);
    }
    revalidatePath("/admin");
    revalidatePath("/admin/queue");
  } catch {
    // Вне запроса Next (скрипты проверки) кэш страниц не сбросить — решение в базе уже есть.
  }
}

async function recordDecision(input: {
  vacancyId: string;
  decision: DecisionCode;
  flags: Prisma.JsonValue;
  comment?: string | null;
}) {
  await prisma.moderationDecision.create({
    data: {
      vacancyId: input.vacancyId,
      decision: input.decision,
      triggeredRules: jsonFlags(input.flags),
      comment: input.comment ?? null,
      decidedAt: new Date(),
    },
  });
}

async function loadVacancy(id: string) {
  return prisma.vacancy.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      citySlug: true,
      title: true,
      rawText: true,
      trustFlags: true,
      trustScore: true,
      contactPhone: true,
      contactTelegram: true,
      groupId: true,
      moderationStatus: true,
      isActive: true,
    },
  });
}

async function publishOne(id: string) {
  const now = new Date();
  await prisma.vacancy.update({
    where: { id },
    data: {
      moderationStatus: ModerationStatus.APPROVED,
      isActive: true,
      needsHumanReview: false,
      reviewedAt: now,
      reviewedBy: REVIEWED_BY,
    },
  });
  await prisma.report.updateMany({
    where: { vacancyId: id, status: ReportStatus.NEW, reason: "fraud" },
    data: { status: ReportStatus.REVIEWED },
  });
}

async function upsertContact(contact: string, verdict: ContactVerdictKind, reason: string) {
  await prisma.contactVerdict.upsert({
    where: { contact },
    create: { contact, verdict, reason, vacanciesCount: 1 },
    update: { verdict, reason, vacanciesCount: { increment: 1 } },
  });
}

export async function publishVacancy(id: string, trustContact: boolean): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  await publishOne(id);
  const key = contactKey(row.contactPhone, row.contactTelegram);
  if (trustContact && key) {
    await upsertContact(key, ContactVerdictKind.TRUSTED, "ручное одобрение");
    await prisma.vacancy.updateMany({
      where: {
        moderationStatus: ModerationStatus.PENDING,
        trustScore: { gte: AUTO_PUBLISH_SCORE },
        OR: [
          row.contactPhone ? { contactPhone: row.contactPhone } : undefined,
          row.contactTelegram ? { contactTelegram: row.contactTelegram } : undefined,
        ].filter(Boolean) as Prisma.VacancyWhereInput[],
      },
      data: {
        moderationStatus: ModerationStatus.APPROVED,
        isActive: true,
        needsHumanReview: false,
        reviewedAt: new Date(),
        reviewedBy: REVIEWED_BY,
      },
    });
  }
  await recordDecision({
    vacancyId: id,
    decision: trustContact ? "PUBLISH_TRUST" : "PUBLISH",
    flags: row.trustFlags,
  });
  await touchSite(row.citySlug, row.slug);
  return {
    ok: true,
    message: trustContact
      ? "Опубликовано. Контакту доверяем — следующие его объявления с высоким баллом в очередь не попадут."
      : "Опубликовано. Объявление видно на сайте.",
  };
}

export async function markFraud(id: string, phrase?: string): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  const now = new Date();
  await prisma.vacancy.update({
    where: { id },
    data: {
      moderationStatus: ModerationStatus.BLOCKED,
      isActive: false,
      needsHumanReview: false,
      reviewedAt: now,
      reviewedBy: REVIEWED_BY,
    },
  });
  const key = contactKey(row.contactPhone, row.contactTelegram);
  if (key) {
    await upsertContact(key, ContactVerdictKind.BLOCKED, "ручная пометка: мошенничество");
  }
  await recordDecision({ vacancyId: id, decision: "FRAUD", flags: row.trustFlags, comment: phrase || null });
  let dictWarning: string | undefined;
  const flags = parseTrustFlags(row.trustFlags);
  const fromFlag = flags.find((flag) => flag.sample && !/^\d+$/.test(flag.sample))?.sample;
  const toStore = (phrase || fromFlag || "").trim();
  if (toStore.length >= 4) {
    const written = await addFraudPhrase(toStore);
    if (!written.ok) {
      dictWarning = written.error;
    }
  }
  await touchSite(row.citySlug, row.slug);
  return {
    ok: true,
    message: key
      ? "В блок. Контакт в чёрном списке, на сайте объявления нет."
      : "В блок. Телефона не было — в чёрный список класть нечего.",
    dictWarning,
  };
}

export async function markNotVacancy(id: string, stopWord?: string): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  await prisma.vacancy.update({
    where: { id },
    data: {
      moderationStatus: ModerationStatus.REJECTED,
      isActive: false,
      needsHumanReview: false,
      reviewedAt: new Date(),
      reviewedBy: REVIEWED_BY,
    },
  });
  await recordDecision({
    vacancyId: id,
    decision: "NOT_VACANCY",
    flags: row.trustFlags,
    comment: stopWord || null,
  });
  let dictWarning: string | undefined;
  if (stopWord?.trim()) {
    const written = await addStopWord(stopWord);
    if (!written.ok) {
      dictWarning = written.error;
    }
  }
  await touchSite(row.citySlug, row.slug);
  return { ok: true, message: "Помечено как не вакансия. На сайте не появится.", dictWarning };
}

export async function approveGroup(id: string): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  const ids = row.groupId
    ? (
        await prisma.vacancy.findMany({
          where: { groupId: row.groupId, moderationStatus: { not: ModerationStatus.BLOCKED } },
          select: { id: true, trustFlags: true },
        })
      ).map((item) => item.id)
    : [id];
  for (const vacancyId of ids) {
    await publishOne(vacancyId);
    const flags =
      vacancyId === id
        ? row.trustFlags
        : ((await prisma.vacancy.findUnique({ where: { id: vacancyId }, select: { trustFlags: true } }))?.trustFlags ??
          []);
    await recordDecision({ vacancyId, decision: "APPROVE_GROUP", flags });
  }
  await touchSite(row.citySlug, row.slug);
  return { ok: true, message: `Опубликована группа: ${ids.length} размещений.` };
}

export async function mergeDuplicate(id: string, targetId: string): Promise<DecisionResult> {
  if (id === targetId) {
    return { ok: false, error: "Нельзя привязать объявление к самому себе." };
  }
  const [row, target] = await Promise.all([loadVacancy(id), loadVacancy(targetId)]);
  if (!row || !target) {
    return { ok: false, error: "Одно из объявлений не найдено." };
  }
  let groupId = target.groupId;
  if (!groupId) {
    const created = await prisma.vacancyGroup.create({
      data: {
        signature: `manual-${target.id}`,
        primaryVacancyId: target.id,
        postingsCount: 2,
        sourcesCount: 1,
        distinctPhonesCount: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    groupId = created.id;
    await prisma.vacancy.update({ where: { id: target.id }, data: { groupId } });
  }
  await prisma.vacancy.update({
    where: { id },
    data: {
      duplicateOfId: target.id,
      groupId,
      moderationStatus: ModerationStatus.APPROVED,
      needsHumanReview: false,
      reviewedAt: new Date(),
      reviewedBy: REVIEWED_BY,
    },
  });
  const members = await prisma.vacancy.findMany({
    where: { groupId },
    select: { source: true, contactPhone: true },
  });
  await prisma.vacancyGroup.update({
    where: { id: groupId },
    data: {
      postingsCount: members.length,
      sourcesCount: new Set(members.map((item) => item.source)).size,
      distinctPhonesCount: new Set(members.map((item) => item.contactPhone).filter(Boolean)).size,
      lastSeenAt: new Date(),
    },
  });
  await recordDecision({
    vacancyId: id,
    decision: "MERGE_DUPLICATE",
    flags: row.trustFlags,
    comment: targetId,
  });
  await touchSite(row.citySlug, row.slug);
  return { ok: true, message: `Это дубль вакансии «${target.title}».` };
}

export async function unblockToQueue(id: string): Promise<DecisionResult> {
  const row = await loadVacancy(id);
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  await prisma.vacancy.update({
    where: { id },
    data: {
      moderationStatus: ModerationStatus.PENDING,
      isActive: false,
      needsHumanReview: true,
      reviewedAt: new Date(),
      reviewedBy: REVIEWED_BY,
    },
  });
  const key = contactKey(row.contactPhone, row.contactTelegram);
  if (key) {
    const verdict = await prisma.contactVerdict.findUnique({ where: { contact: key } });
    if (verdict?.verdict === ContactVerdictKind.BLOCKED) {
      await prisma.contactVerdict.delete({ where: { contact: key } });
    }
  }
  await recordDecision({ vacancyId: id, decision: "UNBLOCK_TO_QUEUE", flags: row.trustFlags });
  await touchSite(row.citySlug);
  return { ok: true, message: "Вернули в очередь одобрения. На сайте по-прежнему нет." };
}

export { touchSite };
