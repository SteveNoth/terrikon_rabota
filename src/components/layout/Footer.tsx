import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import { CitySelect } from "@/components/layout/CitySelect";
import { LayoutSlot } from "@/components/layout/LayoutSlot";
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
        <p className="text-sm text-muted">Региональный агрегатор вакансий</p>
      </div>
    </footer>
  );
}
