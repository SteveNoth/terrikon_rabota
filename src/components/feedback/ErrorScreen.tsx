"use client";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";

export function ErrorScreen({
  title,
  description,
  homeHref,
  onRetry,
}: {
  title: string;
  description: string;
  homeHref: string;
  onRetry?: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-container flex-col items-start justify-center gap-4 p-6">
      <h1 className="text-xl">{title}</h1>
      <p className="max-w-prose text-md text-muted">{description}</p>
      <div className="flex flex-wrap gap-2">
        <a className={cn(buttonVariants({ variant: "primary" }))} href={homeHref}>
          Вернуться
        </a>
        {onRetry ? (
          <button type="button" className={cn(buttonVariants({ variant: "outline" }))} onClick={onRetry}>
            Попробовать снова
          </button>
        ) : null}
      </div>
    </main>
  );
}
