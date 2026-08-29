import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { cityName, type CitySlug } from "@/lib/geo";
import type { JobsSection } from "@/lib/jobs/search-cookie";
import { jobsPath } from "@/lib/jobs/url";
import Link from "next/link";

export function JobsEmpty({
  citySlug,
  section,
  resetHref,
  filtered,
  otherCount,
}: {
  citySlug: CitySlug;
  section: JobsSection;
  resetHref: string;
  filtered: boolean;
  otherCount: number;
}) {
  const otherHref = jobsPath(citySlug, section === "jobs" ? "vahta" : "jobs");
  const otherLabel =
    section === "jobs"
      ? `Посмотреть вахту из ${cityName(citySlug, "gen")}`
      : `Посмотреть местные вакансии ${cityName(citySlug, "gen")}`;

  return (
    <EmptyState
      title="Ничего не нашли"
      description={
        filtered
          ? "По этому набору условий объявлений нет. Часто помогает убрать зарплату или район."
          : "Сейчас нет подходящих объявлений."
      }
      action={
        <div className="flex min-w-0 flex-col items-center gap-3">
          {filtered ? (
            <Link href={resetHref} className={cn(buttonVariants({ variant: "primary" }))}>
              Сбросить фильтры
            </Link>
          ) : null}
          {otherCount > 0 ? (
            <Link href={otherHref} className={cn(buttonVariants({ variant: "outline" }))}>
              {otherLabel}
              <span className="text-muted">· {otherCount}</span>
            </Link>
          ) : null}
        </div>
      }
    >
      <ul className="flex max-w-md list-disc flex-col gap-1 pl-5 text-left text-sm text-muted">
        <li>Попробуйте другое слово в поиске — «сварщик», а не «электрогазосварщик 5 разряда».</li>
        <li>Уберите «только с зарплатой» и «только проверенные» — часть объявлений без цифр.</li>
        {section === "jobs" ? (
          <li>Вахта в общий список не попадает: если готовы уехать, откройте вкладку «Вахта».</li>
        ) : (
          <li>Проверьте место работы и схему смен — фильтры вахты строже, чем у местных.</li>
        )}
      </ul>
    </EmptyState>
  );
}
