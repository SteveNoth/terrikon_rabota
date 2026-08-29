"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const paginationVariants = cva("flex flex-wrap items-center gap-2", {
  variants: {
    align: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
    },
  },
  defaultVariants: { align: "center" },
});

export type PaginationPageLink = {
  page: number;
  href: string;
  current?: boolean;
};

export type PaginationProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof paginationVariants> & {
    page: number;
    pageCount: number;
    prevHref?: string | null;
    nextHref?: string | null;
    pages?: PaginationPageLink[];
    /** Только «назад / вперёд» — для Full/Lite рядом с «Показать ещё». */
    compact?: boolean;
  };

/**
 * Пагинация — обычные ссылки, а не кнопки с JavaScript.
 * Поисковик ходит по HTML: он открывает <a href="?page=2">, а «подгрузить ещё»
 * из скрипта не видит. Без этих ссылок вторая страница списка не попадёт в индекс.
 *
 * href приходит строкой: клиентскому компоненту нельзя передавать функцию со сервера.
 */
export function Pagination({
  className,
  align,
  page,
  pageCount,
  prevHref,
  nextHref,
  pages = [],
  compact = false,
  ...props
}: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label="Страницы" className={cn(paginationVariants({ align }), className)} {...props}>
      {prevHref ? (
        <a
          href={prevHref}
          rel="prev"
          aria-label="Предыдущая страница"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Icon name="chevron-left" size="sm" decorative />
          Назад
        </a>
      ) : null}

      {compact
        ? null
        : pages.map((item, index) =>
            item.page < 0 ? (
              <span key={`gap-${index}`} className="px-1 text-muted" aria-hidden="true">
                …
              </span>
            ) : (
              <a
                key={item.page}
                href={item.href}
                aria-label={`Страница ${item.page}`}
                aria-current={item.current ? "page" : undefined}
                className={buttonVariants({
                  variant: item.current ? "primary" : "outline",
                  size: "sm",
                })}
              >
                {item.page}
              </a>
            ),
          )}

      {nextHref ? (
        <a
          href={nextHref}
          rel="next"
          aria-label="Следующая страница"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Вперёд
          <Icon name="chevron-right" size="sm" decorative />
        </a>
      ) : null}
    </nav>
  );
}
