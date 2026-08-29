import { SiteChrome } from "@/components/layout/SiteChrome";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Вход | Террикон Работа",
  description: "Войти, чтобы откликнуться на вакансию.",
};

function cityFromCookie(value: string | undefined): string {
  if (value && isSelectableCity(value)) {
    return value;
  }
  return getDefaultCity().slug;
}

function nextPath(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const jar = await cookies();
  const citySlug = cityFromCookie(jar.get(CITY_COOKIE)?.value);
  const query = await searchParams;
  const next = nextPath(query.next) ?? `/${citySlug}/jobs`;

  return (
    <SiteChrome citySlug={citySlug}>
      <article className="mx-auto flex max-w-container min-w-0 flex-col gap-4 px-4 py-8">
        <h1 className="font-display text-2xl font-medium">Вход</h1>
        <p className="max-w-xl text-md text-muted">
          Смотреть вакансии можно без регистрации. Чтобы откликнуться, позже понадобится аккаунт —
          сейчас вход ещё не подключен.
        </p>
        <p>
          <Link href={next} className={cn(buttonVariants({ variant: "primary" }))}>
            Вернуться к вакансии
          </Link>
        </p>
      </article>
    </SiteChrome>
  );
}
