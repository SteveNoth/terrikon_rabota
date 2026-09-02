import { DeviceClass, EventType } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { log } from "@/lib/log";

const THROTTLE_MS = 30 * 60 * 1000;

export type VacancyViewEventInput = {
  vacancyId: string;
  citySlug: string;
  districtSlug: string | null;
  sphere: string;
  professionSlug: string | null;
  sessionHash: string;
  deviceClass: DeviceClass;
  qualityMode: string;
};

/**
 * Пишет VACANCY_VIEW и увеличивает viewsCount.
 * Одно событие от одной сессии на одну вакансию — не чаще раза в 30 минут.
 * IP, строку браузера и геолокацию не принимаем и не пишем.
 */
export async function recordVacancyView(input: VacancyViewEventInput): Promise<void> {
  const since = new Date(Date.now() - THROTTLE_MS);

  try {
    const recent = await prisma.event.findFirst({
      where: {
        type: EventType.VACANCY_VIEW,
        vacancyId: input.vacancyId,
        sessionHash: input.sessionHash,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) {
      return;
    }

    await prisma.$transaction([
      prisma.event.create({
        data: {
          type: EventType.VACANCY_VIEW,
          vacancyId: input.vacancyId,
          citySlug: input.citySlug,
          districtSlug: input.districtSlug,
          sphere: input.sphere,
          professionSlug: input.professionSlug,
          sessionHash: input.sessionHash,
          deviceClass: input.deviceClass,
          qualityMode: input.qualityMode,
        },
      }),
      prisma.vacancy.update({
        where: { id: input.vacancyId },
        data: { viewsCount: { increment: 1 } },
      }),
    ]);
  } catch (cause) {
    log.error("stats", "не удалось записать просмотр вакансии", cause);
  }
}
