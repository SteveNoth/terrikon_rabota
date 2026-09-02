import { MapPage } from "@/components/map/MapPage";
import { cityStaticParams, isSelectableCity } from "@/lib/geo";
import { mapRouteMetadata } from "@/lib/seo/pages";
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
  return mapRouteMetadata(slug);
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
