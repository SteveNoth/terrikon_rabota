import { chipVariants } from "@/components/ui/chip-variants";
import { cn } from "@/lib/format/cn";
import type { CitySlug } from "@/lib/geo";
import type { JobsSection } from "@/lib/jobs/search-cookie";
import { jobsHref, queryForTabSwitch } from "@/lib/jobs/url";
import type { ParsedVacancyQuery } from "@/lib/validation/vacancy-query";

export function JobsTabs({
  citySlug,
  section,
  query,
  localCount,
  vahtaCount,
}: {
  citySlug: CitySlug;
  section: JobsSection;
  query: ParsedVacancyQuery;
  localCount: number;
  vahtaCount: number;
}) {
  const shared = queryForTabSwitch(query);
  const jobsUrl = jobsHref(citySlug, "jobs", { ...shared, workFormat: "LOCAL" });
  const vahtaUrl = jobsHref(citySlug, "vahta", { ...shared, workFormat: "VAHTA" });

  return (
    <nav aria-label="Формат работы" className="flex min-w-0 flex-wrap items-center gap-2">
      <a
        href={jobsUrl}
        aria-current={section === "jobs" ? "page" : undefined}
        className={cn(chipVariants({ variant: section === "jobs" ? "active" : "outline" }))}
      >
        Вакансии
        <span className="font-normal opacity-80">· {localCount}</span>
      </a>
      <a
        href={vahtaUrl}
        aria-current={section === "vahta" ? "page" : undefined}
        className={cn(
          chipVariants({ variant: section === "vahta" ? "active" : "accent" }),
          section === "vahta" ? undefined : "border-accent",
        )}
      >
        Вахта
        <span className="font-normal">· {vahtaCount}</span>
      </a>
    </nav>
  );
}
