import { MapPage } from "@/components/map/MapPage";
import { cityName, cityStaticParams, isSelectableCity } from "@/lib/geo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return cityStaticParams();
}

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  if (!isSelectableCity(slug)) {
    return { title: "Карта вакансий" };
  }
  return {
    title: `Карта вакансий ${cityName(slug, "gen")} | Террикон Работа`,
    description: `Адреса местных вакансий ${cityName(slug, "gen")} на карте.`,
  };
}

export default async function CityMapRoute({
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

  return <MapPage citySlug={slug} searchParams={await searchParams} />;
}
