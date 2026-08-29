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

/**
 * Этап 15 соберёт дубли в группы. Счётчик и выдача считают группу один раз,
 * а не каждое размещение (раздел 11.17): одна вахта из восьми групп — одна вакансия.
 *
 * Пока групп нет, у всех `groupId` пустой, и условие совпадает с «все опубликованные».
 * Когда появятся группы, менять нужно только эту функцию: главная запись группы
 * или вакансия без группы. `listVacancies` и `count` берут её из одного `where`.
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
