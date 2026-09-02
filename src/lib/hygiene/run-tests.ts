/**
 * Проверки гигиены данных без записи в базу.
 * Запуск: npx tsx src/lib/hygiene/run-tests.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Source } from "@prisma/client";
import { DB_LIMIT_BYTES } from "@/lib/admin/constants";
import { EXPECTED_MIGRATIONS } from "@/lib/health/migrations";
import { parseCleanupArgs } from "@/lib/hygiene/args";
import {
  DB_MIGRATE_BYTES,
  DEACTIVATE_SKIP_SOURCES,
  DELETE_INACTIVE_AFTER_DAYS,
  INACTIVE_AFTER_DAYS,
  LEAVE_GEOCODE_CACHE,
  PARSER_RUN_DAYS,
  REJECTED_POST_DAYS,
  daysAgo,
} from "@/lib/hygiene/constants";
import type { CleanupPlan } from "@/lib/hygiene/plan";
import { forecastFromSamples, formatHorizon } from "@/lib/hygiene/forecast";
import { formatCleanupReport, formatSizeReportText } from "@/lib/hygiene/text";

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

console.log("Этап 25 — гигиена данных");

ok("30 дней до снятия с сайта", INACTIVE_AFTER_DAYS === 30);
ok("60 дней до удаления неактивных", DELETE_INACTIVE_AFTER_DAYS === 60);
ok("REJECTED живут 7 дней", REJECTED_POST_DAYS === 7);
ok("ParserRun живут 90 дней", PARSER_RUN_DAYS === 90);
ok("GeocodeCache не чистим", LEAVE_GEOCODE_CACHE === true);
ok("лимит базы 500 МБ совпадает с админкой", DB_LIMIT_BYTES === 500 * 1024 * 1024);
ok("порог переезда 400 МБ", DB_MIGRATE_BYTES === 400 * 1024 * 1024);

ok("ЦЗН не снимаем по lastSeenAt", DEACTIVATE_SKIP_SOURCES.includes(Source.TRUDVSEM));
ok("кабинет не снимаем по lastSeenAt", DEACTIVATE_SKIP_SOURCES.includes(Source.EMPLOYER));
ok("ручные не снимаем по lastSeenAt", DEACTIVATE_SKIP_SOURCES.includes(Source.MANUAL));

const now = new Date("2026-09-02T12:00:00.000Z");
ok("daysAgo 30 — 3 августа", daysAgo(30, now).toISOString().startsWith("2026-08-03"));

const none = parseCleanupArgs([]);
ok("без флагов — dry-run", none.dryRun && !none.apply);
const dry = parseCleanupArgs(["--dry-run"]);
ok("--dry-run ничего не применяет", dry.dryRun && !dry.apply);
const apply = parseCleanupArgs(["--apply"]);
ok("--apply пишет", apply.apply && !apply.dryRun);

const plan: CleanupPlan = {
  deactivate: 2,
  deleteVacancies: 3,
  deleteParsedPosts: 1,
  deleteParserRuns: 4,
  geocodeCacheKept: 12,
  totalDeletes: 8,
};
const report = formatCleanupReport(plan, true);
ok("отчёт говорит будет удалено", report.includes("будет удалено 8"));
ok("dry-run в отчёте", report.includes("--dry-run") && report.includes("ничего не удаляю"));
ok("GeocodeCache в отчёте как не трогаем", report.includes("GeocodeCache не трогаем: 12"));
ok("apply-отчёт без dry-run", formatCleanupReport(plan, false).includes("--apply"));

const first = forecastFromSamples({ currentBytes: 12_000_000, previousBytes: null, daysBetween: 0 });
ok("первый замер без прогноза", first.firstSample && first.daysToLimit == null);

const flat = forecastFromSamples({
  currentBytes: 20_000_000,
  previousBytes: 20_000_000,
  daysBetween: 7,
});
ok("нулевой прирост — не приближается", !flat.firstSample && flat.daysToLimit == null && flat.dailyBytes === 0);

const down = forecastFromSamples({
  currentBytes: 10_000_000,
  previousBytes: 12_000_000,
  daysBetween: 7,
});
ok("уменьшение помечаем", down.shrinking && down.daysToLimit == null);

const grow = forecastFromSamples({
  currentBytes: 100 * 1024 * 1024,
  previousBytes: 80 * 1024 * 1024,
  daysBetween: 7,
});
ok("рост даёт дни до 500 МБ", grow.daysToLimit != null && grow.daysToLimit > 100);
ok("рост даёт дни до 400 МБ", grow.daysToMigrate != null && (grow.daysToMigrate as number) < (grow.daysToLimit as number));
ok("горизонт месяцев", formatHorizon(90).includes("мес"));
ok("горизонт дней", formatHorizon(10).includes("дн"));

const sizeText = formatSizeReportText({
  bytes: 12_345_678,
  tableCounts: [
    { name: "Vacancy", count: 47 },
    { name: "GeocodeCache", count: 12 },
    { name: "AiCache", count: 0 },
  ],
  forecast: grow,
});
ok("отчёт размера с лимитом 500 МБ", /500(?:\.0)? МБ/.test(sizeText));
ok("GeocodeCache в отчёте размера помечен", sizeText.includes("не чистим"));
ok("пустые таблицы не шумят", !sizeText.includes("AiCache"));
ok("есть ссылка на MIGRATION", sizeText.includes("docs/MIGRATION.md"));

ok("миграция гигиены в списке", EXPECTED_MIGRATIONS.includes("20260902210000_data_hygiene"));
ok("файл миграции на месте", exists("prisma/migrations/20260902210000_data_hygiene/migration.sql"));

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

const cleanupSrc = read("src/lib/hygiene/cleanup.ts");
ok("очистка не удаляет GeocodeCache", !/geocodeCache\.delete/i.test(cleanupSrc));
ok("есть --dry-run в CLI", read("scripts/cleanup.ts").includes("--dry-run"));

const workflowCleanup = read(".github/workflows/hygiene-cleanup.yml");
ok("очистка по cron раз в сутки", workflowCleanup.includes("40 3 * * *"));
ok("очистка в Actions по умолчанию --apply", workflowCleanup.includes("--apply"));
ok("счётчики раз в час", read(".github/workflows/hygiene-counts.yml").includes("10 * * * *"));
ok("бэкап раз в неделю", read(".github/workflows/hygiene-backup.yml").includes("10 4 * * 0"));
ok("отчёт размера раз в неделю", read(".github/workflows/hygiene-size.yml").includes("20 4 * * 1"));
ok("бэкап восстанавливает на проверочную базу", read("scripts/ci/backup-and-verify.sh").includes("pg_restore"));
ok("бэкап только public", read("scripts/ci/backup-and-verify.sh").includes("--schema=public"));
ok("проверка таблиц после restore", read("scripts/ci/backup-and-verify.sh").includes("GeocodeCache"));

const migrationDoc = read("docs/MIGRATION.md");
ok("MIGRATION: порог 400 МБ", migrationDoc.includes("400 МБ"));
ok("MIGRATION: пауза Supabase", migrationDoc.includes("Paused") || migrationDoc.includes("засыпа"));
ok("MIGRATION: коммерция Hobby", migrationDoc.includes("Hobby") && migrationDoc.includes("коммерц"));
ok("MIGRATION: донаты", migrationDoc.includes("донат"));
ok("MIGRATION: 100 ГБ", migrationDoc.includes("100 ГБ"));
ok("MIGRATION: 1800 минут", migrationDoc.includes("1800"));
ok("MIGRATION: 8 минут парсера", migrationDoc.includes("8 минут"));
ok("MIGRATION: поиск 500 мс", migrationDoc.includes("500 мс"));
ok("MIGRATION: только DATABASE_URL", migrationDoc.includes("DATABASE_URL"));

ok("дашборд гигиены", read("src/app/admin/health/page.tsx").includes("Гигиена диска"));
ok("команда бэкапа есть", exists("scripts/backup-db.mjs"));
ok("API счётчиков", exists("src/app/api/ops/counts/route.ts"));
ok("API отчёта размера", exists("src/app/api/ops/size/route.ts"));

if (failed) {
  console.error(`\nПровалено: ${failed}, прошло: ${passed}`);
  process.exit(1);
}

console.log(`\nВсе ${passed} проверок прошли.`);
