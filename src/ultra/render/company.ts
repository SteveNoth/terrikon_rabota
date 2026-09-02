import { cityName, isActiveCity, type CitySlug } from "@/lib/geo";
import { getSphere } from "@/lib/professions";
import { listVacancies } from "@/lib/repo/vacancies";
import { getPublicEmployer } from "@/lib/repo/sitemap";
import { companyDescription, companyTitle } from "@/lib/seo/titles";
import { WorkFormat } from "@prisma/client";
import { renderVacancyList } from "@/ultra/card";
import { attr, esc } from "@/ultra/html";

export async function renderCompanyPage(input: {
  citySlug: CitySlug;
  slug: string;
}): Promise<{ title: string; description: string; body: string } | null> {
  if (!isActiveCity(input.citySlug)) {
    return null;
  }
  const employer = await getPublicEmployer(input.slug);
  if (!employer || employer.citySlug !== input.citySlug) {
    return null;
  }

  const [local, vahta] = await Promise.all([
    listVacancies({
      citySlug: input.citySlug,
      employerSlug: input.slug,
      workFormat: WorkFormat.LOCAL,
      pageSize: 50,
    }),
    listVacancies({
      citySlug: input.citySlug,
      employerSlug: input.slug,
      workFormat: WorkFormat.VAHTA,
      pageSize: 50,
    }),
  ]);

  const sphere = getSphere(employer.sphere);
  const website = employer.website?.trim();
  const localList =
    local.vacancies.length === 0
      ? `<p class="muted">Сейчас нет местных объявлений этой компании.</p>`
      : renderVacancyList(local.vacancies, true);
  const vahtaBlock =
    vahta.vacancies.length > 0
      ? `<section class="stack tight"><h2>Вахта</h2><p class="muted small">Работа не в этом городе. Набор идёт отсюда.</p>${renderVacancyList(vahta.vacancies, true)}</section>`
      : "";

  const body = `<article class="wrap article">
<p class="small"><a href="/${attr(input.citySlug)}/jobs">К вакансиям ${esc(cityName(input.citySlug, "gen"))}</a></p>
<header class="stack tight">
<h1>${esc(employer.name)}</h1>
<p class="muted">${esc(cityName(input.citySlug, "nom"))}${sphere ? ` · ${esc(sphere.name)}` : ""}${employer.isVerified ? " · Проверено" : ""}</p>
${
  employer.description
    ? `<p>${esc(employer.description)}</p>`
    : `<p class="muted">Карточка собрана по объявлениям. Это не страница предприятия «от лица компании», если вакансии пришли из групп и каналов.</p>`
}
${website ? `<p><a href="${attr(website)}" rel="noopener noreferrer">Сайт работодателя</a></p>` : ""}
</header>
<section class="stack tight">
<h2>Местные вакансии</h2>
${localList}
</section>
${vahtaBlock}
</article>`;

  return {
    title: companyTitle(employer.name, input.citySlug),
    description: companyDescription(employer.name, input.citySlug),
    body,
  };
}
