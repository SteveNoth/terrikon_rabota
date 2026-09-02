/**
 * Проверки SEO без сети и без базы.
 * Запуск: npx tsx src/lib/seo/run-tests.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCity, getDefaultCity } from "@/lib/geo";
import { getSphere, listSpheres } from "@/lib/professions";
import { canonicalPath } from "@/lib/seo/canonical";
import { buildJobPosting } from "@/lib/seo/job-posting";
import { ROBOTS_DISALLOW, robotsTxt } from "@/lib/seo/robots";
import { chunkEntries, sitemapDocument, urlsetXml } from "@/lib/seo/sitemap-xml";
import {
  cityHomeTitle,
  jobsTitle,
  mapTitle,
  vacancyTitleLine,
} from "@/lib/seo/titles";
import type { EmploymentType, SalaryPeriod, Source, WorkFormat } from "@prisma/client";

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

console.log("Этап 23 — SEO");

const gorlovka = getDefaultCity();
const donetsk = getCity("donetsk");
ok("активный город из geo", gorlovka.status === "active" && gorlovka.slug === "gorlovka");
ok("Донецк soon", donetsk?.status === "soon");

ok(
  "главная Горловки — loc из geo",
  cityHomeTitle(gorlovka.slug, "active") ===
    `Работа в ${gorlovka.name.loc} — свежие вакансии | Террикон Работа`,
  cityHomeTitle(gorlovka.slug, "active"),
);
ok(
  "главная Донецка — soon",
  donetsk
    ? cityHomeTitle(donetsk.slug, "soon") === `Работа в ${donetsk.name.loc} — скоро на Террикон Работа`
    : false,
);

ok(
  "список Горловки — gen",
  jobsTitle(gorlovka.slug) === `Вакансии ${gorlovka.name.gen} — поиск работы | Террикон Работа`,
  jobsTitle(gorlovka.slug),
);

const stroy = getSphere("stroitelstvo");
ok("у сферы есть предложный падеж", Boolean(stroy?.loc) && stroy?.loc === "строительстве");
ok(
  "сфера в заголовке",
  jobsTitle(gorlovka.slug, "stroitelstvo", 12) ===
    `Работа в строительстве в ${gorlovka.name.loc} — 12 вакансий`,
  jobsTitle(gorlovka.slug, "stroitelstvo", 12),
);

ok(
  "карта — gen",
  mapTitle(gorlovka.slug) === `Карта вакансий ${gorlovka.name.gen} | Террикон Работа`,
);

ok(
  "карточка вакансии",
  vacancyTitleLine({
    title: "Сварщик",
    citySlug: gorlovka.slug,
    salary: "45 000 – 60 000 ₽",
    isVahta: false,
  }) === `Сварщик в ${gorlovka.name.loc}, 45 000 – 60 000 ₽ | Террикон Работа`,
);

ok("канон режет page и sort", canonicalPath("/gorlovka/jobs", { page: "2", sort: "date" }) === "/gorlovka/jobs");
ok(
  "канон оставляет sphere",
  canonicalPath("/gorlovka/jobs", { sphere: "stroitelstvo", page: "2", mode: "lite" }) ===
    "/gorlovka/jobs?sphere=stroitelstvo",
);
ok("канон режет q", canonicalPath("/gorlovka/jobs", { q: "сварщик" }) === "/gorlovka/jobs");

const posting = buildJobPosting({
  id: "vac_1",
  slug: "svarshchik-1",
  title: "Сварщик",
  description: "Сварка в цехе.",
  summaryLine: "Сварка металлоконструкций",
  citySlug: "gorlovka",
  salaryFrom: 45000,
  salaryTo: 60000,
  salaryCurrency: "RUB",
  salaryPeriod: "MONTH" as SalaryPeriod,
  employmentType: "FULL" as EmploymentType,
  workFormat: "LOCAL" as WorkFormat,
  sphere: "stroitelstvo",
  publishedAt: new Date("2026-09-01T10:00:00.000Z"),
  lastSeenAt: new Date("2026-09-01T10:00:00.000Z"),
  isActive: true,
  source: "VK" as Source,
  sourceName: "Работа Горловка",
  sourceUrl: "https://vk.com/wall-1_1",
  employer: null,
});

ok("JobPosting тип", posting["@type"] === "JobPosting");
ok("JobPosting title", posting.title === "Сварщик");
ok("JobPosting дата", typeof posting.datePosted === "string");
ok("JobPosting страна", (posting.jobLocation as { address?: { addressCountry?: string } })?.address?.addressCountry === "RU");
ok("JobPosting язык", posting.inLanguage === "ru");
ok("JobPosting зарплата валюта", (posting.baseSalary as { currency?: string })?.currency === "RUB");
ok(
  "JobPosting период",
  (posting.baseSalary as { value?: { unitText?: string } })?.value?.unitText === "MONTH",
);
ok("JobPosting занятость", posting.employmentType === "FULL_TIME");
ok(
  "работодатель не сайт",
  (posting.hiringOrganization as { name?: string })?.name !== "Террикон Работа",
);
ok(
  "источник в описании",
  String(posting.description).includes("Источник") && String(posting.description).includes("агрегатор"),
);
ok("ссылка на оригинал", posting.sameAs === "https://vk.com/wall-1_1");
ok("издатель — Террикон", (posting.publisher as { name?: string })?.name === "Террикон Работа");

const employerPosting = buildJobPosting({
  id: "vac_2",
  slug: "prodavec-1",
  title: "Продавец",
  description: "Магазин",
  citySlug: "gorlovka",
  workFormat: "LOCAL" as WorkFormat,
  sphere: "torgovlya",
  publishedAt: new Date("2026-09-01T10:00:00.000Z"),
  lastSeenAt: new Date("2026-09-01T10:00:00.000Z"),
  isActive: true,
  source: "EMPLOYER" as Source,
  employer: { name: "Магазин «Центральный»" },
});
ok(
  "кабинет — имя работодателя",
  (employerPosting.hiringOrganization as { name?: string })?.name === "Магазин «Центральный»",
);

const robots = robotsTxt();
ok("robots закрывает /admin", ROBOTS_DISALLOW.includes("/admin") && robots.includes("Disallow: /admin"));
ok("robots закрывает /api", robots.includes("Disallow: /api"));
ok("robots закрывает /profile", robots.includes("Disallow: /profile"));
ok("robots закрывает /employer", robots.includes("Disallow: /employer"));
ok("robots указывает sitemap", robots.includes("Sitemap:") && robots.includes("/sitemap.xml"));
ok("robots закрывает page=", robots.includes("Disallow: /*?*page="));

const many = Array.from({ length: 5001 }, (_, index) => ({ loc: `https://example.test/${index}` }));
const split = sitemapDocument(many);
ok("sitemap режется после 5000", split.kind === "index" && split.kind === "index" && split.chunks.length === 2);
ok("первый кусок 5000", split.kind === "index" && split.chunks[0]!.length === 5000);
ok("второй кусок 1", split.kind === "index" && split.chunks[1]!.length === 1);
ok("маленький sitemap одним файлом", sitemapDocument([{ loc: "https://example.test/" }]).kind === "urlset");
ok("xml экранирует", urlsetXml([{ loc: "https://example.test/?a=1&b=2" }]).includes("&amp;"));
ok("chunk пустой не падает", chunkEntries([]).length === 1);

ok(
  "все сферы с loc",
  listSpheres().every((sphere) => sphere.loc.length > 0),
);

const professions = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", "professions.json"), "utf8")) as {
  spheres: { loc?: string }[];
};
ok(
  "loc лежит в professions.json",
  professions.spheres.every((sphere) => typeof sphere.loc === "string" && sphere.loc.length > 0),
);

const pages = ["src/app/help/page.tsx", "src/app/contacts/page.tsx", "src/app/terms/page.tsx", "src/app/about/page.tsx"];
for (const rel of pages) {
  ok(`есть ${rel}`, fs.existsSync(path.join(ROOT, rel)));
}
ok("есть JobPosting модуль", fs.existsSync(path.join(ROOT, "src/lib/seo/job-posting.ts")));
ok("есть sitemap route", fs.existsSync(path.join(ROOT, "src/app/sitemap.xml/route.ts")));
ok("есть robots route", fs.existsSync(path.join(ROOT, "src/app/robots.txt/route.ts")));
ok(
  "есть превью вакансии",
  fs.existsSync(path.join(ROOT, "src/app/[city]/job/[slug]/opengraph-image.tsx")),
);
ok("есть страница компании", fs.existsSync(path.join(ROOT, "src/app/[city]/company/[slug]/page.tsx")));

const nextConfig = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
ok("X-Robots-Tag на /admin", nextConfig.includes("X-Robots-Tag") && nextConfig.includes("/admin/:path*"));

const footer = fs.readFileSync(path.join(ROOT, "src/components/layout/Footer.tsx"), "utf8");
ok("футер ведёт на /help", footer.includes('href="/help"'));
ok("футер ведёт на /contacts", footer.includes('href="/contacts"'));
ok("футер ведёт на /terms", footer.includes('href="/terms"'));

const about = fs.readFileSync(path.join(ROOT, "src/app/about/page.tsx"), "utf8");
ok("about сохранил #plans", about.includes('id="plans"'));

const middleware = fs.readFileSync(path.join(ROOT, "src/middleware.ts"), "utf8");
ok(
  "ultra не перехватывает превью",
  middleware.includes('pathname.endsWith("/opengraph-image")') &&
    middleware.includes('pathname === "/robots.txt"') &&
    middleware.includes('pathname === "/sitemap.xml"'),
);

ok(
  "корень для Вебмастера не голый редирект",
  fs.readFileSync(path.join(ROOT, "src/middleware.ts"), "utf8").includes("isOwnershipProbe"),
);
ok(
  "постоянный хост Vercel важнее одноразового",
  fs.readFileSync(path.join(ROOT, "src/lib/seo/origin.ts"), "utf8").includes("VERCEL_PROJECT_PRODUCTION_URL"),
);

const pagesCopy = fs.readFileSync(path.join(ROOT, "src/lib/content/pages.ts"), "utf8");
ok(
  "тексты help/about без имён городов",
  !/Горловк|Донецк|Макеевк|Енакиев|Харцызск|Луганск/.test(pagesCopy),
);

if (failed > 0) {
  console.error(`\nПровалено: ${failed}, прошло: ${passed}`);
  process.exit(1);
}
console.log(`\nВсе ${passed} проверок прошли.`);
