import { OfflineLibrary } from "@/components/offline/OfflineLibrary";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { CITY_COOKIE, cityName, getDefaultCity, isCitySlug, isSelectableCity } from "@/lib/geo";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Без интернета | Террикон Работа",
  description: "Что доступно без сети: сохранённые вакансии, избранное и последние поиски.",
  robots: { index: false, follow: false },
};

function cityFromCookie(value: string | undefined): string {
  if (value && isSelectableCity(value)) {
    return value;
  }
  return getDefaultCity().slug;
}

export default async function OfflinePage() {
  const jar = await cookies();
  const citySlug = cityFromCookie(jar.get(CITY_COOKIE)?.value);
  const cityLabel = isCitySlug(citySlug) ? cityName(citySlug, "nom") : citySlug;

  return (
    <SiteChrome citySlug={citySlug}>
      <article className="mx-auto flex max-w-container min-w-0 flex-col gap-6 px-4 py-8">
        <header className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-medium">Без интернета</h1>
          <p className="max-w-xl text-md text-muted">
            В метро, в подвале или при обрыве связи остаются страницы, которые вы уже открывали, и
            текст последних вакансий в памяти браузера. Отклик и избранное без сети встают в очередь
            и уходят сами, когда связь вернётся.
          </p>
          <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href={`/${citySlug}`} className="text-brand underline-offset-2 hover:underline">
              Главная {cityLabel}
            </Link>
            <Link href={`/${citySlug}/jobs`} className="text-brand underline-offset-2 hover:underline">
              Список вакансий
            </Link>
            <Link href="#favorites" className="text-brand underline-offset-2 hover:underline">
              Избранное
            </Link>
          </p>
        </header>
        <OfflineLibrary />
        <p className="max-w-xl text-sm text-muted">
          Если JavaScript выключен, эта страница всё равно откроется из кэша, но список сохранённого
          здесь не соберётся — откройте уже посещённые адреса из истории.
        </p>
      </article>
    </SiteChrome>
  );
}
