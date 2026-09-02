import { SiteChrome } from "@/components/layout/SiteChrome";
import { requireEmployer } from "@/lib/auth/guard";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmployerLayout({ children }: { children: ReactNode }) {
  const user = await requireEmployer();
  const jar = await cookies();
  const cookieCity = jar.get(CITY_COOKIE)?.value;
  const citySlug =
    cookieCity && isSelectableCity(cookieCity)
      ? cookieCity
      : isSelectableCity(user.citySlug)
        ? user.citySlug
        : getDefaultCity().slug;

  return (
    <SiteChrome citySlug={citySlug}>
      <div className="mx-auto flex max-w-container min-w-0 flex-col gap-6 px-4 py-8">{children}</div>
    </SiteChrome>
  );
}
