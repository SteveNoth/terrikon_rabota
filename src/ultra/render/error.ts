import { cityName, getDefaultCity, getSelectableCities } from "@/lib/geo";
import { attr, esc } from "@/ultra/html";

export function renderNotFound(citySlug?: string): { title: string; description: string; body: string } {
  const cities = getSelectableCities();
  const home = citySlug ?? getDefaultCity().slug;

  const body = `<div class="wrap stack">
<h1>Такого города у нас нет</h1>
<p class="muted">Можно выбрать город, который уже в списке:</p>
<ul class="list">${cities
    .map(
      (city) =>
        `<li><a href="/${attr(city.slug)}">${esc(cityName(city.slug, "nom"))}${city.status === "soon" ? " · скоро" : ""}</a></li>`,
    )
    .join("")}</ul>
<p class="small"><a href="/${home}">На главную</a></p>
</div>`;

  return {
    title: "Такого города у нас нет | Террикон Работа",
    description: "Город не найден. Выберите город из списка.",
    body,
  };
}

export function renderServerError(): { title: string; description: string; body: string } {
  const home = getDefaultCity().slug;
  return {
    title: "Не получилось открыть страницу | Террикон Работа",
    description: "Временная ошибка. Попробуйте ещё раз.",
    body: `<div class="wrap stack">
<h1>Не получилось открыть страницу</h1>
<p class="muted">Это не ваша вина. Попробуйте обновить страницу через минуту.</p>
<p><a class="btn btn-primary" href="/${home}">На главную</a></p>
</div>`,
  };
}

export function renderGenericMissing(citySlug: string): { title: string; description: string; body: string } {
  return {
    title: "Страница не найдена | Террикон Работа",
    description: "Такой страницы нет.",
    body: `<div class="wrap stack">
<h1>Страница не найдена</h1>
<p class="muted">В экономной версии есть главная, список вакансий, карточка, «О проекте» и эта страница. Остальное откроется в полной версии.</p>
<p><a class="btn btn-primary" href="/${citySlug}/jobs">К вакансиям</a> <a class="btn btn-outline" href="?mode=full">Полная версия</a></p>
</div>`,
  };
}
