import {
  EmployerKind,
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
import { getExternalDestination } from "@/lib/geo";
import { repoError } from "@/lib/repo/errors";

/** Сколько карточек на страницу, если в адресе ничего нет. Как в режиме Full/Lite. */
export const DEFAULT_PAGE_SIZE = 20;
/** Жёсткий потолок: «получить всё» через огромный pageSize нельзя. */
export const MAX_PAGE_SIZE = 50;
const MAX_LATEST = 24;
const MAX_SIMILAR = 8;
/** Счётчики и «свежие» на главной: 10 минут, как ISR страницы. Список выдачи не кэшируем. */
const HOME_TTL_SECONDS = 10 * 60;
export const HOME_LATEST_LIMIT = 6;

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
  publishedDays?: number;
  hasSalary?: boolean;
  verifiedOnly?: boolean;
  source?: Source;
  destination?: string;
  vahtaDays?: number;
  rotation?: string;
  housing?: boolean;
  meals?: boolean;
  travel?: boolean;
  direct?: boolean;
  employerSlug?: string;
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
  salaryIsGross: boolean | null;
  isActive: boolean;
  employer: {
    slug: string;
    name: string;
    isVerified: boolean;
    logoUrl: string | null;
  } | null;
};

export type VacancyRecord = VacancyListItem & {
  description: string;
  descriptionSections: Prisma.JsonValue | null;
  rawText: string | null;
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
  advancePayment: boolean;
  employerKind: EmployerKind;
  vahtaDays: number | null;
  lastSeenAt: Date;
  firstSeenAt: Date;
  aiProcessed: boolean;
  employer: {
    slug: string;
    name: string;
    isVerified: boolean;
    logoUrl: string | null;
    description: string | null;
  } | null;
  group: {
    postingsCount: number;
    sourcesCount: number;
    firstSeenAt: Date;
    vacancies: {
      source: Source;
      sourceName: string | null;
    }[];
  } | null;
};

export type ListVacanciesResult = {
  vacancies: VacancyListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
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
  salaryIsGross: true,
  isActive: true,
  employer: {
    select: {
      slug: true,
      name: true,
      isVerified: true,
      logoUrl: true,
    },
  },
} satisfies Prisma.VacancySelect;

const detailSelect = {
  ...listSelect,
  description: true,
  descriptionSections: true,
  rawText: true,
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
  advancePayment: true,
  employerKind: true,
  vahtaDays: true,
  lastSeenAt: true,
  firstSeenAt: true,
  aiProcessed: true,
  employer: {
    select: {
      slug: true,
      name: true,
      isVerified: true,
      logoUrl: true,
      description: true,
    },
  },
  group: {
    select: {
      postingsCount: true,
      sourcesCount: true,
      firstSeenAt: true,
      vacancies: {
        select: {
          source: true,
          sourceName: true,
        },
      },
    },
  },
} satisfies Prisma.VacancySelect;

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

/**
 * Единица выдачи: группа дублей считается один раз, одиночная вакансия — сама за себя
 * (раздел 11.17). Главная запись группы или вакансия без группы.
 */
function listingUnitWhere(): Prisma.VacancyWhereInput {
  return {
    OR: [{ groupId: null }, { primaryOfGroups: { some: {} } }],
  };
}

