import { formatMoney } from "@/lib/format/money";
import { foundVacancies } from "@/lib/format/plural";
import {
  cityName,
  districtName,
  getDistricts,
  isActiveCity,
  type CitySlug,
} from "@/lib/geo";
import { geocodeAccuracyNote } from "@/lib/geo/geocode-query";
import { navigatorAnchorExtras, navigatorHrefForRecord } from "@/lib/maps/points";
import { listSpheres } from "@/lib/professions";
import { listMapVacancies } from "@/lib/repo/vacancies";
import { vacancyPath } from "@/lib/vacancy/path";
import { parseVacancyQuery } from "@/lib/validation/vacancy-query";
import { renderCityStub } from "@/ultra/render/stub";
import { attr, esc } from "@/ultra/html";

function option(value: string, label: string, current: string | undefined): string {
  return `<option value="${attr(value)}"${value === (current ?? "") ? " selected" : ""}>${esc(label)}</option>`;
}

export async function renderMapPage(input: {
  citySlug: CitySlug;
  searchParams: URLSearchParams;
}): Promise<{ title: string; description: string; body: string }> {
  const { citySlug } = input;
  const gen = cityName(citySlug, "gen");
  const title = `Карта вакансий ${gen} | Террикон Работа`;
  const description = `Адреса местных вакансий ${gen}. В текстовой версии карты нет.`;

  if (!isActiveCity(citySlug)) {
    const stub = renderCityStub(citySlug, false, "section");
    return {
      title: `Карта вакансий ${gen} | Террикон Работа`,
      description: stub.description,
      body: `<div class="wrap stack"><h1>Карта вакансий ${esc(gen)}</h1>${stub.body}</div>`,
    };
  }

  const query = parseVacancyQuery(input.searchParams, {
    city: citySlug,
    pageSize: 1,
    workFormat: "LOCAL",
  });
  const records = await listMapVacancies({
    citySlug,
    sphere: query.sphere,
    salaryFrom: query.salaryFrom,
    districtSlug: query.district,
  });
  const listed = records.filter(
    (row) => row.address?.trim() || (row.latitude != null && row.longitude != null),
  );
  const spheres = listSpheres();
  const districts = getDistricts(citySlug);
  const filtered = Boolean(query.sphere || query.salaryFrom != null || query.district);
  const mapPath = `/${citySlug}/map`;

  const districtField =
    districts.length > 0
      ? `<label class="field" for="map-district"><span>Район</span>
<select id="map-district" name="district" autocomplete="off">${option("", "Весь город", query.district)}${districts
          .map((item) => option(item.slug, item.name, query.district))
          .join("")}</select></label>`
      : "";

  const list =
    listed.length === 0
      ? `<div class="note"><p>На карте пока пусто.</p>${
          filtered ? `<p><a class="btn btn-primary" href="${attr(mapPath)}">Сбросить фильтры</a></p>` : ""
        }<p><a class="btn btn-outline" href="/${attr(citySlug)}/jobs">К списку вакансий</a></p></div>`
      : `<ul class="grid cards plain">${listed
          .map((record) => {
            const place = districtName(citySlug, record.districtSlug);
            const note = geocodeAccuracyNote(record.geocodeAccuracy);
            const href = vacancyPath(citySlug, record.slug);
            const nav = navigatorHrefForRecord(record);
            return `<li class="card">
<p><a href="${attr(href)}">${esc(record.title)}</a></p>
<p class="salary">${esc(formatMoney(record))}</p>
${place ? `<p class="muted small">${esc(place)}</p>` : ""}
${record.address ? `<p>${esc(record.address)}</p>` : ""}
${note ? `<p class="muted small">${esc(note)}</p>` : ""}
${nav ? `<p><a href="${attr(nav)}"${navigatorAnchorExtras(nav)}>Открыть в навигаторе</a></p>` : ""}
</li>`;
          })
          .join("")}</ul>`;

  const body = `<div class="wrap stack">
<h1>Карта вакансий ${esc(gen)}</h1>
<p class="muted">В текстовой версии карты нет — только адреса и ссылка в навигатор. Вахта сюда не попадает.</p>
<p>${esc(foundVacancies(listed.length))}</p>
<form class="stack" method="GET" action="${attr(mapPath)}">
<label class="field" for="map-sphere"><span>Сфера</span>
<select id="map-sphere" name="sphere" autocomplete="off">${option("", "Все сферы", query.sphere)}${spheres
    .map((item) => option(item.slug, item.name, query.sphere))
    .join("")}</select></label>
<label class="field" for="map-salary"><span>Зарплата от</span>
<input id="map-salary" type="number" name="salaryFrom" min="0" step="1000" inputmode="numeric" value="${attr(
    query.salaryFrom != null ? String(query.salaryFrom) : "",
  )}" placeholder="₽" autocomplete="off"></label>
${districtField}
<p><button class="btn btn-primary" type="submit">Показать</button>${
    filtered ? ` <a class="btn btn-outline" href="${attr(mapPath)}">Сбросить</a>` : ""
  }</p>
</form>
${list}
</div>`;

  return { title, description, body };
}
