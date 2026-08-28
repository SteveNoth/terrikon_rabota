"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { NotifyOpenForm } from "@/components/geo/NotifyOpenForm";
import { useUiMode } from "@/components/ui/mode-provider";
import {
  cityName,
  getCity,
  getDefaultCity,
  type CitySlug,
} from "@/lib/geo";
import { cn } from "@/lib/format/cn";

function TerriconSilhouette() {
  const { mode } = useUiMode();

  if (mode === "ultra") {
    return (
      <span className="text-3xl text-brand" aria-hidden="true">
        ▲
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 80 56"
      className="size-16 text-brand motion-safe:transition-opacity duration-normal"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 48 L28 18 L40 32 L52 12 L72 48 Z"
        className="fill-current opacity-30"
      />
      <path
        d="M12 48 L32 22 L40 34 L50 16 L68 48 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M4 50 H76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CityDevelopmentPlaceholder({
  citySlug,
  notified = false,
}: {
  citySlug: CitySlug;
  notified?: boolean;
}) {
  const city = getCity(citySlug);
  if (!city) {
    return null;
  }

  const fallback = getDefaultCity();

  return (
    <Card className="mx-auto flex max-w-container flex-col items-center gap-4 text-center" padding="lg">
      <TerriconSilhouette />
      <p className="text-sm text-muted">В процессе разработки</p>
      <h1 className="font-display text-2xl font-medium">
        Скоро откроемся в {cityName(city.slug, "loc")}
      </h1>
      <p className="max-w-md text-md text-muted">
        Мы уже настраиваем сбор вакансий {cityName(city.slug, "gen")}. Оставь адрес — сообщим,
        когда откроем.
      </p>
      <NotifyOpenForm citySlug={city.slug} notified={notified} />
      <Link
        href={`/${fallback.slug}/jobs`}
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        Смотреть вакансии {cityName(fallback.slug, "gen")}
      </Link>
      <Link href="/about#plans" className="text-sm text-brand">
        Все планы развития
      </Link>
    </Card>
  );
}
