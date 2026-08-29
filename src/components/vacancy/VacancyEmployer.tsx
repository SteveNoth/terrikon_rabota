import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { VacancyView } from "@/lib/vacancy/view";
import Link from "next/link";

export function VacancyEmployer({ employer }: { employer: NonNullable<VacancyView["employer"]> }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="font-display text-xl font-medium">О работодателе</h2>
      <p className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 break-words font-medium">{employer.name}</span>
        {employer.isVerified ? (
          <Badge tone="success" className="inline-flex items-center gap-1">
            <Icon name="check" size="sm" decorative />
            Проверено
          </Badge>
        ) : null}
      </p>
      {employer.description ? (
        <p className="min-w-0 break-words text-md text-muted">{employer.description}</p>
      ) : null}
      <p>
        <Link href={employer.vacanciesHref} className="text-brand underline-offset-2 hover:underline">
          Все вакансии этого работодателя
        </Link>
      </p>
    </section>
  );
}
