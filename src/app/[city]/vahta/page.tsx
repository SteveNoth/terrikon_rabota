import { JobsListing } from "@/components/jobs/JobsListing";
import { cityStaticParams, isSelectableCity } from "@/lib/geo";
import { jobsRouteMetadata } from "@/lib/seo/pages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return cityStaticParams();
}

export const dynamicParams = true;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  return jobsRouteMetadata(slug, "vahta", await searchParams);
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
