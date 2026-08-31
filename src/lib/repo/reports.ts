import { prisma } from "@/lib/adapters/db";
import { clearMemoryCache } from "@/lib/adapters/cache";
import { FRAUD_REPORTS_HIDE_AFTER } from "@/lib/admin/constants";
import { repoError } from "@/lib/repo/errors";
import { isReportReason, type ReportReasonId } from "@/lib/vacancy/reports";

export async function createVacancyReport(input: {
  vacancyId: string;
  reason: ReportReasonId;
  comment: string | null;
}): Promise<void> {
  if (!isReportReason(input.reason)) {
    throw new Error("Неизвестная причина жалобы.");
  }

  try {
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: input.vacancyId },
      select: { id: true },
    });
    if (!vacancy) {
      throw new Error("Вакансия не найдена.");
    }

    await prisma.report.create({
      data: {
        vacancyId: input.vacancyId,
        reason: input.reason,
        comment: input.comment,
      },
    });

    if (input.reason === "fraud") {
      const fraudCount = await prisma.report.count({
        where: { vacancyId: input.vacancyId, reason: "fraud", status: "NEW" },
      });
      await prisma.vacancy.update({
        where: { id: input.vacancyId },
        data: {
          needsHumanReview: true,
          ...(fraudCount >= FRAUD_REPORTS_HIDE_AFTER ? { isActive: false } : {}),
        },
      });
      clearMemoryCache();
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message === "Вакансия не найдена.") {
      throw cause;
    }
    throw repoError("отправить жалобу", cause);
  }
}
