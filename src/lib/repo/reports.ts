import { prisma } from "@/lib/adapters/db";
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
  } catch (cause) {
    if (cause instanceof Error && cause.message === "Вакансия не найдена.") {
      throw cause;
    }
    throw repoError("отправить жалобу", cause);
  }
}
