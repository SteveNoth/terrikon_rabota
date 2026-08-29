import { SiteChrome } from "@/components/layout/SiteChrome";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Как не попасться при поиске работы | Террикон Работа",
  description:
    "Не платите за трудоустройство, не отдавайте паспорт, не оформляйте чужие карты. Региональные признаки обмана.",
};

function cityFromCookie(value: string | undefined): string {
  if (value && isSelectableCity(value)) {
    return value;
  }
  return getDefaultCity().slug;
}

export default async function SafetyPage() {
  const jar = await cookies();
  const citySlug = cityFromCookie(jar.get(CITY_COOKIE)?.value);

  return (
    <SiteChrome citySlug={citySlug}>
      <article className="mx-auto flex max-w-container min-w-0 flex-col gap-6 px-4 py-8">
        <header className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-medium">Как не попасться при поиске работы</h1>
          <p className="max-w-xl text-md text-muted">
            Часть объявлений мы отсеиваем правилами. Часть — нет: мошенник пишет так же, как честный
            мастер. Эти признаки работают и там, где фильтр не сработал.
          </p>
        </header>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Никогда не платите за трудоустройство</h2>
          <p>
            «Бронь места на вахте — 2 000 ₽», «оформление пропуска», «медкомиссия только через нашу
            кассу» — так собирают деньги с людей, которые ищут работу из Горловки и соседних городов.
            Настоящий работодатель не берёт плату за то, что вы пришли работать.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Паспорт не отдают «на оформление»</h2>
          <p>
            Вербовщик просит паспорт «чтобы сделать пропуск на объект» и уносит его. Потом паспорт
            «задерживают», пока вы не заплатите или не уедете без документов. Копии — только в вашем
            присутствии, оригинал остаётся у вас.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Карты и сим-карты — только свои</h2>
          <p>
            «Оформи карту на себя, будем переводить зарплату бригаде», «нужна симка для объекта» —
            классическая схема дропперов. Счёт окажется в уголовном деле, а вы — номинальным
            владельцем. Если просят оформить финансы или связь на ваше имя для «компании» — это не
            работа.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Договор — до отъезда, не «на месте»</h2>
          <p>
            На вахту часто зовут «подпишем в Новом Уренгое». Без договора вы уже в дороге без
            гарантий жилья, оплаты и возврата. Требуйте текст заранее: кто работодатель, где объект,
            какая схема смен, что с проживанием и проездом.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Проверяйте адрес</h2>
          <p>
            Объявление висит в горловской группе, а работа — не в Горловке. Это нормально для вахты,
            если место работы названо прямо. Если адреса нет, точка «рядом с рынком» не находится,
            или вместо объекта — «напиши в личку» — остановитесь. Спросите точный адрес и сверьте его.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">«250 000 за два часа в день» — не вакансия</h2>
          <p>
            В регионе с обычными зарплатами 25–60 тысяч «лёгкие 250 тысяч без опыта» почти всегда
            вербовка: сетевой маркетинг, обнал, закладки. Честная вахта платит много, но за длинную
            смену вдали от дома, с проживанием и графиком вроде 60/30 — не за два часа у компьютера.
          </p>
        </section>

        <p className="text-sm text-muted">
          Если сомневаетесь — не едьте и не платите. Лучше потерять «окно», чем паспорт и деньги.
        </p>

        <p>
          <Link href={`/${citySlug}/jobs`} className="text-brand underline-offset-2 hover:underline">
            К вакансиям
          </Link>
          <span className="text-muted"> · </span>
          <Link href={`/${citySlug}/vahta`} className="text-brand underline-offset-2 hover:underline">
            К вахте
          </Link>
        </p>
      </article>
    </SiteChrome>
  );
}
