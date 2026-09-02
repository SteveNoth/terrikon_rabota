import { prisma } from "@/lib/adapters/db";
import { cityDisplayName, getAllCities, type CityStatus } from "@/lib/geo";

export type AdminCityRow = {
  slug: string;
  name: string;
  region: string;
  status: CityStatus;
  collected: number;
  active: number;
};

export async function listAdminCities(): Promise<AdminCityRow[]> {
  const cities = getAllCities();
  const [collected, active] = await Promise.all([
    prisma.vacancy.groupBy({ by: ["citySlug"], _count: true }),
    prisma.vacancy.groupBy({
      by: ["citySlug"],
      where: { isActive: true, moderationStatus: { in: ["AUTO_OK", "APPROVED"] } },
      _count: true,
    }),
  ]);
  const collectedMap = new Map(collected.map((row) => [row.citySlug, row._count]));
  const activeMap = new Map(active.map((row) => [row.citySlug, row._count]));
  return cities.map((city) => ({
    slug: city.slug,
    name: cityDisplayName(city.slug),
    region: city.region,
    status: city.status,
    collected: collectedMap.get(city.slug) ?? 0,
    active: activeMap.get(city.slug) ?? 0,
  }));
}

export function cityStatusLabel(status: CityStatus): string {
  if (status === "active") {
    return "активен";
  }
  if (status === "soon") {
    return "скоро";
  }
  return "в планах";
}
