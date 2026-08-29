import {
  EmploymentType,
  Experience,
  ModerationStatus,
  Prisma,
  WorkFormat,
  type SalaryPeriod,
  type Source,
} from "@prisma/client";
import { wrap } from "@/lib/adapters/cache";
import { prisma } from "@/lib/adapters/db";
import { repoError } from "@/lib/repo/errors";

/** Сколько карточек на страницу, если в адресе ничего нет. Как в режиме Full/Lite. */
export const DEFAULT_PAGE_SIZE = 20;
/** Жёсткий потолок: «получить всё» через огромный pageSize нельзя. */
export const MAX_PAGE_SIZE = 50;
const MAX_LATEST = 24;
const MAX_SIMILAR = 8;
const COUNT_TTL_SECONDS = 60;

export type VacancySort = "date" | "salary" | "salary_desc" | "salary_asc" | "quality";

export type ListVacanciesParams = {
  citySlug: string;
  sphere?: string;
  professionSlug?: string;
  /** Фильтр «зарплата от», не поле самой вакансии. */
  salaryFrom?: number;
  schedule?: string;
  experience?: Experience;
  employmentType?: EmploymentType;
  districtSlug?: string;
  q?: string;
  sort?: VacancySort;
  page?: number;
  pageSize?: number;
  /** По умолчанию только местные (Закон 17). Вахты — отдельным запросом. */
  workFormat?: WorkFormat;
};

export type VacancyListItem = {
  id: string;
  slug: string;
  title: string;
  summaryLine: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: SalaryPeriod;
  salaryCurrency: string;
  citySlug: string;
  districtSlug: string | null;
  sphere: string;
  professionSlug: string | null;
  schedule: string | null;
  experience: Experience | null;
  employmentType: EmploymentType | null;
  workFormat: WorkFormat;
  workLocationText: string | null;
  workCitySlug: string | null;
  rotationPattern: string | null;
  publishedAt: Date;
  qualityScore: number;
  completeness: number;
  source: Source;
  sourceName: string | null;
  employer: {
    slug: string;
    name: string;
    isVerified: boolean;
  } | null;
};

export type ListVacanciesResult = {
  vacancies: VacancyListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export type VacancyDetail = VacancyListItem & {
  description: string;
  descriptionSections: Prisma.JsonValue | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  hoursPerDay: number | null;
  contactPhone: string | null;
  contactTelegram: string | null;
  contactEmail: string | null;
  sourceUrl: string | null;
  housingProvided: boolean;
  mealsProvided: boolean;
  travelPaid: boolean;
  employerKind: string;
  vahtaDays: number | null;
};

const listSelect = {
  id: true,
  slug: true,
  title: true,
  summaryLine: true,
  salaryFrom: true,
  salaryTo: true,
  salaryPeriod: true,
  salaryCurrency: true,
  citySlug: true,
  districtSlug: true,
  sphere: true,
  professionSlug: true,
  schedule: true,
  experience: true,
  employmentType: true,
  workFormat: true,
  workLocationText: true,
  workCitySlug: true,
  rotationPattern: true,
  publishedAt: true,
  qualityScore: true,
  completeness: true,
  source: true,
  sourceName: true,
  employer: {
    select: {
      slug: true,
      name: true,
      isVerified: true,
    },
  },
} satisfies Prisma.VacancySelect;

const detailSelect = {
  ...listSelect,
  description: true,
  descriptionSections: true,
  address: true,
  latitude: true,
  longitude: true,
  hoursPerDay: true,
  contactPhone: true,
  contactTelegram: true,
  contactEmail: true,
  sourceUrl: true,
  housingProvided: true,
  mealsProvided: true,
  travelPaid: true,
  employerKind: true,
  vahtaDays: true,
} satisfies Prisma.VacancySelect;

function publishedWhere(): Prisma.VacancyWhereInput {
  return {
    isActive: true,
    moderationStatus: { in: [ModerationStatus.AUTO_OK, ModerationStatus.APPROVED] },
  };
}

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

function salaryOrder(direction: Prisma.SortOrder): Prisma.VacancyOrderByWithRelationInput[] {
  return [
    { salaryFrom: { sort: direction, nulls: "last" } },
    { salaryTo: { sort: direction, nulls: "last" } },
  ];
}

function orderBy(sort: VacancySort | undefined): Prisma.VacancyOrderByWithRelationInput[] {
  switch (sort) {
    case "salary":
    case "salary_desc":
      return salaryOrder("desc");
    case "salary_asc":
      return salaryOrder("asc");
    case "quality":
      return [{ qualityScore: "desc" }, { publishedAt: "desc" }];
    default:
      return [{ publishedAt: "desc" }, { qualityScore: "desc" }];
  }
}

function buildListWhere(params: ListVacanciesParams): Prisma.VacancyWhereInput {
  const where: Prisma.VacancyWhereInput = {
    ...publishedWhere(),
    citySlug: params.citySlug,
    workFormat: params.workFormat ?? WorkFormat.LOCAL,
  };

  if (params.sphere) {
    where.sphere = params.sphere;
  }
  if (params.professionSlug) {
    where.professionSlug = params.professionSlug;
  }
  if (params.schedule) {
    where.schedule = params.schedule;
  }
  if (params.experience) {
    where.experience = params.experience;
  }
  if (params.employmentType) {
    where.employmentType = params.employmentType;
  }
  if (params.districtSlug) {
    where.districtSlug = params.districtSlug;
  }
  if (params.salaryFrom != null) {
    where.AND = [
      {
        OR: [
          { salaryFrom: { gte: params.salaryFrom } },
          { AND: [{ salaryFrom: null }, { salaryTo: { gte: params.salaryFrom } }] },
        ],
      },
    ];
  }
  const q = params.q?.trim();
  if (q) {
    const search: Prisma.VacancyWhereInput = {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { titleNormalized: { contains: q, mode: "insensitive" } },
        { summaryLine: { contains: q, mode: "insensitive" } },
      ],
    };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), search];
  }

  return where;
}

