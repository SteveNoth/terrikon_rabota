import { SiteChrome } from "@/components/layout/SiteChrome";
import { FavoriteMigrator } from "@/components/seeker/FavoriteMigrator";
import { requireUser } from "@/lib/auth/guard";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const fromHeader = headerList.get("x-tr-path");
  const next = fromHeader && fromHeader.startsWith("/profile") ? fromHeader : "/profile";
  const user = await requireUser(next);
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
      <FavoriteMigrator />
      <div className="mx-auto flex max-w-container min-w-0 flex-col gap-6 px-4 py-8">{children}</div>
    </SiteChrome>
  );
}
