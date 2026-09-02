import { SiteChrome } from "@/components/layout/SiteChrome";
import { cityStaticParams, getDefaultCity, isSelectableCity } from "@/lib/geo";
import type { ReactNode } from "react";

export function generateStaticParams() {
  return cityStaticParams();
}

export const dynamicParams = true;

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
