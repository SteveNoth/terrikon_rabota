"use client";

import { VacancyList } from "@/components/jobs/VacancyList";
import { buttonVariants } from "@/components/ui/button-variants";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/format/cn";
import type { QualityFeatures } from "@/lib/quality/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import { useState, type MouseEvent } from "react";

function withPage(path: string, query: string, page: number): string {
  const params = new URLSearchParams(query);
  if (page > 1) {
    params.set("page", String(page));
  } else {
    params.delete("page");
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * «Показать ещё» — ссылка на ?page=N. Без JavaScript браузер просто открывает
 * следующую страницу. С JavaScript мы докидываем карточки и обновляем адрес,
 * чтобы его можно было скопировать. Поисковику нужен именно href: он не жмёт
 * на кнопки из скрипта и иначе не увидит страницу 2.
 */
export function VacanciesFeed({
  vacancies,
  page,
  pages,
  path,
  query,
  apiQuery,
  features,
  safetyLink = false,
}: {
  vacancies: VacancyListItem[];
  page: number;
  pages: number;
  path: string;
  /** Текущие фильтры без page — состояние живёт в адресе. */
  query: string;
  /** Query string для /api/vacancies, тоже без page. */
  apiQuery: string;
  features: Pick<QualityFeatures, "descriptionPreview" | "images">;
  safetyLink?: boolean;
}) {
  const [items, setItems] = useState(vacancies);
  const [current, setCurrent] = useState(page);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasMore = current < pages;
  const nextPage = current + 1;
  const nextHref = withPage(path, query, nextPage);

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!hasMore || pending) {
      return;
    }
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams(apiQuery);
      params.set("page", String(nextPage));
      const response = await fetch(`/api/vacancies?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error("bad status");
      }
      const data = (await response.json()) as { vacancies?: VacancyListItem[] };
      const extra = Array.isArray(data.vacancies) ? data.vacancies : [];
      setItems((prev) => [...prev, ...extra]);
      setCurrent(nextPage);
      window.history.replaceState(null, "", withPage(path, query, nextPage));
    } catch {
      setError("Не удалось подгрузить. Откройте следующую страницу по ссылке.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <VacancyList vacancies={items} features={features} safetyLink={safetyLink} />
      {hasMore ? (
        <p>
          <a
            href={nextHref}
            rel="next"
            onClick={onClick}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {pending ? (
              <>
                <Spinner size="sm" />
                Загрузка
              </>
            ) : (
              "Показать ещё"
            )}
          </a>
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
