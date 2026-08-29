import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { OfflineBanner } from "@/components/quality/OfflineBanner";
import { getCitySelectGroups } from "@/lib/geo";
import type { ReactNode } from "react";

export function SiteChrome({
  citySlug,
  children,
}: {
  citySlug: string;
  children: ReactNode;
}) {
  const { active, soon } = getCitySelectGroups();

  return (
    <div className="flex min-h-full flex-col pb-bottomnav-plus md:pb-0">
      <OfflineBanner />
      <Header citySlug={citySlug} activeCities={active} soonCities={soon} />
      <main className="flex-1">{children}</main>
      <Footer citySlug={citySlug} activeCities={active} soonCities={soon} />
      <BottomNav citySlug={citySlug} />
    </div>
  );
}