export async function listVacancies(params: ListVacanciesParams): Promise<ListVacanciesResult> {
  const page = clampPage(params.page);
  const pageSize = clampTake(params.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const where = buildListWhere(params);

  try {
    const vacancies = await prisma.vacancy.findMany({
      where,
      select: listSelect,
      orderBy: orderBy(params.sort),
      skip,
      take: pageSize,
    });

    // Короткая первая страница: число строк и есть total, второй запрос не нужен.
    // На пуле Supabase каждый лишний round-trip легко съедает бюджет 400 мс.
    const total =
      skip === 0 && vacancies.length < pageSize
        ? vacancies.length
        : await prisma.vacancy.count({ where });

    return {
      vacancies,
      total,
      page,
      pageSize,
      pages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  } catch (cause) {
    throw repoError("загрузить список вакансий", cause);
  }
}

export async function getVacancyBySlug(slug: string): Promise<VacancyDetail | null> {
  try {
    const vacancy = await prisma.vacancy.findFirst({
      where: { slug, ...publishedWhere() },
      select: detailSelect,
    });
    return vacancy;
  } catch (cause) {
    throw repoError("открыть вакансию", cause);
  }
}

export async function getSimilarVacancies(
  slug: string,
  limit = 4,
): Promise<VacancyListItem[]> {
  const take = clampTake(limit, 4, MAX_SIMILAR);

  try {
    const current = await prisma.vacancy.findFirst({
      where: { slug, ...publishedWhere() },
      select: { id: true, citySlug: true, sphere: true, professionSlug: true, workFormat: true },
    });
    if (!current) {
      return [];
    }

    const similarWhere: Prisma.VacancyWhereInput = {
      ...publishedWhere(),
      citySlug: current.citySlug,
      workFormat: current.workFormat,
      id: { not: current.id },
      ...(current.professionSlug
        ? { professionSlug: current.professionSlug }
        : { sphere: current.sphere }),
    };

    return await prisma.vacancy.findMany({
      where: similarWhere,
      select: listSelect,
      orderBy: [{ publishedAt: "desc" }, { qualityScore: "desc" }],
      take,
    });
  } catch (cause) {
    throw repoError("подобрать похожие вакансии", cause);
  }
}

export async function getLatestVacancies(
  citySlug: string,
  limit = 6,
): Promise<VacancyListItem[]> {
  const take = clampTake(limit, 6, MAX_LATEST);

  try {
    return await prisma.vacancy.findMany({
      where: {
        ...publishedWhere(),
        citySlug,
        workFormat: WorkFormat.LOCAL,
      },
      select: listSelect,
      orderBy: [{ publishedAt: "desc" }, { qualityScore: "desc" }],
      take,
    });
  } catch (cause) {
    throw repoError("загрузить свежие вакансии", cause);
  }
}

export async function countVacanciesByCity(citySlug: string): Promise<number> {
  try {
    return await wrap(`counts:city:${citySlug}`, COUNT_TTL_SECONDS, () =>
      prisma.vacancy.count({
        where: {
          ...publishedWhere(),
          citySlug,
          workFormat: WorkFormat.LOCAL,
        },
      }),
    );
  } catch (cause) {
    throw repoError("посчитать вакансии города", cause);
  }
}

export type SphereCount = {
  sphere: string;
  count: number;
};

export async function countVacanciesBySphere(citySlug: string): Promise<SphereCount[]> {
  try {
    return await wrap(`counts:sphere:${citySlug}`, COUNT_TTL_SECONDS, async () => {
      const groups = await prisma.vacancy.groupBy({
        by: ["sphere"],
        where: {
          ...publishedWhere(),
          citySlug,
          workFormat: WorkFormat.LOCAL,
        },
        _count: { _all: true },
      });
      return groups
        .map((group) => ({ sphere: group.sphere, count: group._count._all }))
        .sort((a, b) => b.count - a.count || a.sphere.localeCompare(b.sphere));
    });
  } catch (cause) {
    throw repoError("посчитать вакансии по сферам", cause);
  }
}
