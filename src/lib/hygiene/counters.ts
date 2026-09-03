import { Prisma, WorkFormat } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { clearMemoryCache } from "@/lib/adapters/cache";
import { getAllCities } from "@/lib/geo";
import { log } from "@/lib/log";
import { listingUnitWhere, publishedWhere } from "@/lib/vacancy/listing-where";
import { storedSphereSnapshot, type SphereCountRow } from "@/lib/hygiene/sphere-snapshot";

export type { SphereCountRow } from "@/lib/hygiene/sphere-snapshot";

const publishedListingWhere: Prisma.VacancyWhereInput = {
  ...publishedWhere(),
  ...listingUnitWhere(),
};

export type CountRecompute = {
  cities: number;
  spheres: number;
  categories: number;
};

export async function recomputeVacancyCounts(): Promise<CountRecompute> {
  const now = new Date();
  const [groups, categories, cities] = await Promise.all([
    prisma.vacancy.groupBy({
      by: ["citySlug", "sphere", "workFormat"],
      where: publishedListingWhere,
      _count: true,
    }),
    prisma.category.findMany({ select: { slug: true } }),
    Promise.resolve(getAllCities()),
  ]);

  const localByCity = new Map<string, number>();
  const vahtaByCity = new Map<string, number>();
  const sphereByCity = new Map<string, Map<string, number>>();
  const sphereGlobal = new Map<string, number>();

  for (const row of groups) {
    const n = row._count;
    if (row.workFormat === WorkFormat.LOCAL) {
      localByCity.set(row.citySlug, (localByCity.get(row.citySlug) ?? 0) + n);
      const cityMap = sphereByCity.get(row.citySlug) ?? new Map<string, number>();
      cityMap.set(row.sphere, (cityMap.get(row.sphere) ?? 0) + n);
      sphereByCity.set(row.citySlug, cityMap);
    } else if (row.workFormat === WorkFormat.VAHTA) {
      vahtaByCity.set(row.citySlug, (vahtaByCity.get(row.citySlug) ?? 0) + n);
    }
    sphereGlobal.set(row.sphere, (sphereGlobal.get(row.sphere) ?? 0) + n);
  }

  const citySlugs = new Set<string>([
    ...cities.map((city) => city.slug),
    ...localByCity.keys(),
    ...vahtaByCity.keys(),
  ]);

  await prisma.$transaction([
    ...[...citySlugs].map((citySlug) =>
      prisma.cityStat.upsert({
        where: { citySlug },
        create: {
          citySlug,
          vacancyCount: localByCity.get(citySlug) ?? 0,
          vahtaCount: vahtaByCity.get(citySlug) ?? 0,
          updatedAt: now,
        },
        update: {
          vacancyCount: localByCity.get(citySlug) ?? 0,
          vahtaCount: vahtaByCity.get(citySlug) ?? 0,
          updatedAt: now,
        },
      }),
    ),
  ]);

  const sphereRows: { citySlug: string; sphere: string; vacancyCount: number }[] = [];
  for (const [citySlug, bySphere] of sphereByCity) {
    for (const [sphere, vacancyCount] of bySphere) {
      sphereRows.push({ citySlug, sphere, vacancyCount });
    }
  }

  await prisma.$transaction([
    prisma.sphereStat.deleteMany({}),
    ...sphereRows.map((row) =>
      prisma.sphereStat.create({
        data: { ...row, updatedAt: now },
      }),
    ),
    ...categories.map((category) =>
      prisma.category.update({
        where: { slug: category.slug },
        data: { vacancyCount: sphereGlobal.get(category.slug) ?? 0 },
      }),
    ),
  ]);

  clearMemoryCache();
  log.info("hygiene", "счётчики пересчитаны", {
    cities: citySlugs.size,
    spheres: sphereRows.length,
    categories: categories.length,
  });
  return {
    cities: citySlugs.size,
    spheres: sphereRows.length,
    categories: categories.length,
  };
}

export async function readStoredCityCount(
  citySlug: string,
  workFormat: WorkFormat,
): Promise<number | null> {
  const row = await prisma.cityStat.findUnique({
    where: { citySlug },
    select: { vacancyCount: true, vahtaCount: true },
  });
  if (!row) {
    return null;
  }
  if (workFormat === WorkFormat.VAHTA) {
    return row.vahtaCount;
  }
  if (workFormat === WorkFormat.LOCAL) {
    return row.vacancyCount;
  }
  return null;
}

export async function readStoredSphereCounts(citySlug: string): Promise<SphereCountRow[] | null> {
  const city = await prisma.cityStat.findUnique({
    where: { citySlug },
    select: { citySlug: true },
  });
  const rows = city
    ? await prisma.sphereStat.findMany({
        where: { citySlug },
        select: { sphere: true, vacancyCount: true },
      })
    : [];
  return storedSphereSnapshot(
    Boolean(city),
    rows
      .map((row) => ({ sphere: row.sphere, count: row.vacancyCount }))
      .sort((a, b) => b.count - a.count || a.sphere.localeCompare(b.sphere)),
  );
}
