import { TELEGRAM_CHANNEL_URL, telegramChannelTitle } from "@/lib/site";
import { getCitySelectGroups, type CityOption } from "@/lib/geo";
import {
  isQualityPreference,
  type QualityPreference,
} from "@/lib/quality/types";
import { TERRICON_LOGO_SVG } from "@/components/brand/logo-svg";
import { attr, esc } from "@/ultra/html";

const QUALITY_OPTIONS: { value: QualityPreference; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "full", label: "Полное" },
  { value: "lite", label: "Экономное" },
  { value: "ultra", label: "Только текст" },
];

function cityOptions(current: string, active: CityOption[], soon: CityOption[]): string {
  const activeOpts = active
    .map(
      (city) =>
        `<option value="${attr(city.slug)}"${city.slug === current ? " selected" : ""}>${esc(city.name)}</option>`,
    )
    .join("");
  const soonOpts =
    soon.length === 0
      ? ""
      : `<optgroup label="Скоро">${soon
          .map(
            (city) =>
              `<option value="${attr(city.slug)}"${city.slug === current ? " selected" : ""}>${esc(city.name)} · скоро</option>`,
          )
          .join("")}</optgroup>`;
  return `${activeOpts}${soonOpts}`;
}

function cityForm(id: string, citySlug: string, active: CityOption[], soon: CityOption[]): string {
  return `<form class="city-form" method="GET" action="/">
<label class="sr-only" for="${attr(id)}">Город</label>
<select id="${attr(id)}" name="city" autocomplete="off">${cityOptions(citySlug, active, soon)}</select>
<button class="btn btn-outline" type="submit">Выбрать</button>
</form>`;
}

function qualityForm(
  id: string,
  action: string,
  preference: QualityPreference,
  compact = false,
): string {
  const options = QUALITY_OPTIONS.map(
    (option) =>
      `<option value="${option.value}"${option.value === preference ? " selected" : ""}>${esc(option.label)}</option>`,
  ).join("");
  return `<form class="qform" method="GET" action="${attr(action)}">
<label class="${compact ? "sr-only" : "muted small"}" for="${attr(id)}">Качество</label>
<select id="${attr(id)}" name="mode" autocomplete="off">${options}</select>
<button class="btn btn-outline" type="submit">${compact ? "Ок" : "Применить"}</button>
</form>`;
}

export function renderChrome({
  citySlug,
  currentPath,
  body,
  preference,
}: {
  citySlug: string;
  currentPath: string;
  body: string;
  preference: QualityPreference;
}): string {
  const { active, soon } = getCitySelectGroups();
  const homeHref = `/${citySlug}`;
  const jobsHref = `/${citySlug}/jobs`;
  const formAction = currentPath || "/";
  const homeCurrent = currentPath === homeHref || currentPath === `/${citySlug}`;
  const jobsCurrent =
    currentPath === jobsHref ||
    currentPath.startsWith(`/${citySlug}/jobs`) ||
    currentPath === `/${citySlug}/vahta` ||
    currentPath.startsWith(`/${citySlug}/vahta/`);
  const selected = isQualityPreference(preference) ? preference : "ultra";

  return `<div class="site">
<header class="header">
<div class="header-inner">
<a class="brand" href="${attr(homeHref)}" aria-label="Террикон Работа">${TERRICON_LOGO_SVG}</a>
<a class="tg" href="${attr(TELEGRAM_CHANNEL_URL)}" rel="noopener noreferrer">${esc(telegramChannelTitle())}</a>
<div class="tools">
${cityForm("u-city-header", citySlug, active, soon)}
${qualityForm("u-quality-header", formAction, selected, true)}
</div>
</div>
</header>
<main>${body}</main>
<footer class="footer">
<div class="footer-inner">
<a class="brand" href="${attr(homeHref)}" aria-label="Террикон Работа">${TERRICON_LOGO_SVG}</a>
${cityForm("u-city-footer", citySlug, active, soon)}
<div class="footer-links">
<a href="/safety">Как не попасться при поиске работы</a>
<a href="/offline">Без интернета</a>
<a href="${attr(TELEGRAM_CHANNEL_URL)}" rel="noopener noreferrer">${esc(telegramChannelTitle())}</a>
<a href="/about">О проекте</a>
<a href="/about/lite">Почему сайт лёгкий</a>
</div>
${qualityForm("u-quality-footer", formAction, selected)}
<p class="muted small">Сейчас: Только текст · 2G · эта страница весит ≈ 25 КБ</p>
<p><a href="?mode=full">Полная версия</a> <span class="muted">— картинки и удобства, когда связь позволяет</span></p>
<p class="muted small">Региональный агрегатор вакансий</p>
</div>
</footer>
<nav class="bottom" aria-label="Основное меню">
<a href="${attr(homeHref)}"${homeCurrent ? ' aria-current="page"' : ""}>Главная</a>
<a href="${attr(jobsHref)}"${jobsCurrent ? ' aria-current="page"' : ""}>Вакансии</a>
</nav>
</div>`;
}
