import {
  ContactVerdictKind,
  ModerationStatus,
  Prisma,
  Source,
  type Vacancy,
} from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { HIGH_RISK_SCORE, isQueueTab, type QueueTab } from "@/lib/admin/constants";
import { classifyDoubts, parseTrustFlags, salaryExplanation, type QueueDoubts, type TrustFlag } from "@/lib/admin/flags";
import { formatWait } from "@/lib/admin/format";
import { jaccardPercent } from "@/lib/admin/jaccard";
import { contactKey } from "@/lib/parser/contact";
import { SOURCE_LABEL } from "@/lib/format/source";
import { cityDisplayName } from "@/lib/geo";
import { employerKindLabel } from "@/lib/format/labels";

export type QueueMember = {
  id: string;
  title: string;
  source: Source;
  sourceName: string | null;
  sourceUrl: string | null;
  contactPhone: string | null;
  similarity: number;
};

export type ContactHistoryItem = {
  decidedAt: Date;
  decision: string;
  title: string;
  vacancyId: string;
};

export type QueueItem = {
  id: string;
  title: string;
  rawText: string;
  ocrText: string | null;
  trustScore: number;
  flags: TrustFlag[];
  salaryLine: string | null;
  highRisk: boolean;
  createdAt: Date;
  waitLabel: string;
  doubts: QueueDoubts;
  fraudReportCount: number;
  workFormat: Vacancy["workFormat"];
  workLocationText: string | null;
  rotationPattern: string | null;
  employerKindLabel: string | null;
  citySlug: string;
  cityName: string;
  contactPhone: string | null;
  contactTelegram: string | null;
  contactKey: string | null;
  contactVerdict: ContactVerdictKind | null;
  contactSeenBefore: boolean;
  contactHistory: ContactHistoryItem[];
  groupId: string | null;
  groupPostings: number;
  groupSources: string[];
  distinctPhones: number;
  members: QueueMember[];
  source: Source;
  sourceName: string | null;
  sourceUrl: string | null;
  professionSlug: string | null;
  completeness: number;
  slug: string;
};

export type QueueSummary = {
  total: number;
  oldest: Date | null;
  oldestLabel: string | null;
  inflow24h: number;
  decisions24h: number;
  growing: boolean;
};

const queueSelect = {
  id: true,
  slug: true,
  title: true,
  rawText: true,
  ocrText: true,
  trustScore: true,
  trustFlags: true,
  completeness: true,
  createdAt: true,
  workFormat: true,
  workLocationText: true,
  rotationPattern: true,
  employerKind: true,
  citySlug: true,
  contactPhone: true,
  contactTelegram: true,
  duplicateOfId: true,
  groupId: true,
  source: true,
  sourceName: true,
  sourceUrl: true,
  professionSlug: true,
  group: {
    select: {
      id: true,
      postingsCount: true,
      sourcesCount: true,
      distinctPhonesCount: true,
      vacancies: {
        select: {
          id: true,
          title: true,
          source: true,
          sourceName: true,
          sourceUrl: true,
          contactPhone: true,
          rawText: true,
        },
      },
    },
  },
  reports: {
    where: { reason: "fraud", status: "NEW" },
    select: { id: true },
  },
} satisfies Prisma.VacancySelect;

type QueueRow = Prisma.VacancyGetPayload<{ select: typeof queueSelect }>;

/** Очередь постов. Карточки кабинета сюда не попадают. */
export function parserQueueWhere(): Prisma.VacancyWhereInput {
  return {
    source: { not: Source.EMPLOYER },
    moderationStatus: { notIn: [ModerationStatus.BLOCKED, ModerationStatus.REJECTED] },
    OR: [
      { moderationStatus: ModerationStatus.PENDING },
      { reports: { some: { reason: "fraud", status: "NEW" } } },
    ],
  };
}

/** Очередь кабинета: PENDING или жалобы «похоже на мошенничество». Жёсткий BLOCKED — в /admin/blocked. */
export function employerQueueWhere(employerId?: string): Prisma.VacancyWhereInput {
  return {
    source: Source.EMPLOYER,
    ...(employerId ? { employerId } : {}),
    OR: [
      { moderationStatus: ModerationStatus.PENDING },
      {
        AND: [
          { moderationStatus: { notIn: [ModerationStatus.BLOCKED, ModerationStatus.REJECTED] } },
          { reports: { some: { reason: "fraud", status: "NEW" } } },
        ],
      },
    ],
  };
}

function queueWhere(): Prisma.VacancyWhereInput {
  return parserQueueWhere();
}

