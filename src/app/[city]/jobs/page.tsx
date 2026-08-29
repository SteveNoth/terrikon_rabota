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
  searchParams,
}: {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const query = await searchParams;
  const rawQ = query.q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim() ?? "";

  return (
    <div className="mx-auto flex max-w-container min-w-0 flex-col gap-4 px-4 py-8">
      <h1 className="font-display text-2xl font-medium">Вакансии {cityName(slug, "gen")}</h1>
      {q ? (
        <p className="break-words text-muted">
          Запрос: «{q}». Форма отправила его в адрес страницы — так поиск работает без JavaScript.
        </p>
      ) : (
        <p className="text-muted">Список вакансий скоро появится.</p>
      )}
    </div>
  );
}
