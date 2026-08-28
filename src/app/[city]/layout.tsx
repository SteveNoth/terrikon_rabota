import { SiteChrome } from "@/components/layout/SiteChrome";
import { cityName, cityStaticParams, getDefaultCity, isSelectableCity } from "@/lib/geo";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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
    return { title: "Такого города у нас нет" };
  }

  return {
    title: `Работа в ${cityName(slug, "loc")} | Террикон Работа`,
    description: `Вакансии ${cityName(slug, "gen")}`,
  };
}

export default async function CityLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ city: string }>;
}) {
  const { city: slug } = await params;
  const citySlug = isSelectableCity(slug) ? slug : getDefaultCity().slug;

  return <SiteChrome citySlug={citySlug}>{children}</SiteChrome>;
}
