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
  const next = nextPath(nextRaw, "/auth/login");
  const href = next.startsWith("/auth/") ? next : `/auth/login?next=${encodeURIComponent(next)}`;

  const body = `<article class="wrap article">
<h1>Вход</h1>
<p class="muted">Смотреть вакансии можно без регистрации. Вход и кабинет — отдельная страница с формами.</p>
<p><a class="btn btn-primary" href="${attr(href)}">Перейти ко входу</a></p>
</article>`;

  return {
    title: "Вход | Террикон Работа",
    description: "Войти, чтобы откликнуться на вакансию.",
    body,
  };
}
