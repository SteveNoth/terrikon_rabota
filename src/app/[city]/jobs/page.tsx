import { CityDevelopmentPlaceholder } from "@/components/geo/CityDevelopmentPlaceholder";
import {
  cityName,
  cityStaticParams,
  isActiveCity,
  isSelectableCity,
} from "@/lib/geo";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return cityStaticParams();
}

export const dynamicParams = true;

export default async function CityJobsPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: slug } = await params;
  if (!isSelectableCity(slug)) {
    notFound();
  }

  if (!isActiveCity(slug)) {
    return (
      <div className="px-4 py-8">
        <CityDevelopmentPlaceholder citySlug={slug} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-container flex-col gap-4 px-4 py-8">
      <h1 className="font-display text-2xl font-medium">Вакансии {cityName(slug, "gen")}</h1>
      <p className="text-muted">Список вакансий скоро появится.</p>
    </div>
  );
}
