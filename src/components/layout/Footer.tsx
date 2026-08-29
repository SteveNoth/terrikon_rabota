import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import { CitySelect } from "@/components/layout/CitySelect";
import { LayoutSlot } from "@/components/layout/LayoutSlot";
import { QualitySwitcher } from "@/components/quality/QualitySwitcher";
import type { CityOption } from "@/lib/geo";

export function Footer({
  citySlug,
  activeCities,
  soonCities,
}: {
  citySlug: string;
  activeCities: CityOption[];
  soonCities: CityOption[];
}) {
  return (
    <footer className="mt-8 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-container flex-col gap-4 px-4 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link href={`/${citySlug}`} className="font-display text-md font-medium text-brand">
            Террикон Работа
          </Link>
          <div className="max-w-xs min-w-0">
            <CitySelect
              id="tr-city-footer"
              currentSlug={citySlug}
              activeCities={activeCities}
              soonCities={soonCities}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LayoutSlot />
            <Button type="button" variant="ghost" size="sm" disabled>
              Войти
            </Button>
            <Button type="button" variant="outline" size="sm" disabled>
              Разместить вакансию
            </Button>
          </div>
        </div>
        <Divider />
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/safety" className="text-brand underline-offset-2 hover:underline">
            Как не попасться при поиске работы
          </Link>
        </div>
        <div className="max-w-md min-w-0">
          <QualitySwitcher id="tr-quality-footer" />
        </div>
        <p className="text-sm text-muted">Региональный агрегатор вакансий</p>
      </div>
    </footer>
  );
}
