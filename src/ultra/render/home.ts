import { cityName, getCitySelectGroups, getPlannedCities, getSoonCities, type CitySlug } from "@/lib/geo";
import { getSphere } from "@/lib/professions";
import { listCategories } from "@/lib/repo/categories";
import { getPopularProfessions } from "@/lib/repo/professions";
import {
  countVacanciesBySphere,
  getLatestVacancies,
  HOME_LATEST_LIMIT,
} from "@/lib/repo/vacancies";
import { pluralVacancies } from "@/lib/format/plural";
import { renderVacancyCard } from "@/ultra/card";
import { attr, esc } from "@/ultra/html";
import type { CityOption } from "@/lib/geo";

const SPHERE_TILES = 8;

const HOW = [
  {
    n: "1",
    title: "Найдите вакансию",
    text: "Введите должность в поиск, выберите профессию или откройте сферу. Форма работает и без JavaScript.",
  },
  {
    n: "2",
    title: "Сравните условия",
    text: "На карточке сразу видны зарплата, график, район и отметка «Проверено», если работодателя подтвердили.",
  },
  {
    n: "3",
    title: "Свяжитесь напрямую",
    text: "Контакты в объявлении открываются как обычная ссылка. За доступ к вакансиям мы не берём денег.",
  },
] as const;

function citySelectOptions(citySlug: string, active: CityOption[], soon: CityOption[]): string {
  const activeOpts = active
    .map(
      (city) =>
        `<option value="${attr(city.slug)}"${city.slug === citySlug ? " selected" : ""}>${esc(city.name)}</option>`,
    )
    .join("");
  const soonOpts =
    soon.length === 0
      ? ""
      : `<optgroup label="Скоро">${soon
          .map(
            (city) =>
              `<option value="${attr(city.slug)}"${city.slug === citySlug ? " selected" : ""}>${esc(city.name)} · скоро</option>`,
          )
          .join("")}</optgroup>`;
  return `${activeOpts}${soonOpts}`;
}

export async function renderCityHome(citySlug: CitySlug): Promise<{
  title: string;
  description: string;
  body: string;
}> {
  const [latest, popular, categories, sphereCounts] = await Promise.all([
    getLatestVacancies(citySlug, HOME_LATEST_LIMIT),
    getPopularProfessions(citySlug),
    listCategories(),
    countVacanciesBySphere(citySlug),
  ]);
  const { active, soon } = getCitySelectGroups();
  const loc = cityName(citySlug, "loc");
  const gen = cityName(citySlug, "gen");

  const countBySphere = new Map(sphereCounts.map((row) => [row.sphere, row.count]));
  const tiles = categories.slice(0, SPHERE_TILES).map((category) => {
    const sphere = getSphere(category.slug);
    return {
      slug: category.slug,
      name: sphere?.name ?? category.name,
      count: countBySphere.get(category.slug) ?? 0,
    };
  });

  const professionChips = popular
    .map(
      (profession) =>
        `<li><a class="chip" href="/${citySlug}/jobs?q=${attr(encodeURIComponent(profession.name))}">${esc(profession.name)}</a></li>`,
    )
    .join("");

  const latestBlock =
    latest.length === 0
      ? `<p class="muted">Пока нет местных вакансий. Как только появятся объявления, они отобразятся здесь.</p>`
      : `<ul class="grid cards plain">${latest.map((item) => `<li>${renderVacancyCard(item)}</li>`).join("")}</ul>`;

  const sphereTiles = tiles
    .map(
      (tile) =>
        `<li><a class="card" href="/${citySlug}/jobs?sphere=${attr(tile.slug)}"><span class="salary">${esc(tile.name)}</span><span class="muted small">${esc(pluralVacancies(tile.count))}</span></a></li>`,
    )
    .join("");

  const soonCities = getSoonCities();
  const plannedCities = getPlannedCities();
  const planList = (title: string, cities: typeof soonCities) =>
    cities.length === 0
      ? ""
      : `<div><h3>${esc(title)}</h3><ul class="chips plain">${cities
          .map((city) => `<li><a class="chip" href="/about#plans">${esc(city.name.nom)}</a></li>`)
          .join("")}</ul></div>`;

  const body = `
<section class="hero">
<div class="wrap">
<h1>Найди работу в ${esc(loc)}</h1>
<p>Свежие вакансии ${esc(gen)} и района</p>
<form class="search" method="GET" action="/">
<label class="sr-only" for="home-q">Поиск вакансий</label>
<input id="home-q" type="search" name="q" placeholder="Должность или ключевое слово" autocomplete="off">
<label class="sr-only" for="home-city">Город</label>
<select id="home-city" name="city" autocomplete="off">${citySelectOptions(citySlug, active, soon)}</select>
<button class="btn btn-accent" type="submit">Найти</button>
</form>
${popular.length > 0 ? `<ul class="chips plain">${professionChips}</ul>` : ""}
</div>
</section>
<section class="wrap stack">
<div class="split">
<h2>Свежие вакансии</h2>
<a class="btn btn-ghost" href="/${citySlug}/jobs">Все вакансии</a>
</div>
${latestBlock}
</section>
<section class="wrap stack">
<h2>Сферы</h2>
<ul class="grid spheres plain">${sphereTiles}</ul>
</section>
<section class="wrap stack">
<h2>Как это работает</h2>
<ol class="grid cards plain">${HOW.map(
    (step) =>
      `<li class="card"><p class="muted small">Шаг ${step.n}</p><h3>${esc(step.title)}</h3><p class="muted small">${esc(step.text)}</p></li>`,
  ).join("")}</ol>
</section>
${
  soonCities.length || plannedCities.length
    ? `<section class="wrap stack">
<div class="split">
<h2>Планы развития</h2>
<a class="btn btn-ghost" href="/about#plans">Подробнее</a>
</div>
<p class="muted small">Сначала один город, затем соседи. Список берётся из справочника географии, а не из кода страницы.</p>
${planList("Скоро", soonCities)}
${planList("В планах", plannedCities)}
</section>`
    : ""
}
`;

  return {
    title: `Работа в ${loc} | Террикон Работа`,
    description: `Вакансии ${gen}`,
    body,
  };
}
