/**
 * Проверки модуля поддержки без сети.
 * Запуск: npx tsx src/lib/support/run-tests.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeNextPath } from "@/lib/auth/next-path";
import { staticSitemapPaths } from "@/lib/seo/sitemap";
import {
  getSupportGoal,
  getSupportMethods,
  isSupportEnabled,
} from "@/lib/support";
import { renderSupportPage } from "@/ultra/support";
import {
  canShowSupportAskFrom,
  SUPPORT_ASK_COOKIE,
  SUPPORT_ASK_VISIT_COOKIE,
  SUPPORT_DISMISSED_COOKIE,
  supportDismissHref,
} from "@/lib/support/ask";

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

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("Этап 27 — поддержка проекта");

const previous = process.env.NEXT_PUBLIC_DONATIONS_ENABLED;
delete process.env.NEXT_PUBLIC_DONATIONS_ENABLED;
ok("без переменной выключено", isSupportEnabled() === false);
process.env.NEXT_PUBLIC_DONATIONS_ENABLED = "false";
ok("false — выключено", isSupportEnabled() === false);
process.env.NEXT_PUBLIC_DONATIONS_ENABLED = "TRUE";
ok("TRUE не включает — только true", isSupportEnabled() === false);
process.env.NEXT_PUBLIC_DONATIONS_ENABLED = "true";
ok("true — включено", isSupportEnabled() === true);

ok(
  "sitemap без модуля не содержит /support",
  (() => {
    process.env.NEXT_PUBLIC_DONATIONS_ENABLED = "false";
    return !staticSitemapPaths().includes("/support");
  })(),
);
ok(
  "sitemap с модулем содержит /support",
  (() => {
    process.env.NEXT_PUBLIC_DONATIONS_ENABLED = "true";
    return staticSitemapPaths().includes("/support");
  })(),
);

process.env.NEXT_PUBLIC_DONATIONS_ENABLED = "true";
const emptyCookies = () => undefined;
ok("просьбу можно показать без cookie", canShowSupportAskFrom(emptyCookies) === true);
ok(
  "закрытие на 30 дней прячет просьбу",
  canShowSupportAskFrom((name) => (name === SUPPORT_DISMISSED_COOKIE ? "1" : undefined)) === false,
);
ok(
  "уже показали в этом посещении",
  canShowSupportAskFrom((name) => (name === SUPPORT_ASK_VISIT_COOKIE ? "1" : undefined)) === false,
);
ok(
  "показали меньше 7 дней назад",
  canShowSupportAskFrom((name) =>
    name === SUPPORT_ASK_COOKIE ? String(Math.floor(Date.now() / 1000) - 60) : undefined,
  ) === false,
);
ok(
  "показали больше 7 дней назад — снова можно",
  canShowSupportAskFrom((name) =>
    name === SUPPORT_ASK_COOKIE ? String(Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60) : undefined,
  ) === true,
);

process.env.NEXT_PUBLIC_DONATIONS_ENABLED = "false";
ok("при выключенном модуле просьбы нет", canShowSupportAskFrom(emptyCookies) === false);
ok("ultra без модуля — нет страницы", renderSupportPage() === null);

process.env.NEXT_PUBLIC_DONATIONS_ENABLED = "true";
const ultraPage = renderSupportPage();
ok("ultra страница собирается", Boolean(ultraPage));
ok(
  "ultra без картинок",
  Boolean(ultraPage && !ultraPage.body.includes("<img") && !ultraPage.body.includes("qr-")),
);
ok("ultra без script", Boolean(ultraPage && !ultraPage.body.includes("<script")));
ok(
  "ultra реквизиты из JSON",
  Boolean(ultraPage && ultraPage.body.includes("+79937689200")),
);
ok("ultra без чужих ссылок и QR", Boolean(ultraPage && !ultraPage.body.includes("boosty") && !ultraPage.body.includes("yoomoney") && !ultraPage.body.includes("qr-")));

process.env.NEXT_PUBLIC_DONATIONS_ENABLED = previous;

const methods = getSupportMethods();
ok("есть включённые способы", methods.length >= 1 && methods.every((method) => method.enabled));
ok("пока только СБП", methods.length === 1 && methods[0]?.id === "sbp");
ok(
  "у способа есть реквизит текстом",
  methods.every((method) => method.requisite.length > 0),
);
ok("у включённых нет QR", methods.every((method) => !method.qrFile));
ok("USDT выключен в JSON", !methods.some((method) => method.id === "usdt"));

const goal = getSupportGoal();
ok("цель месяца из JSON", goal.target > 0 && goal.collected >= 0 && goal.percent >= 0);
ok("подпись цели не пустая", goal.targetLabel.includes("₽") && goal.monthLabel.length > 0);

ok(
  "закрытие — безопасный next",
  supportDismissHref("/gorlovka/jobs") === "/api/hosting/dismiss?next=%2Fgorlovka%2Fjobs",
);
ok("чужой next отсекается", safeNextPath("https://evil.example", "/") === "/");

const indexFile = read("src/lib/support/index.ts");
ok(
  "переменную читает только index.ts",
  indexFile.includes("NEXT_PUBLIC_DONATIONS_ENABLED") &&
    /единственное место/i.test(indexFile),
);

const envHits: string[] = [];
function walk(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      continue;
    }
    const rel = path.relative(ROOT, full).replaceAll("\\", "/");
    if (rel === "src/lib/support/index.ts" || rel.endsWith("/run-tests.ts")) {
      continue;
    }
    if (read(rel).includes("NEXT_PUBLIC_DONATIONS_ENABLED")) {
      envHits.push(rel);
    }
  }
}
walk(path.join(ROOT, "src"));
ok("в src переменную больше никто не читает", envHits.length === 0, envHits.join(", "));

const componentDir = path.join(ROOT, "src", "components", "support");
const componentFiles = fs.readdirSync(componentDir).filter((name) => name.endsWith(".tsx"));
const amountLeak = /2000|\+79937689200|0000 0000 0000|410000000000000|boosty\.to|example-invalid/;
for (const name of componentFiles) {
  const text = read(path.join("src", "components", "support", name));
  ok(`${name} без реквизитов и сумм`, !amountLeak.test(text));
}
ok(
  "страница /support без зашитых реквизитов",
  !amountLeak.test(read("src/app/hosting/page.tsx")),
);

ok("есть shared/support.json", exists("shared/support.json"));
ok("есть страница хостинга (адрес /support)", exists("src/app/hosting/page.tsx"));
ok("папки src/app/support нет", !exists("src/app/support"));
ok(
  "middleware переписывает /support → /hosting",
  read("src/middleware.ts").includes('pathname === "/support"') &&
    read("src/middleware.ts").includes('pathname = "/hosting"'),
);
ok(
  "кнопка доната в шапке не скрыта на узком экране",
  !read("src/components/support/SupportHeaderButton.tsx").includes("hidden") &&
    read("src/components/support/SupportHeaderButton.tsx").includes("tr-support-flame"),
);
ok(
  "ultra шапка не прячет донат на узком экране",
  !read("src/ultra/css.ts").includes(".header .tr-support-flame{display:none}"),
);
ok(
  "шапка на узком экране в две строки",
  read("src/components/layout/Header.tsx").includes("site-header-bar") &&
    read("src/components/layout/Header.tsx").includes("site-header-tg") &&
    read("src/styles/globals.css").includes("grid-template-columns: minmax(0, 1fr) auto"),
);
ok("есть инструкция включения", exists("docs/ADD-DONATIONS.md"));
ok("есть шаблон отчёта", exists("docs/support/ШАБЛОН.md"));
ok("есть QR СБП", exists("public/hosting/qr-sbp.svg"));
ok("есть QR Boosty", exists("public/hosting/qr-boosty.svg"));
ok("есть QR ЮMoney", exists("public/hosting/qr-yoomoney.svg"));
for (const name of ["qr-sbp.svg", "qr-boosty.svg", "qr-yoomoney.svg", "qr-usdt.svg"]) {
  const bytes = fs.statSync(path.join(ROOT, "public", "hosting", name)).size;
  ok(`${name} ≤ 15 КБ`, bytes <= 15 * 1024, `${bytes} байт`);
}
ok(
  "выключатель в .env.example",
  read(".env.example").includes("NEXT_PUBLIC_DONATIONS_ENABLED=false"),
);

const example = JSON.parse(read("shared/support.json")) as {
  methods: { qrFile: string; enabled: boolean }[];
};
for (const method of example.methods) {
  if (!method.qrFile) {
    continue;
  }
  ok(`файл QR ${method.qrFile}`, exists(`public${method.qrFile}`));
}

if (failed > 0) {
  console.error(`\nПровалено: ${failed}, прошло: ${passed}`);
  process.exit(1);
}
console.log(`\nВсе ${passed} проверок прошли.`);
