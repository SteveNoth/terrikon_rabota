import { BrandLockup } from "@/components/brand/BrandLockup";
import { TelegramChannelLink } from "@/components/brand/TelegramChannelLink";
import { AccountLinks } from "@/components/auth/AccountLinks";
import { CitySelect } from "@/components/layout/CitySelect";
import { LayoutSlot } from "@/components/layout/LayoutSlot";
import { QualitySwitcher } from "@/components/quality/QualitySwitcher";
import type { AuthUser } from "@/lib/adapters/auth";
import type { CityOption } from "@/lib/geo";

export function Header({
  citySlug,
  activeCities,
  soonCities,
  user,
}: {
  citySlug: string;
  activeCities: CityOption[];
  soonCities: CityOption[];
  user: AuthUser | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="mx-auto flex min-h-header max-w-container flex-wrap items-center gap-3 px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <BrandLockup href={`/${citySlug}`} />
          <TelegramChannelLink />
        </div>
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
          <AccountLinks citySlug={citySlug} user={user} compact />
        </div>
      </div>
    </header>
  );
}
