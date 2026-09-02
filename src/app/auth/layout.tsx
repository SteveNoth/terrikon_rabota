import { SiteChrome } from "@/components/layout/SiteChrome";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

async function citySlug(): Promise<string> {
  const jar = await cookies();
  const value = jar.get(CITY_COOKIE)?.value;
  if (value && isSelectableCity(value)) {
    return value;
  }
  return getDefaultCity().slug;
}

export default async function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <SiteChrome citySlug={await citySlug()}>
      <article className="mx-auto flex max-w-xl min-w-0 flex-col gap-4 px-4 py-8">{children}</article>
    </SiteChrome>
  );
}
