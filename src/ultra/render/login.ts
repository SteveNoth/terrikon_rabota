import { getDefaultCity, isSelectableCity } from "@/lib/geo";
import { attr } from "@/ultra/html";

function nextPath(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}

export function renderLogin(cityHint: string | undefined, nextRaw: string | null): {
  title: string;
  description: string;
  body: string;
} {
  const citySlug = cityHint && isSelectableCity(cityHint) ? cityHint : getDefaultCity().slug;
  const next = nextPath(nextRaw, `/${citySlug}/jobs`);

  const body = `<article class="wrap article">
<h1>Вход</h1>
<p class="muted">Смотреть вакансии можно без регистрации. Чтобы откликнуться, позже понадобится аккаунт — сейчас вход ещё не подключен.</p>
<p><a class="btn btn-primary" href="${attr(next)}">Вернуться к вакансии</a></p>
</article>`;

  return {
    title: "Вход | Террикон Работа",
    description: "Войти, чтобы откликнуться на вакансию.",
    body,
  };
}
