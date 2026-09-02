/**
 * Очередь кабинета. Не копия очереди постов: поля формы, компания, аккаунт.
 */

import { ContactVerdictKind, ModerationStatus, Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { HIGH_RISK_SCORE } from "@/lib/admin/constants";
import { isFraudFlag, parseTrustFlags, salaryExplanation, type TrustFlag } from "@/lib/admin/flags";
import { formatWait } from "@/lib/admin/format";
import { employerQueueWhere, type ContactHistoryItem, type QueueSummary } from "@/lib/admin/queue";
import { contactKey } from "@/lib/parser/contact";
import { cityDisplayName } from "@/lib/geo";
import { workFormatAdminLabel } from "@/lib/format/labels";
import { formatMoney } from "@/lib/format/money";
import { getProfession } from "@/lib/professions";

export type CabinetQueueMarks = {
  newContact: boolean;
  unverifiedCompany: boolean;
  weakFraud: boolean;
  complaint: boolean;
};

export type CabinetQueueItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  moderationStatus: ModerationStatus;
  trustScore: number;
  flags: TrustFlag[];
  salaryLine: string | null;
  salaryText: string;
  professionName: string;
  workFormatLabel: string;
  contactPhone: string | null;
  contactTelegram: string | null;
  contactEmail: string | null;
  contactKey: string | null;
  contactVerdict: ContactVerdictKind | null;
  contactSeenBefore: boolean;
  contactHistory: ContactHistoryItem[];
  highRisk: boolean;
  createdAt: Date;
  waitLabel: string;
  fraudReportCount: number;
  citySlug: string;
  cityName: string;
  isActive: boolean;
  employerId: string | null;
  companyName: string;
  companyCity: string;
  isVerified: boolean;
  accountUserId: string | null;
  accountEmail: string;
  accountName: string;
  publishBlocked: boolean;
  vacancyCounts: { status: string; count: number }[];
  marks: CabinetQueueMarks;
};

const select = {
  id: true,
  slug: true,
  title: true,
  description: true,
  rawText: true,
  trustScore: true,
  trustFlags: true,
  completeness: true,
  createdAt: true,
  workFormat: true,
  citySlug: true,
  contactPhone: true,
  contactTelegram: true,
  contactEmail: true,
  salaryFrom: true,
  salaryTo: true,
  salaryPeriod: true,
  professionSlug: true,
  moderationStatus: true,
  isActive: true,
  duplicateOfId: true,
  groupId: true,
  employerId: true,
  source: true,
  reports: {
    where: { reason: "fraud", status: "NEW" },
    select: { id: true },
  },
  employer: {
    select: {
      id: true,
      name: true,
      citySlug: true,
      isVerified: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          publishBlocked: true,
        },
      },
    },
  },
} satisfies Prisma.VacancySelect;

type Row = Prisma.VacancyGetPayload<{ select: typeof select }>;

