"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { NotifyOpenForm } from "@/components/geo/NotifyOpenForm";
import { IfMode } from "@/components/quality/IfMode";
import {
  cityName,
  getCity,
  getDefaultCity,
  type CitySlug,
} from "@/lib/geo";
import { TerriconMark } from "@/components/brand/TerriconMark";

function TerriconSilhouette() {
  return (
    <IfMode
      feature="images"
      is="none"
      fallback={
        <TerriconMark className="size-16 motion-safe:transition-opacity duration-normal" />
      }
    >
      <span className="text-3xl text-brand" aria-hidden="true">
        ▲
      </span>
    </IfMode>
  );
}

export function CityDevelopmentPlaceholder({
  citySlug,
  notified = false,
  heading = "page",
}: {
  citySlug: CitySlug;
  notified?: boolean;
  heading?: "page" | "section";
}) {
  const city = getCity(citySlug);
  if (!city) {
    return null;
  }

  const fallback = getDefaultCity();
  const Title = heading === "section" ? "h2" : "h1";

  return (
    <Card className="mx-auto flex max-w-container flex-col items-center gap-4 text-center" padding="lg">
      <TerriconSilhouette />
      <p className="text-sm text-muted">В процессе разработки</p>
      <Title className="font-display text-2xl font-medium">
        Скоро откроемся в {cityName(city.slug, "loc")}
      </Title>
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
