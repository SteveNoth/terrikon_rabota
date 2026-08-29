import { SiteChrome } from "@/components/layout/SiteChrome";
import { getDefaultCity, getPlannedCities, getSoonCities } from "@/lib/geo";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "О проекте | Террикон Работа",
  description: "Региональный агрегатор вакансий: как устроен сайт и какие города подключим дальше.",
};

export default function AboutPage() {
  const city = getDefaultCity();
  const soon = getSoonCities();
  const planned = getPlannedCities();

  return (
    <SiteChrome citySlug={city.slug}>
      <article className="mx-auto flex max-w-container min-w-0 flex-col gap-6 px-4 py-8">
        <header className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-medium">О проекте</h1>
          <p className="max-w-xl text-md text-muted">
            Террикон Работа собирает вакансии одного региона в одном месте: местную работу отдельно
            от вахты, без платы за просмотр контактов.
          </p>
          <p>
            <Link href="/about/lite" className="text-brand underline-offset-2 hover:underline">
              Почему наш сайт работает там, где другие нет
            </Link>
          </p>
        </header>

        <section id="plans" className="flex min-w-0 scroll-mt-header flex-col gap-4">
          <h2 className="font-display text-xl font-medium">Планы развития</h2>
          <p className="max-w-xl text-sm text-muted">
            Города и их статусы живут в общем справочнике географии. Пока город в статусе «скоро»,
            на его адресе — заглушка с формой «сообщить об открытии». Пока «в планах» — выбрать его
            в селекторе нельзя, он виден только здесь.
          </p>

          <h3 className="font-medium">Скоро</h3>
          {soon.length === 0 ? (
            <p className="text-sm text-muted">Пока нет городов в этой очереди.</p>
          ) : (
            <ul className="flex min-w-0 list-disc flex-col gap-1 pl-5">
              {soon.map((item) => (
                <li key={item.slug} className="min-w-0 break-words">
                  <Link href={`/${item.slug}`} className="text-brand underline-offset-2 hover:underline">
                    {item.name.nom}
                  </Link>
                  <span className="text-muted"> — подключаем следующим</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="font-medium">В планах</h3>
          {planned.length === 0 ? (
            <p className="text-sm text-muted">Пока нет городов дальше очереди.</p>
          ) : (
            <ul className="flex min-w-0 list-disc flex-col gap-1 pl-5">
              {planned.map((item) => (
                <li key={item.slug} className="min-w-0 break-words">
                  {item.name.nom}
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </SiteChrome>
  );
}
