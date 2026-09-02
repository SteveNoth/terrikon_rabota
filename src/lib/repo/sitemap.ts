import { ModerationStatus, Prisma, WorkFormat } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { repoError } from "@/lib/repo/errors";

function approvedWhere(): Prisma.VacancyWhereInput {
  return {
    moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] },
  };
}

function publishedWhere(): Prisma.VacancyWhereInput {
  return {
    isActive: true,
    ...approvedWhere(),
  };
}

function listingUnitWhere(): Prisma.VacancyWhereInput {
  return {
    OR: [{ groupId: null }, { primaryOfGroups: { some: {} } }],
  };
}

export type SitemapVacancyRow = {
  slug: string;
  citySlug: string;
  publishedAt: Date;
  lastSeenAt: Date;
};

export type SitemapEmployerRow = {
  slug: string;
  citySlug: string;
  updatedAt: Date;
};

export type SitemapSphereRow = {
  citySlug: string;
  sphere: string;
  count: number;
};

/** Активные единицы выдачи — то, что должно быть в sitemap. */
export async function listSitemapVacancies(): Promise<SitemapVacancyRow[]> {
  try {
    return await prisma.vacancy.findMany({
      where: {
        ...publishedWhere(),
        ...listingUnitWhere(),
      },
      select: {
        slug: true,
        citySlug: true,
        publishedAt: true,
        lastSeenAt: true,
      },
      orderBy: { publishedAt: "desc" },
    });
  } catch (cause) {
    throw repoError("собрать вакансии для sitemap", cause);
  }
}

/** Работодатели с хотя бы одной активной вакансией на выдаче. */
export async function listSitemapEmployers(): Promise<SitemapEmployerRow[]> {
  try {
    return await prisma.employer.findMany({
      where: {
        vacancies: {
          some: {
            ...publishedWhere(),
            ...listingUnitWhere(),
          },
        },
      },
      select: {
        slug: true,
        citySlug: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
  } catch (cause) {
    throw repoError("собрать работодателей для sitemap", cause);
  }
}

export async function listSitemapSpheres(): Promise<SitemapSphereRow[]> {
  try {
    const groups = await prisma.vacancy.groupBy({
      by: ["citySlug", "sphere"],
      where: {
        ...publishedWhere(),
        ...listingUnitWhere(),
        workFormat: WorkFormat.LOCAL,
      },
      _count: { _all: true },
    });
    return groups
      .filter((row) => row._count._all > 0)
      .map((row) => ({
        citySlug: row.citySlug,
        sphere: row.sphere,
        count: row._count._all,
      }))
      .sort((a, b) => a.citySlug.localeCompare(b.citySlug) || a.sphere.localeCompare(b.sphere));
  } catch (cause) {
    throw repoError("собрать сферы для sitemap", cause);
  }
}

export async function getPublicEmployer(slug: string) {
  try {
    return await prisma.employer.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        citySlug: true,
        sphere: true,
        isVerified: true,
        logoUrl: true,
        website: true,
        phone: true,
        telegram: true,
        email: true,
      },
    });
  } catch (cause) {
    throw repoError("открыть страницу работодателя", cause);
  }
}
