/**
 * Проверки Telegram-бота без сети и без базы.
 * Запуск: npx tsx src/lib/telegram/run-tests.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCity, getDefaultCity, getSoonCities } from "@/lib/geo";
import { CALLBACK, REPLY_BUTTONS, TELEGRAM_MAX_PER_HOUR, TELEGRAM_SECRET_HEADER } from "@/lib/telegram/constants";
import { deliveryGroupKey, isAnySphereToken, parseKeywords, remainingHourQuota, vacancyMatchesSubscription } from "@/lib/telegram/match";
import { parseUpdate } from "@/lib/telegram/parse";
import { cityInactiveText, startText } from "@/lib/telegram/texts";
import { generateTelegramLinkCode, isTelegramLinkCode } from "@/lib/seeker/link-code";
import { planDeliveries, type PlanSubscriber, type PlanVacancy } from "@/lib/telegram/plan";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let failed = 0;
let passed = 0;

function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("Этап 22 — Telegram-бот");

const active = getDefaultCity();
const donetsk = getCity("donetsk");
const makeevka = getCity("makeevka");
ok("в geo есть активный город", Boolean(active));
ok("в geo есть Донецк", Boolean(donetsk));
ok("в geo есть Макеевка", Boolean(makeevka));

const start = startText();
ok("start берёт родительный из geo", start.includes(active.name.gen));
ok("start упоминает soon из geo", getSoonCities().slice(0, 2).every((city) => start.includes(city.name.nom)));

const inactive = donetsk ? cityInactiveText(donetsk) : "";
ok(
  "неактивный город — вежливый ответ про разработку",
  inactive === `Пока в ${donetsk?.name.loc} вакансий нет, город в разработке. Возвращаю к ${active.name.loc}.`,
  inactive,
);

ok("квота часа полная", remainingHourQuota(0) === TELEGRAM_MAX_PER_HOUR);
ok("квота часа исчерпана", remainingHourQuota(TELEGRAM_MAX_PER_HOUR) === 0);
ok("квота часа остаток", remainingHourQuota(3) === TELEGRAM_MAX_PER_HOUR - 3);

ok("слова через запятую", parseKeywords("Сварщик, продавец").join("|") === "сварщик|продавец");
ok("пустые слова отбрасываются", parseKeywords(" , , ").length === 0);
ok("любая сфера", isAnySphereToken("Любая сфера") && isAnySphereToken("*"));

ok(
  "подписка совпадает по слову в названии",
  vacancyMatchesSubscription(
    {
      id: "1",
      title: "Сварщик на завод",
      summaryLine: null,
      professionSlug: "svarshchik",
      sphere: "stroitelstvo",
      citySlug: "gorlovka",
      groupId: null,
    },
    { citySlug: "gorlovka", keywords: ["сварщик"], spheres: [] },
  ),
);
ok(
  "чужой город не совпадает",
  !vacancyMatchesSubscription(
    {
      id: "1",
      title: "Сварщик",
      summaryLine: null,
      professionSlug: "svarshchik",
      sphere: "stroitelstvo",
      citySlug: "gorlovka",
      groupId: null,
    },
    { citySlug: "donetsk", keywords: ["сварщик"], spheres: [] },
  ),
);
ok(
  "сфера режет выдачу",
  !vacancyMatchesSubscription(
    {
      id: "1",
      title: "Сварщик",
      summaryLine: null,
      professionSlug: "svarshchik",
      sphere: "stroitelstvo",
      citySlug: "gorlovka",
      groupId: null,
    },
    { citySlug: "gorlovka", keywords: [], spheres: ["torgovlya"] },
  ),
);
ok("группа дублей — один ключ", deliveryGroupKey({ id: "v1", groupId: "g1" }) === "g1");
ok("без группы ключ = id", deliveryGroupKey({ id: "v1", groupId: null }) === "v1");

const startUpdate = parseUpdate({
  message: { chat: { id: 111 }, text: "/start" },
});
ok("парсит /start", startUpdate.kind === "command" && startUpdate.command === "start");

const startStringId = parseUpdate({
  message: { chat: { id: "111" }, text: "/start" },
});
ok("chat.id строкой тоже /start", startStringId.kind === "command" && startStringId.chatId === "111");

const linkUpdate = parseUpdate({
  message: { chat: { id: 111 }, text: "/link ABCD2345" },
});
ok(
  "парсит /link",
  linkUpdate.kind === "command" && linkUpdate.command === "link" && linkUpdate.args === "ABCD2345",
);

const deep = parseUpdate({
  message: { chat: { id: 111 }, text: `/start ${generateTelegramLinkCode()}` },
});
ok("deep link /start КОД", deep.kind === "command" && deep.command === "start" && isTelegramLinkCode(deep.args));

const btn = parseUpdate({
  message: { chat: { id: 111 }, text: REPLY_BUTTONS.latest },
});
ok("кнопка «Свежие» = /latest", btn.kind === "command" && btn.command === "latest");

const cityCb = parseUpdate({
  callback_query: {
    id: "cb1",
    data: `${CALLBACK.cityPrefix}donetsk`,
    message: { chat: { id: 222 } },
  },
});
ok("callback города", cityCb.kind === "callback" && cityCb.data === "c:donetsk");

const code = generateTelegramLinkCode();
const asLink = parseUpdate({ message: { chat: { id: 1 }, text: code } });
ok("голый код это /link", asLink.kind === "command" && asLink.command === "link");

const unknown = parseUpdate({ message: { chat: { id: 1 }, text: "привет бот" } });
ok("непонятный текст", unknown.kind === "text");

function fakeVacancy(id: string, extra: Partial<PlanVacancy> = {}): PlanVacancy {
  return {
    id,
    title: extra.title ?? "Сварщик",
    summaryLine: extra.summaryLine ?? null,
    professionSlug: extra.professionSlug ?? "svarshchik",
    sphere: extra.sphere ?? "stroitelstvo",
    citySlug: extra.citySlug ?? "gorlovka",
    groupId: extra.groupId ?? null,
    publishedAt: extra.publishedAt ?? new Date("2026-09-02T12:00:00Z"),
  };
}

function fakeSub(id: string, extra: Partial<PlanSubscriber> = {}): PlanSubscriber {
  return {
    id,
    citySlug: extra.citySlug ?? "gorlovka",
    keywords: extra.keywords ?? ["сварщик"],
    spheres: extra.spheres ?? [],
    createdAt: extra.createdAt ?? new Date("2026-09-01T00:00:00Z"),
  };
}

const v1 = fakeVacancy("v1");
const v1dup = fakeVacancy("v1b", { groupId: "grp", title: "Сварщик дубль" });
const v1primary = fakeVacancy("v1a", { groupId: "grp" });
const plan = planDeliveries(
  [fakeSub("s1")],
  [v1primary, v1dup, v1],
  new Map([["s1", new Set()]]),
  new Map([["s1", 0]]),
);
ok("дубли группы — одно сообщение", plan.planned.filter((item) => item.groupKey === "grp").length === 1);
ok("одиночная вакансия тоже в плане", plan.planned.some((item) => item.vacancy.id === "v1"));

const already = planDeliveries(
  [fakeSub("s1")],
  [v1],
  new Map([["s1", new Set(["v1"])]]),
  new Map([["s1", 0]]),
);
ok("уже отправленную не планируем", already.planned.length === 0 && already.skippedDup >= 1);

const rated = planDeliveries(
  [fakeSub("s1")],
  [fakeVacancy("a"), fakeVacancy("b"), fakeVacancy("c")],
  new Map([["s1", new Set()]]),
  new Map([["s1", TELEGRAM_MAX_PER_HOUR]]),
);
ok("лимит в час не превышается", rated.planned.length === 0 && rated.skippedRate >= 1);

ok("секретный заголовок Telegram", TELEGRAM_SECRET_HEADER === "x-telegram-bot-api-secret-token");

const law3Files = [
  "src/lib/telegram/texts.ts",
  "src/lib/telegram/handler.ts",
  "src/lib/telegram/keyboards.ts",
  "src/lib/telegram/parse.ts",
  "src/lib/telegram/plan.ts",
  "src/app/api/telegram/webhook/route.ts",
  "src/app/api/telegram/notify/route.ts",
];
const cityLiterals = /Горловк|Донецк|Макеевк|Енакиев|Харцызск|Луганск/;
for (const rel of law3Files) {
  const body = fs.readFileSync(path.join(ROOT, rel), "utf8");
  ok(`Закон 3: нет города строкой в ${path.basename(rel)}`, !cityLiterals.test(body));
}

const workflows = [
  ".github/workflows/parser-vk.yml",
  ".github/workflows/parser-tg.yml",
  ".github/workflows/parser-web.yml",
  ".github/workflows/parser-trudvsem.yml",
];
for (const rel of workflows) {
  const body = fs.readFileSync(path.join(ROOT, rel), "utf8");
  ok(`рассылка после ${path.basename(rel)}`, body.includes("scripts/ci/telegram-notify.sh"));
}

const notifySh = fs.readFileSync(path.join(ROOT, "scripts/ci/telegram-notify.sh"), "utf8");
ok("скрипт бьёт notify", notifySh.includes("/api/telegram/notify"));
ok("скрипт ходит с Bearer", notifySh.includes("Authorization: Bearer"));

const upload = fs.readFileSync(path.join(ROOT, "src/app/api/parser/upload/route.ts"), "utf8");
ok("upload не шлёт в Telegram", !upload.includes("telegram/notify") && !upload.includes("dispatchTelegram"));

const resetRoute = fs.readFileSync(path.join(ROOT, "src/app/auth/callback/reset/route.ts"), "utf8");
ok(
  "reset callback не реэкспортит dynamic",
  resetRoute.includes("export { GET }") && !resetRoute.includes("export { GET, dynamic }"),
);

if (failed > 0) {
  console.error(`\nПровалено: ${failed}, прошло: ${passed}`);
  process.exit(1);
}
console.log(`\nВсе ${passed} проверок прошли.`);
