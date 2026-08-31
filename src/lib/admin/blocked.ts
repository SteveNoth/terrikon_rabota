import { ModerationStatus } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { parseTrustFlags } from "@/lib/admin/flags";
import { SOURCE_LABEL } from "@/lib/format/source";
import { cityDisplayName } from "@/lib/geo";
import { blockReasonForFlags } from "@/lib/parser/contact";

export type BlockedItem = {
  id: string;
  title: string;
  rawText: string;
  cityName: string;
  sourceLabel: string;
  sourceName: string | null;
  contactPhone: string | null;
  contactTelegram: string | null;
  reason: string;
  flags: ReturnType<typeof parseTrustFlags>;
  createdAt: Date;
};

export async function listBlocked(): Promise<BlockedItem[]> {
  const rows = await prisma.vacancy.findMany({
    where: { moderationStatus: ModerationStatus.BLOCKED },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      rawText: true,
      citySlug: true,
      source: true,
      sourceName: true,
      contactPhone: true,
      contactTelegram: true,
      trustFlags: true,
      createdAt: true,
    },
  });
  return rows.map((row) => {
    const flags = parseTrustFlags(row.trustFlags);
    return {
      id: row.id,
      title: row.title,
      rawText: row.rawText ?? "",
      cityName: cityDisplayName(row.citySlug),
      sourceLabel: SOURCE_LABEL[row.source],
      sourceName: row.sourceName,
      contactPhone: row.contactPhone,
      contactTelegram: row.contactTelegram,
      reason: blockReasonForFlags(flags.map((flag) => flag.id)),
      flags,
      createdAt: row.createdAt,
    };
  });
}

export async function blockedBySource(): Promise<{ label: string; count: number }[]> {
  const rows = await prisma.vacancy.groupBy({
    by: ["sourceName", "source"],
    where: { moderationStatus: ModerationStatus.BLOCKED },
    _count: true,
  });
  return rows
    .map((row) => ({
      label: row.sourceName || SOURCE_LABEL[row.source],
      count: row._count,
    }))
    .sort((a, b) => b.count - a.count);
}
