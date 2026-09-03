import { ModerationStatus, Prisma } from "@prisma/client";

/**
 * Единица выдачи: не дубль чужой карточки; группа считается один раз
 * (главная запись или вакансия без группы). Раздел 11.17.
 */
export function listingUnitWhere(): Prisma.VacancyWhereInput {
  return {
    duplicateOfId: null,
    OR: [{ groupId: null }, { primaryOfGroups: { some: {} } }],
  };
}

export function approvedWhere(): Prisma.VacancyWhereInput {
  return {
    moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] },
  };
}

export function publishedWhere(): Prisma.VacancyWhereInput {
  return {
    isActive: true,
    ...approvedWhere(),
  };
}

export function isPublishedStatus(status: ModerationStatus): boolean {
  return status === ModerationStatus.AUTO_OK || status === ModerationStatus.APPROVED;
}
