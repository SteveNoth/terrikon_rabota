import { chipVariants } from "@/components/ui/chip-variants";
import { cn } from "@/lib/format/cn";
import { SORT_OPTIONS } from "@/lib/jobs/options";
import type { JobsSection } from "@/lib/jobs/search-cookie";
import { jobsHref } from "@/lib/jobs/url";
import type { ParsedVacancyQuery } from "@/lib/validation/vacancy-query";

export function JobsSort({
  citySlug,
  section,
  query,
}: {
  citySlug: string;
  section: JobsSection;
  query: ParsedVacancyQuery;
}) {
  return (
    <nav aria-label="Сортировка" className="flex min-w-0 flex-wrap gap-2">
      {SORT_OPTIONS.map((item) => {
        const current = query.sort === item.value;
        return (
          <a
            key={item.value}
            href={jobsHref(citySlug, section, query, { sort: item.value, page: 1 })}
            aria-current={current ? "true" : undefined}
            className={cn(chipVariants({ variant: current ? "active" : "outline" }))}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
