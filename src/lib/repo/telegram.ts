import { ModerationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { getDefaultCity, isActiveCity } from "@/lib/geo";
import { repoError } from "@/lib/repo/errors";
import { getLatestVacancies, type VacancyListItem } from "@/lib/repo/vacancies";
import { TELEGRAM_DIALOGS, TELEGRAM_LATEST_COUNT, TELEGRAM_MAX_PER_HOUR } from "@/lib/telegram/constants";
import { deliveryGroupKey } from "@/lib/telegram/match";
import { isTelegramLinkCode } from "@/lib/seeker/link-code";

export type TelegramSubscriber = {
  id: string;
  chatId: string;
  citySlug: string;
  keywords: string[];
  spheres: string[];
  isActive: boolean;
  lastNotifiedAt: Date | null;
  dialog: string;
  pendingKeywords: string[];
  userId: string | null;
  createdAt: Date;
};

const subscriberSelect = {
  id: true,
  chatId: true,
  citySlug: true,
  keywords: true,
  spheres: true,
  isActive: true,
  lastNotifiedAt: true,
  dialog: true,
  pendingKeywords: true,
  userId: true,
  createdAt: true,
} satisfies Prisma.TelegramUserSelect;

function listingUnitWhere(): Prisma.VacancyWhereInput {
  return {
    OR: [{ groupId: null }, { primaryOfGroups: { some: {} } }],
  };
}

function publishedWhere(): Prisma.VacancyWhereInput {
  return {
    isActive: true,
    moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] },
  };
}

function resolveCitySlug(slug: string | null | undefined): string {
  if (slug && isActiveCity(slug)) {
    return slug;
  }
  return getDefaultCity().slug;
}

export async function ensureTelegramUser(chatId: string): Promise<TelegramSubscriber> {
  const citySlug = getDefaultCity().slug;
  try {
    return await prisma.telegramUser.upsert({
      where: { chatId },
      create: {
        chatId,
        citySlug,
        isActive: false,
        dialog: TELEGRAM_DIALOGS.idle,
      },
      update: {},
      select: subscriberSelect,
    });
  } catch (cause) {
    throw repoError("найти подписчика Telegram", cause);
  }
}

export async function setTelegramDialog(
  id: string,
  dialog: string,
  pendingKeywords: string[] = [],
): Promise<void> {
  await prisma.telegramUser.update({
    where: { id },
    data: { dialog, pendingKeywords },
  });
}

export async function saveSubscription(
  id: string,
  input: { citySlug?: string; keywords: string[]; spheres: string[] },
): Promise<TelegramSubscriber> {
  const citySlug = resolveCitySlug(input.citySlug);
  try {
    return await prisma.telegramUser.update({
      where: { id },
      data: {
        citySlug,
        keywords: input.keywords,
        spheres: input.spheres,
        isActive: true,
        dialog: TELEGRAM_DIALOGS.idle,
        pendingKeywords: [],
        lastNotifiedAt: new Date(),
      },
      select: subscriberSelect,
    });
  } catch (cause) {
    throw repoError("сохранить подписку Telegram", cause);
  }
}

export async function deactivateSubscription(id: string): Promise<TelegramSubscriber> {
  try {
    return await prisma.telegramUser.update({
      where: { id },
      data: {
        isActive: false,
        dialog: TELEGRAM_DIALOGS.idle,
        pendingKeywords: [],
      },
      select: subscriberSelect,
    });
  } catch (cause) {
    throw repoError("отключить подписку Telegram", cause);
  }
}

export async function setTelegramCity(id: string, citySlug: string): Promise<TelegramSubscriber> {
  try {
    return await prisma.telegramUser.update({
      where: { id },
      data: { citySlug: resolveCitySlug(citySlug) },
      select: subscriberSelect,
    });
  } catch (cause) {
    throw repoError("сменить город Telegram", cause);
  }
}

export async function listLatestForChat(citySlug: string): Promise<VacancyListItem[]> {
  return getLatestVacancies(resolveCitySlug(citySlug), TELEGRAM_LATEST_COUNT);
}

