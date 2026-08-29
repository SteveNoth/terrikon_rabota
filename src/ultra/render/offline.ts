import { cityName, getDefaultCity, isCitySlug } from "@/lib/geo";
import { attr, esc } from "@/ultra/html";

export function renderOffline(citySlug: string = getDefaultCity().slug): {
  title: string;
  description: string;
  body: string;
} {
  const slug = isCitySlug(citySlug) ? citySlug : getDefaultCity().slug;
  const city = cityName(slug, "nom");

  const body = `<article class="wrap article">
<header class="stack tight">
<h1>Без интернета</h1>
<p class="muted">Страницы, которые вы уже открывали, браузер может показать из своей коробки — даже в метро. Отклик и избранное без сети сохраняются в полной версии: там работает программа в браузере.</p>
</header>
<section class="stack tight">
<h2>Что доступно без связи</h2>
<ul class="list">
<li>Главная и список вакансий, если вы их уже открывали</li>
<li>Карточки объявлений, которые успели загрузиться</li>
<li>Эта страница-подсказка</li>
</ul>
<p class="muted small">Список «последние 100 вакансий» и избранное живут в полной версии. Экономная страница без JavaScript сама память браузера не читает.</p>
</section>
<p><a class="btn btn-primary" href="/${attr(slug)}/jobs">К вакансиям ${esc(city)}</a> <a class="btn btn-outline" href="?mode=full">Полная версия</a></p>
</article>`;

  return {
    title: "Без интернета | Террикон Работа",
    description: "Что открывается без сети: уже просмотренные вакансии и эта подсказка.",
    body,
  };
}