function destinationWhere(slug: string): Prisma.VacancyWhereInput | null {
  const dest = getExternalDestination(slug);
  if (!dest) {
    return null;
  }
  const needles = [...new Set([dest.name, dest.slug, ...dest.aliases].map((item) => item.trim()).filter(Boolean))];
  return {
    OR: [
      { workCitySlug: dest.slug },
      ...needles.map((needle) => ({
        workLocationText: { contains: needle, mode: "insensitive" as const },
      })),
    ],
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
  const and: Prisma.VacancyWhereInput[] = [listingUnitWhere()];

  if (params.sphere) {
    and.push({ sphere: params.sphere });
  }
  if (params.professionSlug) {
    and.push({ professionSlug: params.professionSlug });
  }
  if (params.schedule) {
    and.push({ schedule: params.schedule });
  }
  if (params.experience) {
    and.push({ experience: params.experience });
  }
  if (params.employmentType) {
    and.push({ employmentType: params.employmentType });
  }
  if (params.districtSlug) {
    and.push({ districtSlug: params.districtSlug });
  }
  if (params.salaryFrom != null) {
    and.push({
      OR: [
        { salaryFrom: { gte: params.salaryFrom } },
        { AND: [{ salaryFrom: null }, { salaryTo: { gte: params.salaryFrom } }] },
      ],
    });
  }
  if (params.hasSalary) {
    and.push({
      OR: [{ salaryFrom: { not: null } }, { salaryTo: { not: null } }],
    });
  }
  if (params.verifiedOnly) {
    and.push({ employer: { isVerified: true } });
  }
  if (params.source) {
    and.push({ source: params.source });
  }
  if (params.publishedDays) {
    const since = new Date(Date.now() - params.publishedDays * 24 * 60 * 60 * 1000);
    and.push({ publishedAt: { gte: since } });
  }
  if (params.destination) {
    const dest = destinationWhere(params.destination);
    if (dest) {
      and.push(dest);
    }
  }
  if (params.vahtaDays != null) {
    and.push({ vahtaDays: params.vahtaDays });
  }
  if (params.rotation) {
    and.push({ rotationPattern: params.rotation });
  }
  if (params.housing) {
    and.push({ housingProvided: true });
  }
  if (params.meals) {
    and.push({ mealsProvided: true });
  }
  if (params.travel) {
    and.push({ travelPaid: true });
  }
  if (params.direct) {
    and.push({ employerKind: EmployerKind.DIRECT });
  }
  if (params.employerSlug) {
    and.push({ employer: { slug: params.employerSlug } });
  }

  const q = params.q?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { titleNormalized: { contains: q, mode: "insensitive" } },
        { summaryLine: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return {
    ...publishedWhere(),
    citySlug: params.citySlug,
    workFormat: params.workFormat ?? WorkFormat.LOCAL,
    AND: and,
  };
}

/**
 * Один findMany с take/skip плюс отдельный count по тому же where.
 * Составной индекс (citySlug, isActive, workFormat, publishedAt) обслуживает
 * разделение вахт и местных. Как смотреть план: `node scripts/bench-vacancies.mjs`.
 */
export async function listVacancies(params: ListVacanciesParams): Promise<ListVacanciesResult> {
  const page = clampPage(params.page);
  const pageSize = clampTake(params.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const where = buildListWhere(params);

  try {
    const [vacancies, total] = await Promise.all([
      prisma.vacancy.findMany({
        where,
        select: listSelect,
        orderBy: orderBy(params.sort),
        skip,
        take: pageSize,
      }),
      prisma.vacancy.count({ where }),
    ]);

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

export async function getVacancyBySlug(
  slug: string,
  options?: { allowClosed?: boolean },
): Promise<VacancyRecord | null> {
  try {
    const vacancy = await prisma.vacancy.findFirst({
      where: { slug, ...(options?.allowClosed ? approvedWhere() : publishedWhere()) },
      select: detailSelect,
    });
    return vacancy;
  } catch (cause) {
    throw repoError("открыть вакансию", cause);
  }
}

export async function getSimilarVacancies(
  slug: string,
  limit = 3,
): Promise<VacancyListItem[]> {
  const take = clampTake(limit, 3, MAX_SIMILAR);

  try {
    const current = await prisma.vacancy.findFirst({
      where: { slug, ...publishedWhere() },
      select: { id: true, citySlug: true, sphere: true, workFormat: true },
    });
    if (!current) {
      return [];
    }

    const similarWhere: Prisma.VacancyWhereInput = {
      ...publishedWhere(),
      ...listingUnitWhere(),
      citySlug: current.citySlug,
      sphere: current.sphere,
      workFormat: current.workFormat,
      id: { not: current.id },
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
  limit = HOME_LATEST_LIMIT,
): Promise<VacancyListItem[]> {
  const take = clampTake(limit, HOME_LATEST_LIMIT, MAX_LATEST);

  try {
    return await wrap(`home:latest:${citySlug}:${take}`, HOME_TTL_SECONDS, () =>
      prisma.vacancy.findMany({
        where: {
          ...publishedWhere(),
          ...listingUnitWhere(),
          citySlug,
          workFormat: WorkFormat.LOCAL,
        },
        select: listSelect,
        orderBy: [{ publishedAt: "desc" }, { qualityScore: "desc" }],
        take,
      }),
    );
  } catch (cause) {
    throw repoError("загрузить свежие вакансии", cause);
  }
}

export async function countVacanciesByFormat(
  citySlug: string,
  workFormat: WorkFormat,
): Promise<number> {
  try {
    return await wrap(`counts:format:${citySlug}:${workFormat}`, HOME_TTL_SECONDS, () =>
      prisma.vacancy.count({
        where: {
          ...publishedWhere(),
          ...listingUnitWhere(),
          citySlug,
          workFormat,
        },
      }),
    );
  } catch (cause) {
    throw repoError("посчитать вакансии формата", cause);
  }
}

export async function countVacanciesByCity(citySlug: string): Promise<number> {
  return countVacanciesByFormat(citySlug, WorkFormat.LOCAL);
}

export type SphereCount = {
  sphere: string;
  count: number;
};

export type ProfessionCount = {
  professionSlug: string;
  count: number;
};

export async function countVacanciesByProfession(
  citySlug: string,
  limit = 8,
): Promise<ProfessionCount[]> {
  const take = clampTake(limit, 8, 24);

  try {
    return await wrap(`counts:profession:${citySlug}:${take}`, HOME_TTL_SECONDS, async () => {
      const groups = await prisma.vacancy.groupBy({
        by: ["professionSlug"],
        where: {
          ...publishedWhere(),
          ...listingUnitWhere(),
          citySlug,
          workFormat: WorkFormat.LOCAL,
          professionSlug: { not: null },
        },
        _count: { _all: true },
      });

      return groups
        .filter((group): group is { professionSlug: string; _count: { _all: number } } =>
          Boolean(group.professionSlug),
        )
        .map((group) => ({
          professionSlug: group.professionSlug,
          count: group._count._all,
        }))
        .sort((a, b) => b.count - a.count || a.professionSlug.localeCompare(b.professionSlug))
        .slice(0, take);
    });
  } catch (cause) {
    throw repoError("посчитать вакансии по профессиям", cause);
  }
}

export async function countVacanciesBySphere(citySlug: string): Promise<SphereCount[]> {
  try {
    return await wrap(`counts:sphere:${citySlug}`, HOME_TTL_SECONDS, async () => {
      const groups = await prisma.vacancy.groupBy({
        by: ["sphere"],
        where: {
          ...publishedWhere(),
          ...listingUnitWhere(),
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

/** Потолок точек на карте: кластеры справляются, HTML не раздуваем. */
export const MAX_MAP_POINTS = 500;

export type MapVacancyRecord = {
  id: string;
  slug: string;
  title: string;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: SalaryPeriod;
  salaryCurrency: string;
  districtSlug: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeAccuracy: import("@prisma/client").GeocodeAccuracy | null;
};

/**
 * Местные вакансии города для карты. Без description. Геокодер здесь не зовём.
 */
export async function listMapVacancies(params: {
  citySlug: string;
  sphere?: string;
  salaryFrom?: number;
  districtSlug?: string;
}): Promise<MapVacancyRecord[]> {
  const where = buildListWhere({
    citySlug: params.citySlug,
    sphere: params.sphere,
    salaryFrom: params.salaryFrom,
    districtSlug: params.districtSlug,
    workFormat: WorkFormat.LOCAL,
    pageSize: MAX_MAP_POINTS,
  });

  try {
    return await prisma.vacancy.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        salaryFrom: true,
        salaryTo: true,
        salaryPeriod: true,
        salaryCurrency: true,
        districtSlug: true,
        address: true,
        latitude: true,
        longitude: true,
        geocodeAccuracy: true,
      },
      orderBy: [{ publishedAt: "desc" }, { qualityScore: "desc" }],
      take: MAX_MAP_POINTS,
    });
  } catch (cause) {
    throw repoError("загрузить вакансии для карты", cause);
  }
}
