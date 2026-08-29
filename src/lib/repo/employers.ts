import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { repoError } from "@/lib/repo/errors";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type ListEmployersParams = {
  citySlug?: string;
  page?: number;
  pageSize?: number;
};

const employerSelect = {
  id: true,
  slug: true,
  name: true,
  citySlug: true,
  sphere: true,
  isVerified: true,
  logoUrl: true,
} satisfies Prisma.EmployerSelect;

function clampTake(requested: number | undefined, fallback: number, max: number): number {
  if (requested == null || !Number.isFinite(requested) || requested < 1) {
    return fallback;
  }
  return Math.min(Math.floor(requested), max);
}

function clampPage(page: number | undefined): number {
  if (page == null || !Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.floor(page);
}

export async function listEmployers(params: ListEmployersParams = {}) {
  const page = clampPage(params.page);
  const pageSize = clampTake(params.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const where: Prisma.EmployerWhereInput = params.citySlug ? { citySlug: params.citySlug } : {};

  try {
    const [employers, total] = await Promise.all([
      prisma.employer.findMany({
        where,
        select: employerSelect,
        orderBy: [{ isVerified: "desc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.employer.count({ where }),
    ]);

    return {
      employers,
      total,
      page,
      pageSize,
      pages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  } catch (cause) {
    throw repoError("загрузить список работодателей", cause);
  }
}

export async function getEmployerBySlug(slug: string) {
  try {
    return await prisma.employer.findUnique({
      where: { slug },
      select: {
        ...employerSelect,
        description: true,
        phone: true,
        telegram: true,
        email: true,
        website: true,
      },
    });
  } catch (cause) {
    throw repoError("открыть работодателя", cause);
  }
}
