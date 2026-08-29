import { getDefaultCity, getPlannedCities, getSoonCities } from "@/lib/geo";
import { attr, esc } from "@/ultra/html";

export function renderAbout(): { title: string; description: string; body: string } {
  const city = getDefaultCity();
  const soon = getSoonCities();
  const planned = getPlannedCities();

  const list = (items: typeof soon, link: boolean) =>
    items.length === 0
      ? `<p class="muted small">Пока нет городов в этой очереди.</p>`
      : `<ul class="list">${items
          .map((item) =>
            link
              ? `<li><a href="/${attr(item.slug)}">${esc(item.name.nom)}</a> <span class="muted">— подключаем следующим</span></li>`
              : `<li>${esc(item.name.nom)}</li>`,
          )
          .join("")}</ul>`;

  const body = `<article class="wrap article">
<header class="stack tight">
<h1>О проекте</h1>
<p class="muted">Террикон Работа собирает вакансии одного региона в одном месте: местную работу отдельно от вахты, без платы за просмотр контактов.</p>
<p><a href="/about/lite">Почему наш сайт работает там, где другие нет</a></p>
</header>
<section id="plans" class="stack tight">
<h2>Планы развития</h2>
<p class="muted small">Города и их статусы живут в общем справочнике географии. Пока город в статусе «скоро», на его адресе — заглушка с формой «сообщить об открытии». Пока «в планах» — выбрать его в селекторе нельзя, он виден только здесь.</p>
<h3>Скоро</h3>
${list(soon, true)}
<h3>В планах</h3>
${list(planned, false)}
</section>
<p class="small"><a href="/${city.slug}">К вакансиям ${esc(city.name.gen)}</a></p>
</article>`;

  return {
    title: "О проекте | Террикон Работа",
    description: "Региональный агрегатор вакансий: как устроен сайт и какие города подключим дальше.",
    body,
  };
}
