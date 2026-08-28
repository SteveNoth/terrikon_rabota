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

export type PaginationProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof paginationVariants> & {
    page: number;
    pageCount: number;
    hrefForPage: (page: number) => string;
  };

export function Pagination({
  className,
  align,
  page,
  pageCount,
  hrefForPage,
  ...props
}: PaginationProps) {
  const prev = Math.max(1, page - 1);
  const next = Math.min(pageCount, page + 1);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <nav aria-label="Страницы" className={cn(paginationVariants({ align }), className)} {...props}>
      <a
        href={hrefForPage(prev)}
        aria-label="Предыдущая страница"
        aria-disabled={page <= 1}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          page <= 1 && "pointer-events-none opacity-60",
        )}
      >
        <Icon name="chevron-left" size="sm" decorative />
      </a>
      {pages.map((item) => (
        <a
          key={item}
          href={hrefForPage(item)}
          aria-label={`Страница ${item}`}
          aria-current={item === page ? "page" : undefined}
          className={buttonVariants({
            variant: item === page ? "primary" : "outline",
            size: "sm",
          })}
        >
          {item}
        </a>
      ))}
      <a
        href={hrefForPage(next)}
        aria-label="Следующая страница"
        aria-disabled={page >= pageCount}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          page >= pageCount && "pointer-events-none opacity-60",
        )}
      >
        <Icon name="chevron-right" size="sm" decorative />
      </a>
    </nav>
  );
}
