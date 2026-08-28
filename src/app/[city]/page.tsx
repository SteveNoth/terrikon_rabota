import { CityDevelopmentPlaceholder } from "@/components/geo/CityDevelopmentPlaceholder";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import {
  cityName,
  cityStaticParams,
  isActiveCity,
  isSelectableCity,
} from "@/lib/geo";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return cityStaticParams();
}

export const dynamicParams = true;

function notifiedFrom(
  value: string | string[] | undefined,
): boolean {
  if (Array.isArray(value)) {
    return value.includes("1");
  }
  return value === "1";
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

  return (
    <div className="mx-auto flex max-w-container flex-col gap-4 px-4 py-8">
      <h1 className="font-display text-2xl font-medium">Найди работу в {cityName(slug, "loc")}</h1>
      <p className="text-muted">Скоро здесь появятся вакансии {cityName(slug, "gen")}.</p>
      <Link href={`/${slug}/jobs`} className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
        Смотреть вакансии
      </Link>
    </div>
  );
}
