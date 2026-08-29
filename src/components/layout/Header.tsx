import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CitySelect } from "@/components/layout/CitySelect";
import { LayoutSlot } from "@/components/layout/LayoutSlot";
import { QualitySwitcher } from "@/components/quality/QualitySwitcher";
import type { CityOption } from "@/lib/geo";

export function Header({
  citySlug,
  activeCities,
  soonCities,
}: {
  citySlug: string;
  activeCities: CityOption[];
  soonCities: CityOption[];
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="mx-auto flex min-h-header max-w-container flex-wrap items-center gap-3 px-4 py-2">
        <Link
          href={`/${citySlug}`}
          className="shrink-0 font-display text-md font-medium text-brand"
        >
          Террикон Работа
        </Link>
        <div className="min-w-0 flex-1">
          <CitySelect
            id="tr-city-header"
            currentSlug={citySlug}
            activeCities={activeCities}
            soonCities={soonCities}
          />
        </div>
        <div className="hidden min-w-0 max-w-xs md:block">
          <QualitySwitcher id="tr-quality-header" compact />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LayoutSlot />
          <Button type="button" variant="ghost" size="sm" disabled>
            Войти
          </Button>
          <span className="hidden md:contents">
            <Button type="button" variant="accent" size="sm" disabled>
              Разместить вакансию
            </Button>
          </span>
        </div>
      </div>
    </header>
  );
}
