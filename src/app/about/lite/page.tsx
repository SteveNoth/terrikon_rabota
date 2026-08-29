import { SiteChrome } from "@/components/layout/SiteChrome";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { getDefaultCity } from "@/lib/geo";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Почему наш сайт работает там, где другие нет | Террикон Работа",
  description: "Экономная версия без JavaScript: вакансии открываются на 2G и весят мало.",
};

export default function AboutLitePage() {
  const city = getDefaultCity();

  return (
    <SiteChrome citySlug={city.slug}>
      <article className="mx-auto flex max-w-container min-w-0 flex-col gap-6 px-4 py-8">
        <header className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-medium">
            Почему наш сайт работает там, где другие нет
          </h1>
          <p className="max-w-xl text-md text-muted">
            Коротко и по делу — для тех, у кого «одна палка» и дорогой трафик.
          </p>
        </header>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Обычный сайт вакансий на 2G не открывается</h2>
          <p>
            Большинство площадок сначала качают шрифты, картинки, счётчики и программу на JavaScript.
            На слабой связи это минуты ожидания и мегабайты. Страница «крутится», а текста вакансии
            всё нет.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Мы показываем текст сразу</h2>
          <p>
            Экономная версия сайта — только данные: название, зарплата, район, контакты. Без картинок,
            без шрифтов с сервера и без JavaScript. Браузер рисует страницу, как только доехал HTML.
            Поиск и фильтры — обычные формы, пагинация — обычные ссылки.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Это те же вакансии, что и в полной версии</h2>
          <p>
            Адрес страницы не меняется. Ссылкой можно поделиться: у кого связь лучше, откроется полная
            версия, у кого хуже — экономная. Карточка собирается так же: мы не копируем чужой пост как
            есть, а показываем свою карточку. Оригинал можно раскрыть треугольником «Показать оригинал»
            — это умеет сам браузер.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Когда включать полную версию</h2>
          <p>
            Если появился Wi-Fi или устойчивый 4G, внизу страницы есть ссылка «Полная версия». Там
            картинки, карта и удобства. Если связь снова просядет — вернитесь сюда ссылкой «Экономная
            версия».
          </p>
        </section>

        <p className="flex min-w-0 flex-wrap gap-3">
          <Link href={`/${city.slug}/jobs`} className={cn(buttonVariants({ variant: "primary" }))}>
            К вакансиям
          </Link>
          <Link href="?mode=ultra" className={cn(buttonVariants({ variant: "outline" }))}>
            Экономная версия
          </Link>
        </p>
      </article>
    </SiteChrome>
  );
}
