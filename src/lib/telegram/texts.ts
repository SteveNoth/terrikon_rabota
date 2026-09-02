/**
 * Все фразы бота. Названия городов — только из geo.json и падежей (Закон 3).
 */
import {
  getActiveCities,
  getAllCities,
  getCity,
  getDefaultCity,
  getPlannedCities,
  getSoonCities,
  type City,
} from "@/lib/geo";
import { getSphere, listSpheres } from "@/lib/professions";
import { TELEGRAM_MAX_PER_HOUR } from "@/lib/telegram/constants";

function joinNames(names: string[]): string {
  if (names.length === 0) {
    return "";
  }
  if (names.length === 1) {
    return names[0]!;
  }
  if (names.length === 2) {
    return `${names[0]} и ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;
}

function activeCity(): City {
  return getActiveCities()[0] ?? getDefaultCity();
}

function soonPreview(): string {
  const soon = getSoonCities();
  if (soon.length === 0) {
    return "другие города";
  }
  const first = soon.slice(0, 2).map((city) => city.name.nom);
  if (soon.length > 2) {
    return `${first.join(", ")} и другие города`;
  }
  return `${joinNames(first)} и другие города`;
}

export function startText(): string {
  const city = activeCity();
  return [
    `Привет! Я бот вакансий ${city.name.gen}.`,
    `Пока работаем только здесь, но скоро подключим ${soonPreview()}.`,
    "",
    "Кнопки внизу экрана — подписка, свежие вакансии, город. Команды тоже работают.",
  ].join("\n");
}

export function helpText(): string {
  return [
    "Что умею:",
    "• Подписка — профессия или слова и сфера. Город берётся из активных.",
    "• Свежие — последние 5 вакансий вашего города.",
    "• Город — список из справочника. Неактивный город вежливо верну к текущему активному.",
    "• Отписка — больше не присылать новое.",
    "• /link КОД — привязка к кабинету на сайте (код в профиле).",
    "",
    "Непонятное сообщение — напишите иначе или нажмите «Помощь».",
  ].join("\n");
}

export function unknownText(): string {
  return "Не понял сообщение. Нажмите кнопку внизу или «Помощь» — там список команд.";
}

export function askKeywordsText(): string {
  return "Какую профессию или ключевые слова искать? Например: сварщик, продавец. Можно несколько через запятую.";
}

export function askSphereText(keywords: string[]): string {
  const shown = keywords.length ? keywords.join(", ") : "без слов";
  return `Слова: ${shown}.\nТеперь сфера — кнопка ниже или «Любая сфера».`;
}

export function askLinkCodeText(): string {
  return "Пришлите код привязки из кабинета на сайте (команда /link КОД или просто восемь символов).";
}

export function subscribedText(input: {
  citySlug: string;
  keywords: string[];
  spheres: string[];
}): string {
  const city = getCity(input.citySlug) ?? activeCity();
  const words = input.keywords.length ? input.keywords.join(", ") : "любые слова";
  const spheres =
    input.spheres.length > 0
      ? input.spheres.map((slug) => getSphere(slug)?.name ?? slug).join(", ")
      : "любая сфера";
  return `Подписка сохранена. Город: ${city.name.nom}. Ищу: ${words}. Сфера: ${spheres}.\nНовые вакансии придут сюда, каждую — один раз, не чаще ${TELEGRAM_MAX_PER_HOUR} сообщений в час.`;
}

export function alreadyUnsubscribedText(): string {
  return "Подписки и так нет. Чтобы включить — кнопка «Подписка».";
}

export function unsubscribedText(): string {
  return "Подписку отключил. Новые вакансии приходить не будут. Вернуть — кнопка «Подписка».";
}

export function cityListText(): string {
  const active = getActiveCities();
  const soon = getSoonCities();
  const planned = getPlannedCities();
  const lines = ["Какой город смотреть? Кнопка ниже."];
  if (active.length) {
    lines.push(`Сейчас с вакансиями: ${joinNames(active.map((city) => city.name.nom))}.`);
  }
  if (soon.length) {
    lines.push(`Скоро: ${joinNames(soon.map((city) => city.name.nom))}.`);
  }
  if (planned.length) {
    lines.push(`В планах: ${joinNames(planned.map((city) => city.name.nom))}.`);
  }
  return lines.join("\n");
}

export function cityActiveSetText(city: City): string {
  return `Город: ${city.name.nom}. Новые вакансии и «Свежие» — для ${city.name.gen}.`;
}

export function cityInactiveText(city: City): string {
  const fallback = activeCity();
  return `Пока в ${city.name.loc} вакансий нет, город в разработке. Возвращаю к ${fallback.name.loc}.`;
}

export function cityUnknownText(): string {
  const names = getAllCities().map((city) => city.name.nom);
  return `Такого города в справочнике нет. Есть: ${joinNames(names)}.`;
}

export function latestEmptyText(citySlug: string): string {
  const city = getCity(citySlug) ?? activeCity();
  return `Пока нет опубликованных вакансий ${city.name.gen}.`;
}

export function latestIntroText(citySlug: string, count: number): string {
  const city = getCity(citySlug) ?? activeCity();
  return `Последние ${count} вакансий ${city.name.gen}:`;
}

export function linkBadCodeText(): string {
  return "Не нашёл такой код. Откройте кабинет на сайте, скопируйте код привязки и пришлите /link КОД.";
}

export function linkOkText(): string {
  return "Telegram привязан к аккаунту на сайте. Если в кабинете включены уведомления — новые вакансии придут сюда.";
}

export function linkAlreadyText(): string {
  return "Этот чат уже привязан к кабинету. Новый код перепривяжет к другому аккаунту.";
}

export function spheresForButtons(): { slug: string; name: string }[] {
  return listSpheres().map((sphere) => ({ slug: sphere.slug, name: sphere.name }));
}
