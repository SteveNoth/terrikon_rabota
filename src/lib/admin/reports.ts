import { ModerationStatus, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { FRAUD_REPORTS_HIDE_AFTER, REVIEWED_BY } from "@/lib/admin/constants";
import { formatWait } from "@/lib/admin/format";
import { touchSite } from "@/lib/admin/decisions";
import { reportReasonLabel, type ReportReasonId } from "@/lib/vacancy/reports";
import { cityDisplayName } from "@/lib/geo";

export type AdminReport = {
  id: string;
  vacancyId: string;
  vacancyTitle: string;
  vacancySlug: string;
  citySlug: string;
  cityName: string;
  reason: string;
  reasonLabel: string;
  comment: string | null;
  status: ReportStatus;
  createdAt: Date;
  waitLabel: string;
  stale: boolean;
};

export async function listReports(): Promise<AdminReport[]> {
  const now = new Date();
  const rows = await prisma.report.findMany({
    where: { status: ReportStatus.NEW },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      vacancy: { select: { title: true, slug: true, citySlug: true } },
    },
  });
  return rows.map((row) => {
    const ageMs = now.getTime() - row.createdAt.getTime();
    return {
      id: row.id,
      vacancyId: row.vacancyId,
      vacancyTitle: row.vacancy.title,
      vacancySlug: row.vacancy.slug,
      citySlug: row.vacancy.citySlug,
      cityName: cityDisplayName(row.vacancy.citySlug),
      reason: row.reason,
      reasonLabel: reportReasonLabel(row.reason as ReportReasonId),
      comment: row.comment,
      status: row.status,
      createdAt: row.createdAt,
      waitLabel: formatWait(row.createdAt, now),
      stale: ageMs > 86_400_000,
    };
  });
}

export async function hideVacancyFromReport(reportId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { vacancy: { select: { id: true, citySlug: true, slug: true } } },
  });
  if (!report) {
    return { ok: false, error: "Жалоба не найдена." };
  }
  await prisma.vacancy.update({
    where: { id: report.vacancyId },
    data: {
      isActive: false,
      reviewedAt: new Date(),
      reviewedBy: REVIEWED_BY,
    },
  });
  await prisma.report.update({
    where: { id: reportId },
    data: { status: ReportStatus.RESOLVED },
  });
  await prisma.moderationDecision.create({
    data: {
      vacancyId: report.vacancyId,
      decision: "HIDE",
      triggeredRules: [],
      comment: `жалоба ${report.reason}`,
    },
  });
  await touchSite(report.vacancy.citySlug, report.vacancy.slug);
  return { ok: true };
}

export async function dismissReport(reportId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { vacancy: { select: { citySlug: true, slug: true } } },
  });
  if (!report) {
    return { ok: false, error: "Жалоба не найдена." };
  }
  await prisma.report.update({
    where: { id: reportId },
    data: { status: ReportStatus.REVIEWED },
  });
  await prisma.moderationDecision.create({
    data: {
      vacancyId: report.vacancyId,
      decision: "DISMISS_REPORT",
      triggeredRules: [],
      comment: report.reason,
    },
  });
  await touchSite(report.vacancy.citySlug, report.vacancy.slug);
  return { ok: true };
}

export { FRAUD_REPORTS_HIDE_AFTER, ModerationStatus };
