import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { cityName, districtName, isCitySlug } from "@/lib/geo";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import { vacancyPath } from "@/lib/vacancy/path";
import { attr, esc } from "@/ultra/html";

function cityLabel(slug: string): string {
  return isCitySlug(slug) ? cityName(slug, "nom") : slug;
}

function place(vacancy: VacancyListItem): string {
  const city = cityLabel(vacancy.citySlug);
  if (vacancy.workFormat === "VAHTA") {
    const work = vacancy.workLocationText?.trim();
    const workLine = work ? `<p class="salary">Работа: ${esc(work)}</p>` : "";
    return `${workLine}<p class="muted small">Набор: ${esc(city)}</p>`;
  }
  const district = districtName(vacancy.citySlug, vacancy.districtSlug);
  const line = district ? `${city} · ${district}` : city;
  return `<p class="muted small">${esc(line)}</p>`;
}

/** Карточка Ultra: название, место, зарплата, дата. Без сводки и картинок. */
export function renderVacancyCard(vacancy: VacancyListItem, extra = ""): string {
  const href = vacancyPath(vacancy.citySlug, vacancy.slug);
  const salary = formatMoney(vacancy);
  const published = formatDate(vacancy.publishedAt);
  const iso =
    vacancy.publishedAt instanceof Date
      ? vacancy.publishedAt.toISOString()
      : new Date(vacancy.publishedAt).toISOString();

  return `<article>
<a class="card" href="${attr(href)}">
<h3>${esc(vacancy.title)}</h3>
${place(vacancy)}
<p class="salary">${esc(salary)}</p>
<p class="muted small"><time datetime="${attr(iso)}">${esc(published)}</time></p>
</a>
${extra}
</article>`;
}

export function renderVacancyList(vacancies: VacancyListItem[], safetyLink = false): string {
  const safety = safetyLink
    ? `<p class="small"><a href="/safety">Как не попасться при поиске работы</a></p>`
    : "";
  return `<ul class="grid cards plain">${vacancies
    .map((vacancy) => `<li>${renderVacancyCard(vacancy, safety)}</li>`)
    .join("")}</ul>`;
}
