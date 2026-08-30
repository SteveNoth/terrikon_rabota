import { WorkFormat, type Experience, type Source } from "@prisma/client";
import { foundVacancies } from "@/lib/format/plural";
import {
  cityName,
  getCitySelectGroups,
  getDistricts,
  isActiveCity,
  listExternalDestinations,
  type CitySlug,
} from "@/lib/geo";
import {
  EMPLOYMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  PUBLISHED_OPTIONS,
  ROTATION_OPTIONS,
  SCHEDULE_OPTIONS,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  VAHTA_DAYS_OPTIONS,
} from "@/lib/jobs/options";
import type { JobsSection } from "@/lib/jobs/search-cookie";
import { lastSearchHref, parseSearchCookie } from "@/lib/jobs/search-cookie";
import {
  activeFilterCount,
  hasActiveFilters,
  jobsHref,
  jobsPath,
  queryForTabSwitch,
} from "@/lib/jobs/url";
import { FEATURES } from "@/lib/quality/features";
import { listProfessionCatalog, listSpheres } from "@/lib/professions";
import {
  countVacanciesByFormat,
  listVacancies,
  type ListVacanciesParams,
} from "@/lib/repo/vacancies";
import { isFiltersOpen, parseVacancyQuery } from "@/lib/validation/vacancy-query";
import { renderVacancyList } from "@/ultra/card";
import { renderCityStub } from "@/ultra/render/stub";
import { attr, esc } from "@/ultra/html";

function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const marks = new Set([1, pageCount]);
  for (let cursor = page - 2; cursor <= page + 2; cursor += 1) {
    if (cursor >= 1 && cursor <= pageCount) {
      marks.add(cursor);
    }
  }
  const sorted = [...marks].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0 && sorted[index] - sorted[index - 1] > 1) {
      items.push("gap");
    }
    items.push(sorted[index]);
  }
  return items;
}

function toRepoParams(
  query: ReturnType<typeof parseVacancyQuery>,
  citySlug: string,
  workFormat: WorkFormat,
  pageSize: number,
): ListVacanciesParams {
  return {
    citySlug,
    sphere: query.sphere,
    professionSlug: query.profession,
    salaryFrom: query.salaryFrom,
    schedule: query.schedule,
    experience: query.experience as Experience | undefined,
    employmentType: query.employmentType,
    districtSlug: query.district,
    q: query.q,
    sort: query.sort,
    page: query.page,
    pageSize,
    workFormat,
    publishedDays: query.publishedDays,
    hasSalary: query.hasSalary,
    verifiedOnly: query.verifiedOnly,
    source: query.source as Source | undefined,
    destination: query.destination,
    vahtaDays: query.vahtaDays,
    rotation: query.rotation,
    housing: query.housing,
    meals: query.meals,
    travel: query.travel,
    direct: query.direct,
    employerSlug: query.employerSlug,
  };
}

function option(value: string, label: string, selected?: string): string {
  return `<option value="${attr(value)}"${value === (selected ?? "") ? " selected" : ""}>${esc(label)}</option>`;
}

function field(id: string, label: string, control: string): string {
  return `<div class="field"><label for="${attr(id)}">${esc(label)}</label>${control}</div>`;
}

function check(id: string, name: string, label: string, on: boolean | undefined): string {
  return `<label><input id="${attr(id)}" type="checkbox" name="${attr(name)}" value="1"${on ? " checked" : ""}> ${esc(label)}</label>`;
}

