import { navigatorAnchorExtras, navigatorHrefFor } from "@/lib/maps/points";
import { getSimilarVacancies, getVacancyBySlug } from "@/lib/repo/vacancies";
import { REPORT_REASONS } from "@/lib/vacancy/reports";
import { toVacancyView, vacancyMetaDescription, vacancyMetaTitle, type VacancyView } from "@/lib/vacancy/view";
import { renderVacancyCard } from "@/ultra/card";
import { renderLetterAvatar } from "@/ultra/avatar";
import { attr, esc, safeHttpUrl } from "@/ultra/html";

function paragraphs(items: string[]): string {
  return items.map((item) => `<p>${esc(item)}</p>`).join("");
}

function bullets(items: string[]): string {
  return `<ul class="list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

function section(title: string, inner: string): string {
  return `<section class="stack tight"><h2>${esc(title)}</h2>${inner}</section>`;
}

/**
 * Описание из VacancyView, не из сырого поста.
 * HTML источника уже вычищен в toVacancyView. Здесь только экранирование.
 */
function renderDescription(view: VacancyView): string {
  const sections = view.descriptionSections;
  if (sections) {
    const parts: string[] = [];
    if (sections.description) {
      parts.push(section("Описание", paragraphs([sections.description])));
    }
    if (sections.tasks.length > 0) {
      parts.push(section("Задачи", bullets(sections.tasks)));
    }
    if (sections.requirements.length > 0) {
      parts.push(section("Требования", bullets(sections.requirements)));
    }
    if (sections.conditions.length > 0) {
      parts.push(section("Условия", bullets(sections.conditions)));
    }
    return parts.join("");
  }
  if (view.descriptionParagraphs.length === 0) {
    return "";
  }
  return section("Описание", paragraphs(view.descriptionParagraphs));
}

function renderSource(view: VacancyView): string {
  const originalHref = safeHttpUrl(view.originalHref);
  const attributionHref = view.openDataAttribution ? safeHttpUrl(view.openDataAttribution.href) : null;
  const original =
    view.autoNormalized && view.originalText
      ? `<details><summary>Показать оригинал</summary><pre class="orig">${esc(view.originalText)}</pre></details>`
      : "";
  const dup = view.duplicateGroup
    ? `<p>${esc(view.duplicateGroup.line)}</p>${
        view.duplicateGroup.sources.length > 0
          ? `<ul class="list muted">${view.duplicateGroup.sources.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
          : ""
      }`
    : "";

  return section(
    "Источник",
    `<p>${esc(view.postedByEmployer ? "Размещено работодателем" : view.sourceLabel)}</p>
${attributionHref && view.openDataAttribution ? `<p><a href="${attr(attributionHref)}" rel="noopener noreferrer">${esc(view.openDataAttribution.label)}</a></p>` : ""}
${originalHref ? `<p><a href="${attr(originalHref)}" rel="noopener noreferrer">Открыть оригинал</a></p>` : ""}
${view.autoNormalized ? `<p class="muted">Объявление приведено к единому виду автоматически</p>` : ""}
${original}
${dup}`,
  );
}

function phoneButton(view: VacancyView): string {
  if (!view.phone) {
    return "";
  }
  return `<a class="btn btn-primary" href="${attr(view.phone.telHref)}"><span class="sr-only">Позвонить ${esc(view.phone.readable)}</span><span class="phone-obf" aria-hidden="true"><span hidden>0</span>${esc(view.phone.reversed)}<span hidden>8</span></span></a>`;
}

function renderMap(view: VacancyView): string {
  const hasPoint = view.latitude != null && view.longitude != null;
  if (!view.address && !hasPoint) {
    return "";
  }
  const navigatorHref = navigatorHrefFor(view.latitude, view.longitude, view.address);
  const navHtml = navigatorHref
    ? `<p><a href="${attr(navigatorHref)}"${navigatorAnchorExtras(navigatorHref)}>Открыть в навигаторе</a></p>`
    : "";
  return section(
    "Адрес",
    `${view.address ? `<p>${esc(view.address)}</p>` : ""}${navHtml}<p><a href="${attr(`/${view.citySlug}/map`)}">Все вакансии на карте</a></p>`,
  );
}

export async function renderVacancyPage({
  citySlug,
  slug,
  reportStatus,
}: {
  citySlug: string;
  slug: string;
  reportStatus?: "ok" | "error";
}): Promise<{ title: string; description: string; body: string; view: VacancyView } | null> {
  const record = await getVacancyBySlug(slug);
  if (!record || record.citySlug !== citySlug) {
    return null;
  }

  const view = toVacancyView(record);
  const similar = await getSimilarVacancies(slug, 3);

  const vahtaBlock = view.vahta
    ? `<div>
${view.vahta.workLocation ? `<p class="salary">${esc(`Работа: ${view.vahta.workLocation}`)}</p>` : ""}
<p class="muted small">${esc(`Набор из ${view.vahta.hiringFrom}`)}</p>
${[
  view.vahta.rotation ? `Схема смен: ${view.vahta.rotation}` : "",
  view.vahta.duration ? `Длительность: ${view.vahta.duration}` : "",
  view.vahta.housing ? "Проживание: предоставляется" : "",
  view.vahta.meals ? "Питание: предоставляется" : "",
  view.vahta.travel ? "Проезд: оплачивается" : "",
  view.vahta.advance ? "Аванс: есть" : "",
  view.vahta.whoHires ? `Кто набирает: ${view.vahta.whoHires}` : "",
]
  .filter(Boolean)
  .map((line) => `<p>${esc(line)}</p>`)
  .join("")}
</div>`
    : `<p>${esc(view.districtName ? `${view.cityName} · ${view.districtName}` : view.cityName)}</p>`;

  const contacts =
    view.phone || view.telegramHref || view.emailHref
      ? section(
          "Контакты",
          `<div class="contacts">${phoneButton(view)}${
            view.telegramHref && view.telegramLabel
              ? `<a class="btn btn-outline" href="${attr(view.telegramHref)}" rel="noopener noreferrer">Telegram ${esc(view.telegramLabel)}</a>`
              : ""
          }${
            view.emailHref && view.emailLabel
              ? `<a class="btn btn-outline" href="${attr(view.emailHref)}">${esc(view.emailLabel)}</a>`
              : ""
          }</div>`,
        )
      : "";

  const report = section(
    "Пожаловаться",
    `${reportStatus === "ok" ? `<p class="ok">Жалоба отправлена. Мы посмотрим объявление.</p>` : ""}
${reportStatus === "error" ? `<p class="muted">Не удалось отправить жалобу. Проверьте причину и попробуйте ещё раз.</p>` : ""}
<form method="POST" action="/api/reports">
<input type="hidden" name="vacancyId" value="${attr(view.id)}">
<input type="hidden" name="city" value="${attr(view.citySlug)}">
<input type="hidden" name="slug" value="${attr(view.slug)}">
<fieldset class="checks"><legend class="small salary">Причина</legend>
${REPORT_REASONS.map(
  (reason) =>
    `<label><input type="radio" name="reason" value="${attr(reason.id)}" required> ${esc(reason.label)}</label>`,
).join("")}
</fieldset>
<div class="field"><label for="report-comment"><span class="muted">Комментарий (необязательно)</span></label>
<textarea id="report-comment" name="comment" rows="3" maxlength="2000"></textarea></div>
<button class="btn btn-outline" type="submit">Отправить жалобу</button>
</form>
<p class="muted small">Если сомневаетесь — сначала прочитайте <a href="/safety">Как не попасться при поиске работы</a>.</p>`,
  );

  const body = `<article class="wrap article">
<p class="small"><a href="/${view.citySlug}/jobs">К вакансиям</a>${
    view.isVahta ? ` · <a href="/${view.citySlug}/vahta">К вахте</a>` : ""
  }</p>
<header class="stack tight">
<h1>${esc(view.title)}</h1>
${view.summaryLine ? `<p class="muted">${esc(view.summaryLine)}</p>` : ""}
<p class="salary">${esc(view.salary)}</p>
${view.salaryGrossNote ? `<p class="muted small">${esc(view.salaryGrossNote)}</p>` : ""}
${
  view.employer
    ? `<p class="employer">${renderLetterAvatar(view.employer.name)}<span>${esc(view.employer.name)}${view.employer.isVerified ? ` <span class="ok">Проверено</span>` : ""}</span></p>`
    : ""
}
${vahtaBlock}
${view.facts.map((fact) => `<p><span class="muted">${esc(fact.label)}: </span>${esc(fact.value)}</p>`).join("")}
<p class="muted small"><time datetime="${attr(view.publishedIso)}">${esc(view.publishedLabel)}</time>${
    view.freshnessLabel ? ` · ${esc(view.freshnessLabel)}` : ""
  }</p>
</header>
<p><a class="btn btn-primary" href="${attr(view.applyHref)}">Откликнуться</a> <a class="btn btn-ghost" href="#report">Пожаловаться</a></p>
${contacts}
${renderDescription(view)}
${renderSource(view)}
${
  view.employer
    ? section(
        "О работодателе",
        `<p class="employer salary">${renderLetterAvatar(view.employer.name)}<span>${esc(view.employer.name)}${view.employer.isVerified ? ` <span class="ok">Проверено</span>` : ""}</span></p>
${view.employer.description ? `<p class="muted">${esc(view.employer.description)}</p>` : ""}
<p><a href="${attr(view.employer.vacanciesHref)}">Все вакансии этого работодателя</a></p>`,
      )
    : ""
}
${renderMap(view)}
${
  view.missingInfo.length > 0
    ? section("Что уточнить у работодателя", bullets(view.missingInfo))
    : ""
}
${
  similar.length > 0
    ? section(
        "Похожие вакансии",
        `<ul class="grid cards plain">${similar.map((item) => `<li>${renderVacancyCard(item)}</li>`).join("")}</ul>`,
      )
    : ""
}
<div id="report">${report}</div>
</article>`;

  return {
    title: vacancyMetaTitle(view),
    description: vacancyMetaDescription(view),
    body,
    view,
  };
}
