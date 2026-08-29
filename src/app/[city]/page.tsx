import { CityDevelopmentPlaceholder } from "@/components/geo/CityDevelopmentPlaceholder";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeHowItWorks } from "@/components/home/HomeHowItWorks";
import { HomeLatest } from "@/components/home/HomeLatest";
import { HomePlans } from "@/components/home/HomePlans";
import { HomeSpheres } from "@/components/home/HomeSpheres";
import {
  cityStaticParams,
  getCitySelectGroups,
  getPlannedCities,
  getSoonCities,
  isActiveCity,
  isSelectableCity,
  type CitySlug,
} from "@/lib/geo";
import { getSphere } from "@/lib/professions";
import { getRequestQuality } from "@/lib/quality/request";
import { listCategories } from "@/lib/repo/categories";
import { getPopularProfessions } from "@/lib/repo/professions";
import {
  countVacanciesBySphere,
  getLatestVacancies,
  HOME_LATEST_LIMIT,
} from "@/lib/repo/vacancies";
import { notFound } from "next/navigation";

/** Главная города: HTML можно переиспользовать 10 минут (ISR). */
export const revalidate = 600;

export function generateStaticParams() {
  return cityStaticParams();
}

export const dynamicParams = true;

const SPHERE_TILES = 8;

function notifiedFrom(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) {
    return value.includes("1");
  }
  return value === "1";
}

async function loadHome(citySlug: CitySlug) {
  const [{ features }, latest, popular, categories, sphereCounts, cityGroups] = await Promise.all([
    getRequestQuality(),
    getLatestVacancies(citySlug, HOME_LATEST_LIMIT),
    getPopularProfessions(citySlug),
    listCategories(),
    countVacanciesBySphere(citySlug),
    Promise.resolve(getCitySelectGroups()),
  ]);

  const countBySphere = new Map(sphereCounts.map((row) => [row.sphere, row.count]));
  const tiles = categories.slice(0, SPHERE_TILES).map((category) => {
    const sphere = getSphere(category.slug);
    return {
      slug: category.slug,
      name: sphere?.name ?? category.name,
      icon: sphere?.icon ?? "sphere-services",
      count: countBySphere.get(category.slug) ?? 0,
    };
  });

  return {
    features,
    latest,
    popular,
    tiles,
    activeCities: cityGroups.active,
    soonCities: cityGroups.soon,
  };
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { city: slug } = await params;
  if (!isSelectableCity(slug)) {
    notFound();
  }

  const query = await searchParams;
  const notified = notifiedFrom(query.notified);

  if (!isActiveCity(slug)) {
    return (
      <div className="px-4 py-8">
        <CityDevelopmentPlaceholder citySlug={slug} notified={notified} />
      </div>
    );
  }

  const home = await loadHome(slug);

  return (
    <div className="flex min-w-0 flex-col overflow-x-hidden pb-6">
      <HomeHero
        citySlug={slug}
        activeCities={home.activeCities}
        soonCities={home.soonCities}
        professions={home.popular}
      />
      <HomeLatest citySlug={slug} vacancies={home.latest} features={home.features} />
      <HomeSpheres citySlug={slug} tiles={home.tiles} />
      <HomeHowItWorks />
      <HomePlans soon={getSoonCities()} planned={getPlannedCities()} />
    </div>
  );
}
