import { cityName, getCity, getDefaultCity, type CitySlug } from "@/lib/geo";
import { cityHomeDescription, cityHomeTitle } from "@/lib/seo/titles";
import { attr, esc } from "@/ultra/html";

export function renderCityStub(
  citySlug: CitySlug,
  notified: boolean,
  heading: "page" | "section" = "page",
): { title: string; description: string; body: string } {
  const city = getCity(citySlug);
  const fallback = getDefaultCity();
  const loc = cityName(citySlug, "loc");
  const gen = cityName(citySlug, "gen");
  const Title = heading === "section" ? "h2" : "h1";

  const form = notified
    ? `<p class="muted" role="status">Записали. Сообщим, когда город откроется.</p>`
    : `<form method="POST" action="${attr(`/${citySlug}`)}">
<input type="hidden" name="intent" value="notify-city">
<input type="hidden" name="city" value="${attr(citySlug)}">
<label class="field" for="notify-contact-${attr(citySlug)}"><span>Почта или телефон</span>
<input id="notify-contact-${attr(citySlug)}" name="contact" type="text" required autocomplete="email" placeholder="Куда написать, когда откроемся">
</label>
<button class="btn btn-primary" type="submit">Сообщить, когда откроется</button>
</form>`;

  const body = `<div class="wrap stack">
<div class="card">
<p class="muted small">В процессе разработки</p>
<${Title}>Скоро откроемся в ${esc(loc)}</${Title}>
<p class="muted">${esc(
    city
      ? `Мы уже настраиваем сбор вакансий ${gen}. Оставь адрес — сообщим, когда откроем.`
      : `Город скоро появится на сайте.`,
  )}</p>
${form}
<p><a class="btn btn-outline" href="/${fallback.slug}/jobs">Смотреть вакансии ${esc(cityName(fallback.slug, "gen"))}</a></p>
<p class="small"><a href="/about#plans">Все планы развития</a></p>
</div>
</div>`;

  return {
    title: cityHomeTitle(citySlug, "soon"),
    description: cityHomeDescription(citySlug, "soon"),
    body,
  };
}