export async function linkTelegramToUser(
  telegramUserId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: "bad_code" }> {
  const normalized = code.trim().toUpperCase();
  if (!isTelegramLinkCode(normalized)) {
    return { ok: false, reason: "bad_code" };
  }
  try {
    const user = await prisma.user.findFirst({
      where: { telegramLinkCode: normalized },
      select: { id: true, citySlug: true, notifyTelegram: true },
    });
    if (!user) {
      return { ok: false, reason: "bad_code" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.telegramUser.updateMany({
        where: { userId: user.id, id: { not: telegramUserId } },
        data: { userId: null },
      });
      await tx.telegramUser.update({
        where: { id: telegramUserId },
        data: {
          userId: user.id,
          dialog: TELEGRAM_DIALOGS.idle,
          ...(user.notifyTelegram
            ? {
                isActive: true,
                citySlug: resolveCitySlug(user.citySlug),
                lastNotifiedAt: new Date(),
              }
            : {}),
        },
      });
    });
    return { ok: true };
  } catch (cause) {
    throw repoError("привязать Telegram к аккаунту", cause);
  }
}

export type NotifyCandidate = VacancyListItem & { groupId: string | null };

export async function listNotifyVacancies(since: Date): Promise<NotifyCandidate[]> {
  try {
    const rows = await prisma.vacancy.findMany({
      where: {
        ...publishedWhere(),
        ...listingUnitWhere(),
        publishedAt: { gte: since },
      },
      orderBy: [{ publishedAt: "asc" }],
      take: 200,
      select: {
        id: true,
        slug: true,
        title: true,
        summaryLine: true,
        salaryFrom: true,
        salaryTo: true,
        salaryPeriod: true,
        salaryCurrency: true,
        citySlug: true,
        districtSlug: true,
        sphere: true,
        professionSlug: true,
        schedule: true,
        experience: true,
        employmentType: true,
        workFormat: true,
        workLocationText: true,
        workCitySlug: true,
        rotationPattern: true,
        publishedAt: true,
        qualityScore: true,
        completeness: true,
        source: true,
        sourceName: true,
        salaryIsGross: true,
        isActive: true,
        groupId: true,
        employer: {
          select: {
            slug: true,
            name: true,
            isVerified: true,
            logoUrl: true,
          },
        },
      },
    });
    return rows;
  } catch (cause) {
    throw repoError("найти вакансии для рассылки Telegram", cause);
  }
}

export async function listActiveSubscribers(): Promise<TelegramSubscriber[]> {
  try {
    return await prisma.telegramUser.findMany({
      where: { isActive: true },
      select: subscriberSelect,
    });
  } catch (cause) {
    throw repoError("найти подписчиков Telegram", cause);
  }
}

export async function countDeliveriesSince(telegramUserId: string, since: Date): Promise<number> {
  return prisma.telegramDelivery.count({
    where: { telegramUserId, sentAt: { gte: since } },
  });
}

export async function listDeliveredGroupKeys(telegramUserId: string, groupKeys: string[]): Promise<Set<string>> {
  if (groupKeys.length === 0) {
    return new Set();
  }
  const rows = await prisma.telegramDelivery.findMany({
    where: { telegramUserId, groupKey: { in: groupKeys } },
    select: { groupKey: true },
  });
  return new Set(rows.map((row) => row.groupKey));
}

export async function recordDelivery(input: {
  telegramUserId: string;
  vacancyId: string;
  groupKey: string;
}): Promise<boolean> {
  try {
    await prisma.telegramDelivery.create({
      data: {
        telegramUserId: input.telegramUserId,
        vacancyId: input.vacancyId,
        groupKey: input.groupKey,
      },
    });
    await prisma.telegramUser.update({
      where: { id: input.telegramUserId },
      data: { lastNotifiedAt: new Date() },
    });
    return true;
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return false;
    }
    throw repoError("записать доставку Telegram", cause);
  }
}

export async function markSubscriberBlocked(id: string): Promise<void> {
  await prisma.telegramUser.update({
    where: { id },
    data: { isActive: false },
  });
}

export function notifyGroupKey(vacancy: { id: string; groupId: string | null }): string {
  return deliveryGroupKey(vacancy);
}

export function hourQuota(): number {
  return TELEGRAM_MAX_PER_HOUR;
}
