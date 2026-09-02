import { VacancyCard } from "@/components/vacancy/VacancyCard";
import { OfflineCapture } from "@/components/offline/OfflineCapture";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/format/cn";
import type { CitySlug } from "@/lib/geo";
import type { QualityFeatures } from "@/lib/quality/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import Link from "next/link";

export function HomeLatest({
  citySlug,
  vacancies,
  features,
}: {
  citySlug: CitySlug;
  vacancies: VacancyListItem[];
  features: Pick<QualityFeatures, "descriptionPreview" | "images">;
}) {
  return (
    <section className="mx-auto flex w-full max-w-container min-w-0 flex-col gap-4 px-4 py-6">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl font-medium">Свежие вакансии</h2>
        <Link
          href={`/${citySlug}/jobs`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Все вакансии
        </Link>
      </div>

      {vacancies.length === 0 ? (
        <EmptyState
          title="Пока нет местных вакансий"
          description="Как только появятся объявления, они отобразятся здесь."
        />
      ) : (
        <>
          <OfflineCapture vacancies={vacancies} />
          <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vacancies.map((vacancy) => (
            <li key={vacancy.id} className="min-w-0">
              <VacancyCard vacancy={vacancy} features={features} />
            </li>
          ))}
          </ul>
        </>
      )}
    </section>
  );
}
