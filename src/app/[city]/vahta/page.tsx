import { JobsListing } from "@/components/jobs/JobsListing";
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
    return { title: "Вахта" };
  }
  return {
    title: `Вахта из ${cityName(slug, "gen")} | Террикон Работа`,
    description: `Вахтовые вакансии, набор из ${cityName(slug, "gen")}. Место работы — не здесь.`,
  };
}

export default async function CityVahtaPage({
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

  return <JobsListing citySlug={slug} section="vahta" searchParams={await searchParams} />;
}