function sortItems(items: CabinetQueueItem[]): CabinetQueueItem[] {
  return [...items].sort((a, b) => {
    if (b.fraudReportCount !== a.fraudReportCount) {
      return b.fraudReportCount - a.fraudReportCount;
    }
    if (a.highRisk !== b.highRisk) {
      return a.highRisk ? -1 : 1;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

async function enrich(rows: Row[], now: Date): Promise<CabinetQueueItem[]> {
  const keys = [
    ...new Set(rows.map((row) => contactKey(row.contactPhone, row.contactTelegram)).filter((item): item is string => Boolean(item))),
  ];
  const phones = [...new Set(rows.map((row) => row.contactPhone).filter((item): item is string => Boolean(item)))];
  const telegrams = [...new Set(rows.map((row) => row.contactTelegram).filter((item): item is string => Boolean(item)))];
  const employerIds = [...new Set(rows.map((row) => row.employerId).filter((item): item is string => Boolean(item)))];

  const [verdicts, previous, counts, seen] = await Promise.all([
    keys.length ? prisma.contactVerdict.findMany({ where: { contact: { in: keys } } }) : Promise.resolve([]),
    phones.length || telegrams.length
      ? prisma.moderationDecision.findMany({
          where: {
            vacancy: {
              OR: [
                phones.length ? { contactPhone: { in: phones } } : undefined,
                telegrams.length ? { contactTelegram: { in: telegrams } } : undefined,
              ].filter(Boolean) as Prisma.VacancyWhereInput[],
            },
          },
          orderBy: { decidedAt: "desc" },
          take: 80,
          select: {
            decidedAt: true,
            decision: true,
            vacancyId: true,
            vacancy: { select: { title: true, contactPhone: true, contactTelegram: true } },
          },
        })
      : Promise.resolve([]),
    employerIds.length
      ? prisma.vacancy.groupBy({
          by: ["employerId", "moderationStatus"],
          where: { employerId: { in: employerIds } },
          _count: true,
        })
      : Promise.resolve([]),
    phones.length
      ? prisma.vacancy.groupBy({
          by: ["contactPhone"],
          where: { contactPhone: { in: phones } },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  const verdictMap = new Map(verdicts.map((row) => [row.contact, row.verdict]));
  const historyByKey = new Map<string, ContactHistoryItem[]>();
  for (const row of previous) {
    const key = contactKey(row.vacancy.contactPhone, row.vacancy.contactTelegram);
    if (!key) {
      continue;
    }
    const list = historyByKey.get(key) ?? [];
    list.push({
      decidedAt: row.decidedAt,
      decision: row.decision,
      title: row.vacancy.title,
      vacancyId: row.vacancyId,
    });
    historyByKey.set(key, list);
  }
  const seenCounts = new Map<string, number>();
  for (const row of seen) {
    if (row.contactPhone) {
      seenCounts.set(row.contactPhone, row._count);
    }
  }
  const countsByEmployer = new Map<string, { status: string; count: number }[]>();
  for (const row of counts) {
    if (!row.employerId) {
      continue;
    }
    const list = countsByEmployer.get(row.employerId) ?? [];
    list.push({ status: row.moderationStatus, count: row._count });
    countsByEmployer.set(row.employerId, list);
  }

  return rows.map((row) => {
    const flags = parseTrustFlags(row.trustFlags);
    const fraudReportCount = row.reports.length;
    const key = contactKey(row.contactPhone, row.contactTelegram);
    const seenBefore = row.contactPhone ? (seenCounts.get(row.contactPhone) ?? 1) > 1 : false;
    const isVerified = Boolean(row.employer?.isVerified);
    const highRisk = row.trustScore < HIGH_RISK_SCORE || fraudReportCount > 0;
    const fraudFlags = flags.some(isFraudFlag);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description || row.rawText || "",
      moderationStatus: row.moderationStatus,
      trustScore: row.trustScore,
      flags,
      salaryLine: salaryExplanation(flags),
      salaryText: formatMoney({
        salaryFrom: row.salaryFrom,
        salaryTo: row.salaryTo,
        salaryPeriod: row.salaryPeriod,
      }),
      professionName: row.professionSlug ? (getProfession(row.professionSlug)?.name ?? row.professionSlug) : "не указана",
      workFormatLabel: workFormatAdminLabel(row.workFormat),
      contactPhone: row.contactPhone,
      contactTelegram: row.contactTelegram,
      contactEmail: row.contactEmail,
      contactKey: key,
      contactVerdict: key ? (verdictMap.get(key) ?? null) : null,
      contactSeenBefore: seenBefore,
      contactHistory: key ? (historyByKey.get(key) ?? []).slice(0, 5) : [],
      highRisk,
      createdAt: row.createdAt,
      waitLabel: formatWait(row.createdAt, now),
      fraudReportCount,
      citySlug: row.citySlug,
      cityName: cityDisplayName(row.citySlug),
      isActive: row.isActive,
      employerId: row.employerId,
      companyName: row.employer?.name ?? "без компании",
      companyCity: row.employer ? cityDisplayName(row.employer.citySlug) : cityDisplayName(row.citySlug),
      isVerified,
      accountUserId: row.employer?.user?.id ?? row.employer?.userId ?? null,
      accountEmail: row.employer?.user?.email ?? "нет аккаунта",
      accountName: row.employer?.user?.name ?? "—",
      publishBlocked: Boolean(row.employer?.user?.publishBlocked),
      vacancyCounts: row.employerId ? (countsByEmployer.get(row.employerId) ?? []) : [],
      marks: {
        newContact: flags.some((flag) => flag.id === "new_contact") || !seenBefore,
        unverifiedCompany: !isVerified,
        weakFraud: fraudFlags && row.trustScore >= HIGH_RISK_SCORE,
        complaint: fraudReportCount > 0,
      },
    };
  });
}

export async function employerQueueSummary(employerId?: string): Promise<QueueSummary> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const where = employerQueueWhere(employerId);
  const [total, oldest, inflow24h, decisions24h] = await Promise.all([
    prisma.vacancy.count({ where }),
    prisma.vacancy.findFirst({
      where,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.vacancy.count({ where: { ...where, createdAt: { gte: dayAgo } } }),
    prisma.moderationDecision.count({
      where: {
        decidedAt: { gte: dayAgo },
        vacancy: { source: Source.EMPLOYER },
      },
    }),
  ]);
  return {
    total,
    oldest: oldest?.createdAt ?? null,
    oldestLabel: oldest ? formatWait(oldest.createdAt, now) : null,
    inflow24h,
    decisions24h,
    growing: inflow24h > decisions24h && total > 0,
  };
}

export async function listEmployerQueue(employerId?: string): Promise<CabinetQueueItem[]> {
  const now = new Date();
  const rows = await prisma.vacancy.findMany({
    where: employerQueueWhere(employerId),
    select,
    take: 400,
    orderBy: { createdAt: "asc" },
  });
  return sortItems(await enrich(rows, now));
}

export async function getEmployerQueueItem(id: string): Promise<CabinetQueueItem | null> {
  const now = new Date();
  const row = await prisma.vacancy.findUnique({ where: { id }, select });
  if (!row || row.source !== Source.EMPLOYER) {
    return null;
  }
  const [item] = await enrich([row], now);
  return item ?? null;
}

export function statusCountLabel(rows: { status: string; count: number }[]): string {
  if (!rows.length) {
    return "вакансий нет";
  }
  const labels: Record<string, string> = {
    PENDING: "на проверке",
    AUTO_OK: "одобрено автоматически",
    APPROVED: "одобрено",
    REJECTED: "отклонено",
    BLOCKED: "блок",
  };
  return rows
    .map((row) => `${labels[row.status] ?? row.status}: ${row.count}`)
    .join(", ");
}
