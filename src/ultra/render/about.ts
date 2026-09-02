import {
  ABOUT_COPY,
  CONTACTS_COPY,
  HELP_COPY,
  TERMS_COPY,
  type StaticPageCopy,
} from "@/lib/content/pages";
import { getPlannedCities, getSoonCities } from "@/lib/geo";
import { TELEGRAM_CHANNEL_URL, telegramChannelTitle } from "@/lib/site";
import { attr, esc } from "@/ultra/html";

function renderCopy(copy: StaticPageCopy, extra = ""): { title: string; description: string; body: string } {
  const sections = copy.sections
    .map(
      (section) =>
        `<section class="stack tight"${section.id ? ` id="${attr(section.id)}"` : ""}>
<h2>${esc(section.title)}</h2>
${section.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}
</section>`,
    )
    .join("");

  const body = `<article class="wrap article">
<header class="stack tight">
<h1>${esc(copy.heading)}</h1>
<p class="muted">${esc(copy.description)}</p>
</header>
${sections}
${extra}
<p class="small"><a href="${attr(TELEGRAM_CHANNEL_URL)}" rel="noopener noreferrer">${esc(telegramChannelTitle())}</a></p>
</article>`;

  return { title: copy.title, description: copy.description, body };
}

export function renderAbout(): { title: string; description: string; body: string } {
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

  const extra = `<p><a href="/about/lite">Почему наш сайт работает там, где другие нет</a></p>
<p><a href="https://trudvsem.ru" rel="noopener noreferrer">Источник данных: Работа России</a></p>
<section id="plans" class="stack tight">
<h2>Планы развития</h2>
<p class="muted small">Города и их статусы живут в общем справочнике географии. Пока город в статусе «скоро», на его адресе — заглушка с формой «сообщить об открытии». Пока «в планах» — выбрать его в селекторе нельзя, он виден только здесь.</p>
<h3>Скоро</h3>
${list(soon, true)}
<h3>В планах</h3>
${list(planned, false)}
</section>`;

  return renderCopy(ABOUT_COPY, extra);
}

export function renderHelp(): { title: string; description: string; body: string } {
  return renderCopy(
    HELP_COPY,
    `<p class="small"><a href="/safety">Как не попасться при поиске работы</a> · <a href="/contacts">Контакты</a></p>`,
  );
}

export function renderContacts(): { title: string; description: string; body: string } {
  return renderCopy(
    CONTACTS_COPY,
    `<p class="small"><a href="/help">Помощь</a> · <a href="/terms">Правила</a></p>`,
  );
}

export function renderTerms(): { title: string; description: string; body: string } {
  return renderCopy(
    TERMS_COPY,
    `<p class="small"><a href="/contacts">Как связаться</a> · <a href="/safety">Как не попасться</a></p>`,
  );
}
