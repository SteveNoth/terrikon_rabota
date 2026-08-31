import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { OfflineBanner } from "@/components/quality/OfflineBanner";
import { getUser } from "@/lib/adapters/auth";
import { getCitySelectGroups } from "@/lib/geo";
import type { ReactNode } from "react";

export async function SiteChrome({
  citySlug,
  children,
}: {
  citySlug: string;
  children: ReactNode;
}) {
  const { active, soon } = getCitySelectGroups();
  const user = await getUser();
  const accountHref =
    user?.role === "EMPLOYER" ? "/employer/dashboard" : user ? "/auth/account" : "/auth/login";

  return (
    <div className="flex min-h-full flex-col pb-bottomnav-plus md:pb-0">
      <OfflineBanner />
      <Header citySlug={citySlug} activeCities={active} soonCities={soon} user={user} />
      <main className="flex-1">{children}</main>
      <Footer citySlug={citySlug} activeCities={active} soonCities={soon} user={user} />
      <BottomNav citySlug={citySlug} accountHref={accountHref} />
    </div>
  );
}