function toItem(
  row: QueueRow,
  extra: {
    contactVerdict: ContactVerdictKind | null;
    contactSeenBefore: boolean;
    contactHistory: ContactHistoryItem[];
  },
  now: Date,
): QueueItem {
  const flags = parseTrustFlags(row.trustFlags);
  const groupPostings = row.group?.postingsCount ?? (row.groupId ? 2 : 0);
  const fraudReportCount = row.reports.length;
  const doubts = classifyDoubts({
    flags,
    trustScore: row.trustScore,
    highRiskThreshold: HIGH_RISK_SCORE,
    fraudReportCount,
    duplicateOfId: row.duplicateOfId,
    groupPostings,
    completeness: row.completeness,
  });
  const raw = row.rawText ?? "";
  const members: QueueMember[] = (row.group?.vacancies ?? [])
    .filter((item) => item.id !== row.id)
    .map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      contactPhone: item.contactPhone,
      similarity: jaccardPercent(raw, item.rawText ?? ""),
    }));
  const sources = [...new Set((row.group?.vacancies ?? []).map((item) => item.sourceName || SOURCE_LABEL[item.source]))];
  const phones = new Set(
    (row.group?.vacancies ?? []).map((item) => item.contactPhone).filter((item): item is string => Boolean(item)),
  );
  return {
    id: row.id,
    title: row.title,
    rawText: raw,
    ocrText: row.ocrText,
    trustScore: row.trustScore,
    flags,
    salaryLine: salaryExplanation(flags),
    highRisk: row.trustScore < HIGH_RISK_SCORE || fraudReportCount > 0,
    createdAt: row.createdAt,
    waitLabel: formatWait(row.createdAt, now),
    doubts,
    fraudReportCount,
    workFormat: row.workFormat,
    workLocationText: row.workLocationText,
    rotationPattern: row.rotationPattern,
    employerKindLabel: employerKindLabel(row.employerKind),
    citySlug: row.citySlug,
    cityName: cityDisplayName(row.citySlug),
    contactPhone: row.contactPhone,
    contactTelegram: row.contactTelegram,
    contactKey: contactKey(row.contactPhone, row.contactTelegram),
    contactVerdict: extra.contactVerdict,
    contactSeenBefore: extra.contactSeenBefore,
    contactHistory: extra.contactHistory,
    groupId: row.groupId,
    groupPostings: row.group?.postingsCount ?? members.length + 1,
    groupSources: sources,
    distinctPhones: row.group?.distinctPhonesCount ?? phones.size,
    members,
    source: row.source,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    professionSlug: row.professionSlug,
    completeness: row.completeness,
    slug: row.slug,
  };
}

function sortItems(items: QueueItem[]): QueueItem[] {
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

function collapseGroups(items: QueueItem[]): QueueItem[] {
  const seen = new Set<string>();
  const out: QueueItem[] = [];
  for (const item of items) {
    const key = item.groupId ? `g:${item.groupId}` : `v:${item.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function enrich(rows: QueueRow[], now: Date): Promise<QueueItem[]> {
  const keys = [
    ...new Set(rows.map((row) => contactKey(row.contactPhone, row.contactTelegram)).filter((item): item is string => Boolean(item))),
  ];
  const phones = [...new Set(rows.map((row) => row.contactPhone).filter((item): item is string => Boolean(item)))];
  const telegrams = [...new Set(rows.map((row) => row.contactTelegram).filter((item): item is string => Boolean(item)))];

  const [verdicts, previous] = await Promise.all([
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
  if (phones.length || telegrams.length) {
    const grouped = await prisma.vacancy.groupBy({
      by: ["contactPhone"],
      where: phones.length ? { contactPhone: { in: phones } } : { id: "__none__" },
      _count: true,
    });
    for (const row of grouped) {
      if (row.contactPhone) {
        seenCounts.set(row.contactPhone, row._count);
      }
    }
  }

  return rows.map((row) => {
    const key = contactKey(row.contactPhone, row.contactTelegram);
    const seen = row.contactPhone ? (seenCounts.get(row.contactPhone) ?? 1) > 1 : false;
    return toItem(
      row,
      {
        contactVerdict: key ? (verdictMap.get(key) ?? null) : null,
        contactSeenBefore: seen,
        contactHistory: key ? (historyByKey.get(key) ?? []).slice(0, 5) : [],
      },
      now,
    );
  });
}

export async function queueSummary(): Promise<QueueSummary> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [total, oldest, inflow24h, decisions24h] = await Promise.all([
    prisma.vacancy.count({ where: queueWhere() }),
    prisma.vacancy.findFirst({
      where: queueWhere(),
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.vacancy.count({ where: { ...queueWhere(), createdAt: { gte: dayAgo } } }),
    prisma.moderationDecision.count({ where: { decidedAt: { gte: dayAgo } } }),
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

export async function listQueue(tab: QueueTab = "all"): Promise<QueueItem[]> {
  const now = new Date();
  const rows = await prisma.vacancy.findMany({
    where: queueWhere(),
    select: queueSelect,
    take: 400,
    orderBy: { createdAt: "asc" },
  });
  const items = collapseGroups(sortItems(await enrich(rows, now)));
  if (tab === "all") {
    return items;
  }
  return items.filter((item) => item.doubts[tab === "fraud" ? "fraud" : tab === "vacancy" ? "vacancy" : "duplicate"]);
}

export async function getQueueItem(id: string): Promise<QueueItem | null> {
  const now = new Date();
  const row = await prisma.vacancy.findUnique({ where: { id }, select: queueSelect });
  if (!row || row.source === Source.EMPLOYER) {
    return null;
  }
  const [item] = await enrich([row], now);
  return item ?? null;
}

export function parseQueueTab(value: string | null | undefined): QueueTab {
  return isQueueTab(value) ? value : "all";
}