export async function renderJobsPage({
  citySlug,
  section,
  searchParams,
  searchCookie,
}: {
  citySlug: CitySlug;
  section: JobsSection;
  searchParams: URLSearchParams;
  searchCookie: string | undefined;
}): Promise<{ title: string; description: string; body: string }> {
  const pageSize = FEATURES.ultra.perPage;
  const workFormat = section === "vahta" ? WorkFormat.VAHTA : WorkFormat.LOCAL;
  const record: Record<string, string | undefined> = {};
  for (const key of searchParams.keys()) {
    record[key] = searchParams.get(key) ?? undefined;
  }
  const query = parseVacancyQuery(record, {
    city: citySlug,
    pageSize,
    workFormat,
  });
  const filtersOpen = isFiltersOpen(record);
  const cityInDevelopment = !isActiveCity(citySlug);
  const filterCount = activeFilterCount(query, section);
  const filtered = hasActiveFilters(query, section);
  const { active, soon } = getCitySelectGroups();
  const districts = getDistricts(citySlug);
  const spheres = listSpheres();
  const professions = listProfessionCatalog();
  const destinations = listExternalDestinations();

  const [list, localCount, vahtaCount] = cityInDevelopment
    ? [
        { vacancies: [], total: 0, page: query.page, pageSize, pages: 0 },
        0,
        0,
      ]
    : await Promise.all([
        listVacancies(toRepoParams(query, citySlug, workFormat, pageSize)),
        countVacanciesByFormat(citySlug, WorkFormat.LOCAL),
        countVacanciesByFormat(citySlug, WorkFormat.VAHTA),
      ]);

  const last = parseSearchCookie(searchCookie);
  const continueHref =
    last && last.city === citySlug && last.section === section && last.query
      ? lastSearchHref(last)
      : null;
  const showContinue = Boolean(continueHref) && !filtered && query.page === 1 && !filtersOpen;

  const title =
    section === "vahta" ? `Вахта из ${cityName(citySlug, "gen")}` : `Вакансии ${cityName(citySlug, "gen")}`;
  const description =
    section === "vahta"
      ? `Вахтовые вакансии, набор из ${cityName(citySlug, "gen")}. Место работы — не здесь.`
      : `Местная работа в ${cityName(citySlug, "loc")}. Вахта собрана отдельно.`;

  const path = jobsPath(citySlug, section);
  const shared = queryForTabSwitch(query);
  const jobsUrl = jobsHref(citySlug, "jobs", { ...shared, workFormat: "LOCAL" });
  const vahtaUrl = jobsHref(citySlug, "vahta", { ...shared, workFormat: "VAHTA" });
  const otherCount = section === "jobs" ? vahtaCount : localCount;
  const closeHref = jobsHref(citySlug, section, query, { filters: false });
  const resetHref = `${path}?reset=1`;
  const openFiltersHref = jobsHref(citySlug, section, query, { filters: true });

  const professionsBySphere = new Map<string, typeof professions>();
  for (const sphere of spheres) {
    professionsBySphere.set(sphere.slug, []);
  }
  for (const profession of professions) {
    const group = professionsBySphere.get(profession.sphere) ?? [];
    group.push(profession);
    professionsBySphere.set(profession.sphere, group);
  }

  const cityOpts = [
    ...active.map((city) => option(city.slug, city.name, citySlug)),
    soon.length
      ? `<optgroup label="Скоро">${soon.map((city) => option(city.slug, `${city.name} · скоро`, citySlug)).join("")}</optgroup>`
      : "",
  ].join("");

  const professionOpts = spheres
    .map((sphere) => {
      const items = professionsBySphere.get(sphere.slug) ?? [];
      if (items.length === 0) {
        return "";
      }
      return `<optgroup label="${attr(sphere.name)}">${items
        .map((item) => option(item.slug, item.name, query.profession))
        .join("")}</optgroup>`;
    })
    .join("");

  const districtField =
    section === "jobs" && districts.length > 0
      ? field(
          "jobs-district",
          "Район",
          `<select id="jobs-district" name="district" autocomplete="off">${option("", "Любой", query.district)}${districts
            .map((item) => option(item.slug, item.name, query.district))
            .join("")}</select>`,
        )
      : "";

  const scheduleField =
    section === "jobs"
      ? field(
          "jobs-schedule",
          "График",
          `<select id="jobs-schedule" name="schedule" autocomplete="off">${option("", "Любой", query.schedule)}${SCHEDULE_OPTIONS.map(
            (item) => option(item.value, item.label, query.schedule),
          ).join("")}</select>`,
        )
      : "";

  const vahtaFields =
    section === "vahta"
      ? `${field(
          "jobs-destination",
          "Место работы",
          `<select id="jobs-destination" name="destination" autocomplete="off">${option("", "Любое направление", query.destination)}${destinations
            .map((item) => option(item.slug, item.name, query.destination))
            .join("")}</select>`,
        )}${field(
          "jobs-vahta-days",
          "Длительность смены",
          `<select id="jobs-vahta-days" name="vahtaDays" autocomplete="off">${option("", "Любая", query.vahtaDays ? String(query.vahtaDays) : "")}${VAHTA_DAYS_OPTIONS.map(
            (item) => option(String(item.value), item.label, query.vahtaDays ? String(query.vahtaDays) : ""),
          ).join("")}</select>`,
        )}${field(
          "jobs-rotation",
          "Схема ротации",
          `<select id="jobs-rotation" name="rotation" autocomplete="off">${option("", "Любая", query.rotation)}${ROTATION_OPTIONS.map(
            (item) => option(item.value, item.label, query.rotation),
          ).join("")}</select>`,
        )}`
      : "";

  const vahtaChecks =
    section === "vahta"
      ? `${check("jobs-housing", "housing", "Проживание", query.housing)}${check("jobs-meals", "meals", "Питание", query.meals)}${check("jobs-travel", "travel", "Проезд", query.travel)}${check("jobs-direct", "direct", "Напрямую от работодателя", query.direct)}`
      : "";

  const filters = `
<form class="filters" method="GET" action="${attr(path)}">
<div class="split">
<p class="salary">Фильтры</p>
<a class="btn btn-ghost mob-only" href="${attr(closeHref)}">Закрыть</a>
</div>
${field("jobs-q", "Поиск", `<input id="jobs-q" type="search" name="q" value="${attr(query.q ?? "")}" placeholder="Должность или слово" autocomplete="off">`)}
${field("jobs-city", "Город", `<select id="jobs-city" name="city" autocomplete="off">${cityOpts}</select>`)}
${districtField}
${field("jobs-sphere", "Сфера", `<select id="jobs-sphere" name="sphere" autocomplete="off">${option("", "Все сферы", query.sphere)}${spheres
    .map((item) => option(item.slug, item.name, query.sphere))
    .join("")}</select>`)}
${field("jobs-profession", "Профессия", `<select id="jobs-profession" name="profession" autocomplete="off">${option("", "Все профессии", query.profession)}${professionOpts}</select>`)}
${field("jobs-salary", "Зарплата от, ₽", `<input id="jobs-salary" type="number" name="salaryFrom" min="0" step="1000" inputmode="numeric" value="${attr(query.salaryFrom != null ? String(query.salaryFrom) : "")}" placeholder="40000">`)}
${scheduleField}
${field("jobs-experience", "Опыт", `<select id="jobs-experience" name="experience" autocomplete="off">${option("", "Неважно", query.experience)}${EXPERIENCE_OPTIONS.map(
    (item) => option(item.value, item.label, query.experience),
  ).join("")}</select>`)}
${field("jobs-employment", "Тип занятости", `<select id="jobs-employment" name="employmentType" autocomplete="off">${option("", "Любой", query.employmentType)}${EMPLOYMENT_OPTIONS.map(
    (item) => option(item.value, item.label, query.employmentType),
  ).join("")}</select>`)}
${field("jobs-published", "Дата публикации", `<select id="jobs-published" name="published" autocomplete="off">${option("", "За всё время", query.publishedDays ? String(query.publishedDays) : "")}${PUBLISHED_OPTIONS.map(
    (item) => option(String(item.value), item.label, query.publishedDays ? String(query.publishedDays) : ""),
  ).join("")}</select>`)}
${field("jobs-source", "Источник", `<select id="jobs-source" name="source" autocomplete="off">${option("", "Все источники", query.source)}${SOURCE_OPTIONS.map(
    (item) => option(item.value, item.label, query.source),
  ).join("")}</select>`)}
${vahtaFields}
<div class="checks">
${check("jobs-has-salary", "hasSalary", "Только с указанной зарплатой", query.hasSalary)}
${check("jobs-verified", "verified", "Только проверенные работодатели", query.verifiedOnly)}
${vahtaChecks}
</div>
${query.sort !== "date" ? `<input type="hidden" name="sort" value="${attr(query.sort)}">` : ""}
<button class="btn btn-primary btn-full" type="submit">Показать вакансии</button>
<a class="btn btn-ghost btn-full" href="${attr(resetHref)}">Сбросить фильтры</a>
<p class="note">Совет: скопируйте адрес страницы и отправьте знакомому — у него откроются те же фильтры и вакансии.</p>
</form>`;

  const sortNav = `<nav class="chips" aria-label="Сортировка">${SORT_OPTIONS.map((item) => {
    const current = query.sort === item.value;
    return `<a class="chip${current ? " chip-on" : ""}" href="${attr(jobsHref(citySlug, section, query, { sort: item.value, page: 1 }))}"${current ? ' aria-current="true"' : ""}>${esc(item.label)}</a>`;
  }).join("")}</nav>`;

  let listing: string;
  if (cityInDevelopment) {
    listing = (await renderCityStub(citySlug, false, "section")).body;
  } else if (list.total === 0) {
    const otherHref = jobsPath(citySlug, section === "jobs" ? "vahta" : "jobs");
    const otherLabel =
      section === "jobs"
        ? `Посмотреть вахту из ${cityName(citySlug, "gen")}`
        : `Посмотреть местные вакансии ${cityName(citySlug, "gen")}`;
    listing = `<div class="card">
<h2>Ничего не нашли</h2>
<p class="muted">${filtered ? "По этому набору условий объявлений нет. Часто помогает убрать зарплату или район." : "Сейчас нет подходящих объявлений."}</p>
${filtered ? `<p><a class="btn btn-primary" href="${attr(resetHref)}">Сбросить фильтры</a></p>` : ""}
${otherCount > 0 ? `<p><a class="btn btn-outline" href="${attr(otherHref)}">${esc(otherLabel)} · ${otherCount}</a></p>` : ""}
<ul class="list muted small">
<li>Попробуйте другое слово в поиске — «сварщик», а не «электрогазосварщик 5 разряда».</li>
<li>Уберите «только с зарплатой» и «только проверенные» — часть объявлений без цифр.</li>
${section === "jobs" ? "<li>Вахта в общий список не попадает: если готовы уехать, откройте вкладку «Вахта».</li>" : "<li>Проверьте место работы и схему смен — фильтры вахты строже, чем у местных.</li>"}
</ul>
</div>`;
  } else {
    listing = renderVacancyList(list.vacancies, true);
  }

  const pages =
    cityInDevelopment || list.pages <= 1
      ? ""
      : `<nav class="pages" aria-label="Страницы">${
          list.page > 1
            ? `<a href="${attr(jobsHref(citySlug, section, query, { page: list.page - 1 }))}">Назад</a>`
            : ""
        }${pageWindow(list.page, list.pages)
          .map((item) =>
            item === "gap"
              ? `<span>…</span>`
              : `<a href="${attr(jobsHref(citySlug, section, query, { page: item }))}"${item === list.page ? ' aria-current="page"' : ""}>${item}</a>`,
          )
          .join("")}${
          list.page < list.pages
            ? `<a href="${attr(jobsHref(citySlug, section, query, { page: list.page + 1 }))}">Вперёд</a>`
            : ""
        }</nav>`;

  const warning =
    section === "vahta"
      ? `<div class="warn"><p class="salary">Вахта — это работа не здесь</p><p class="small">Набор идёт из нашего города, а объект может быть за тысячи километров. Не платите за трудоустройство, не отдавайте паспорт и не оформляйте на себя чужие карты. Подробнее — <a href="/safety">как не попасться при поиске работы</a>.</p></div>`
      : "";

  const body = `
<div class="wrap stack">
<header class="stack tight">
<h1>${esc(title)}</h1>
${section === "jobs" && !cityInDevelopment ? `<p><a href="/${attr(citySlug)}/map">Карта вакансий</a></p>` : ""}
<nav aria-label="Формат работы" class="chips">
<a class="chip${section === "jobs" ? " chip-on" : ""}" href="${attr(jobsUrl)}"${section === "jobs" ? ' aria-current="page"' : ""}>Вакансии · ${localCount}</a>
<a class="chip chip-accent${section === "vahta" ? " chip-on" : ""}" href="${attr(vahtaUrl)}"${section === "vahta" ? ' aria-current="page"' : ""}>Вахта · ${vahtaCount}</a>
</nav>
</header>
${warning}
${showContinue && continueHref ? `<p class="small"><a href="${attr(continueHref)}">Продолжить последний поиск</a></p>` : ""}
<div class="jobs${filtersOpen ? " is-filters" : ""}">
<div class="results">
<a class="btn btn-outline filter-bar" href="${attr(openFiltersHref)}">Фильтры${filterCount > 0 ? ` · ${filterCount}` : ""}</a>
${cityInDevelopment ? "" : `<p>${esc(foundVacancies(list.total))}</p>${sortNav}`}
${listing}
${pages}
</div>
${filters}
</div>
</div>`;

  return { title: `${title} | Террикон Работа`, description, body };
}
