import { BrandLockup } from "@/components/brand/BrandLockup";
import { TelegramChannelLink } from "@/components/brand/TelegramChannelLink";
import { AccountLinks } from "@/components/auth/AccountLinks";
import { CitySelect } from "@/components/layout/CitySelect";
import { LayoutSlot } from "@/components/layout/LayoutSlot";
import { QualitySwitcher } from "@/components/quality/QualitySwitcher";
import { SupportHeaderButton } from "@/components/support/SupportHeaderButton";
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
      <div className="site-header-bar">
        <BrandLockup href={`/${citySlug}`} className="site-header-brand" />
        <div className="site-header-heart">
          <LayoutSlot>
            <SupportHeaderButton />
          </LayoutSlot>
        </div>
        <div className="site-header-tools">
          <div className="site-header-city">
            <CitySelect
              id="tr-city-header"
              currentSlug={citySlug}
              activeCities={activeCities}
              soonCities={soonCities}
            />
          </div>
          <QualitySwitcher id="tr-quality-header" compact className="site-header-quality" />
        </div>
        <TelegramChannelLink className="site-header-tg" />
        <AccountLinks citySlug={citySlug} user={user} compact className="site-header-account" />
      </div>
    </header>
  );
}
