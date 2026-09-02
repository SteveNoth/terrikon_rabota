/**
 * Проверки наблюдаемости без сети.
 * Запуск: npx tsx src/lib/health/run-tests.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isApiErrorBody } from "@/lib/api/response";
import { EXPECTED_MIGRATIONS } from "@/lib/health/migrations";
import { healthHttpStatus } from "@/lib/health/status";
import {
  acceptedZeroTwice,
  evaluateParserAlerts,
  isParserStale,
  type ParserRunSnapshot,
} from "@/lib/health/parsers";
import { redact } from "@/lib/log";
import { parseRumPayload } from "@/lib/rum/parse";

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

console.log("Этап 24 — наблюдаемость");

const budgetsFile = fs.readFileSync(path.join(ROOT, "scripts", "budgets.mjs"), "utf8");
ok("в check:budget зашиты потолки 8.5", /js: 220/.test(budgetsFile) && /js: 90/.test(budgetsFile) && /js: 0/.test(budgetsFile));
ok("запрещён импорт maplibre-gl в бандл Next", budgetsFile.includes('"maplibre-gl"'));

const hidden = redact({
  email: "ivan@example.com",
  phone: "+7 949 123-45-67",
  password: "hunter2",
  token: "secret-token-value",
  count: 12,
  city: "gorlovka",
});
ok(
  "логгер прячет почту",
  typeof hidden === "object" && hidden !== null && (hidden as { email: string }).email === "[скрыто]",
);
ok(
  "логгер прячет телефон",
  typeof hidden === "object" && hidden !== null && (hidden as { phone: string }).phone === "[скрыто]",
);
ok(
  "логгер прячет пароль по имени поля",
  typeof hidden === "object" && hidden !== null && (hidden as { password: string }).password === "[скрыто]",
);
ok(
  "счётчик и город остаются",
  typeof hidden === "object" &&
    hidden !== null &&
    (hidden as { count: number; city: string }).count === 12 &&
    (hidden as { city: string }).city === "gorlovka",
);

const dbUrl = redact("postgres://user:p4ss@db.example.com:5432/app");
ok("строка postgres вычищена", typeof dbUrl === "string" && !dbUrl.includes("p4ss") && dbUrl.includes("[скрыто]"));

const bearer = redact("Authorization Bearer abcdef0123456789abcdef0123456789");
ok("Bearer не светится", typeof bearer === "string" && !bearer.includes("abcdef0123456789abcdef0123456789"));

ok(
  "ошибка API одного формата",
  isApiErrorBody({ ok: false, code: "INTERNAL", message: "Не получилось обработать запрос. Попробуйте ещё раз." }),
);
ok("успех не маскируется под ошибку", !isApiErrorBody({ vacancies: [], total: 0 }));

ok("health 200 при ok", healthHttpStatus({ status: "ok" }) === 200);
ok("health 200 при degraded", healthHttpStatus({ status: "degraded" }) === 200);
ok("health 503 при down", healthHttpStatus({ status: "down" }) === 503);

const now = new Date("2026-09-02T12:00:00.000Z");
const hour = 3_600_000;
const vkOld: ParserRunSnapshot = {
  parser: "parser_vk",
  startedAt: new Date(now.getTime() - 7 * hour),
  finishedAt: new Date(now.getTime() - 7 * hour + 60_000),
  postsAccepted: 2,
  vacanciesCreated: 2,
};
const webRecentish: ParserRunSnapshot = {
  parser: "parser_web",
  startedAt: new Date(now.getTime() - 7 * hour),
  finishedAt: new Date(now.getTime() - 7 * hour + 60_000),
  postsAccepted: 1,
  vacanciesCreated: 1,
};

ok("ВК без запуска 7 ч — затих", isParserStale([vkOld], now, "parser_vk"));
ok("сайт без запуска 7 ч — ещё жив (окно 26 ч)", !isParserStale([webRecentish], now, "parser_web"));
ok("ни одного запуска — затих", isParserStale([], now, "parser_vk"));

const zeroA: ParserRunSnapshot = {
  parser: "parser_tg",
  startedAt: new Date(now.getTime() - 6 * hour),
  finishedAt: new Date(now.getTime() - 6 * hour + 10_000),
  postsAccepted: 0,
  vacanciesCreated: 0,
};
const zeroB: ParserRunSnapshot = {
  parser: "parser_tg",
  startedAt: new Date(now.getTime() - 3 * hour),
  finishedAt: new Date(now.getTime() - 3 * hour + 10_000),
  postsAccepted: 0,
  vacanciesCreated: 0,
};
ok("ноль два раза подряд", acceptedZeroTwice([zeroA, zeroB]));
ok("одного нуля мало", !acceptedZeroTwice([zeroA]));

const alerts = evaluateParserAlerts(
  new Map([
    ["parser_vk", [vkOld]],
    ["parser_tg", [zeroA, zeroB]],
    ["parser_web", [webRecentish]],
    ["parser_trudvsem", []],
  ]),
  now,
);
ok(
  "уснувший ВК даёт тревогу",
  alerts.some((item) => item.parser === "parser_vk" && item.kind === "stale"),
);
ok(
  "два нуля Telegram — тревога",
  alerts.some((item) => item.parser === "parser_tg" && item.kind === "zero_twice"),
);
ok(
  "сайт за 7 ч не орёт",
  !alerts.some((item) => item.parser === "parser_web"),
);
ok(
  "ЦЗН без запусков — stale по своему окну",
  alerts.some((item) => item.parser === "parser_trudvsem" && item.kind === "stale"),
);

const rum = parseRumPayload({ lcpMs: 1234.6, cls: 0.04123, inpMs: 80, email: "no@no.no" }, "lite");
ok("rum берёт режим с сервера", rum?.qualityMode === "lite");
ok("rum округляет LCP", rum?.lcpMs === 1235);
ok("rum не хранит почту", rum != null && !("email" in rum));
ok("слишком большой LCP отбрасывается", parseRumPayload({ lcpMs: 999_999 }, "full")?.lcpMs == null);

const folders = fs
  .readdirSync(path.join(ROOT, "prisma", "migrations"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
ok(
  "список миграций совпадает с папкой",
  folders.join(",") === [...EXPECTED_MIGRATIONS].sort().join(","),
  `папка=${folders.join(",")} список=${[...EXPECTED_MIGRATIONS].sort().join(",")}`,
);

const errorPage = fs.readFileSync(path.join(ROOT, "src", "app", "error.tsx"), "utf8");
ok("error.tsx без Application error", !errorPage.includes("Application error"));
ok("error.tsx с кнопкой Вернуться", errorPage.includes("Вернуться") || errorPage.includes("ErrorScreen"));

const healthPage = fs.readFileSync(path.join(ROOT, "src", "app", "admin", "health", "page.tsx"), "utf8");
ok("дашборд показывает Ultra", healthPage.includes("Ultra Lite"));
ok("дашборд объясняет паузу Supabase", healthPage.includes("Paused") || healthPage.includes("уснул"));

if (failed) {
  console.error(`\nПровалено: ${failed}, прошло: ${passed}`);
  process.exit(1);
}

console.log(`\nВсе ${passed} проверок прошли.`);
