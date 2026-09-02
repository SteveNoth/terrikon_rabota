/**
 * План запроса и время списка вакансий.
 *
 *   node scripts/bench-vacancies.mjs
 *     EXPLAIN ANALYZE текущего списка (12+3 сида) и замер findMany + count.
 *
 *   node scripts/bench-vacancies.mjs --load
 *     Добавляет 5000 разметок, меряет, удаляет. Сайт на это время раздувается —
 *     скрипт сам подчищает строки с externalId «bench-».
 *
 *   node scripts/bench-vacancies.mjs --api
 *     Стучится в /api/vacancies (BENCH_ORIGIN, по умолчанию http://127.0.0.1:3000)
 *     и печатает Server-Timing. С домашнего ПК до Франкфурта в бюджете 400 мс
 *     сидит дорога, не сам SELECT — смотрите «dbMs» из EXPLAIN, не HTTP.
 *
 * Индекс, который должен появиться в плане:
 *   Vacancy_citySlug_isActive_workFormat_publishedAt_idx
 * Именно он обслуживает разделение вахт и местных (Закон 17).
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });

const prisma = new PrismaClient();
const CITY = "gorlovka";
const LOAD = process.argv.includes("--load");
const HIT_API = process.argv.includes("--api");
const ORIGIN = process.env.BENCH_ORIGIN ?? "http://127.0.0.1:3000";
const TARGET = LOAD ? 5000 : 0;

const LIST_SQL = `
SELECT "id"
FROM "Vacancy"
WHERE "isActive" = true
  AND "moderationStatus" IN ('AUTO_OK'::"ModerationStatus", 'APPROVED'::"ModerationStatus")
  AND "citySlug" = '${CITY}'
  AND "workFormat" = 'LOCAL'::"WorkFormat"
  AND (
    "groupId" IS NULL
    OR EXISTS (SELECT 1 FROM "VacancyGroup" g WHERE g."primaryVacancyId" = "Vacancy"."id")
  )
ORDER BY "publishedAt" DESC
LIMIT 20 OFFSET 0
`;

const COUNT_SQL = `
SELECT COUNT(*)::int AS total
FROM "Vacancy"
WHERE "isActive" = true
  AND "moderationStatus" IN ('AUTO_OK'::"ModerationStatus", 'APPROVED'::"ModerationStatus")
  AND "citySlug" = '${CITY}'
  AND "workFormat" = 'LOCAL'::"WorkFormat"
  AND (
    "groupId" IS NULL
    OR EXISTS (SELECT 1 FROM "VacancyGroup" g WHERE g."primaryVacancyId" = "Vacancy"."id")
  )
`;

function printPlan(rows) {
  for (const row of rows) {
    const line = row["QUERY PLAN"] ?? Object.values(row)[0];
    console.log(String(line));
  }
}

async function explain(label, sql) {
  console.log(`\n--- EXPLAIN ${label} ---`);
  console.log("Как смотреть самим: EXPLAIN (ANALYZE, BUFFERS) <тот же SELECT> в SQL Editor Supabase.");
  const rows = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  printPlan(rows);
}

async function timePrisma() {
  const where = {
    isActive: true,
    moderationStatus: { in: ["AUTO_OK", "APPROVED"] },
    citySlug: CITY,
    workFormat: "LOCAL",
    OR: [{ groupId: null }, { primaryOfGroups: { some: {} } }],
  };
  const started = performance.now();
  const [rows, total] = await Promise.all([
    prisma.vacancy.findMany({
      where,
      select: { id: true, title: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 20,
      skip: 0,
    }),
    prisma.vacancy.count({ where }),
  ]);
  const ms = Math.round(performance.now() - started);
  return { ms, listed: rows.length, total };
}

async function prepareLoad() {
  const existing = await prisma.vacancy.count({ where: { externalId: { startsWith: "bench-" } } });
  if (existing >= TARGET) {
    console.log(`Уже есть ${existing} bench-строк, не добавляем.`);
    return;
  }
  const need = TARGET - existing;
  const now = Date.now();
  const batchSize = 500;
  console.log(`Добавляем ${need} строк для замера…`);
  for (let offset = 0; offset < need; offset += batchSize) {
    const size = Math.min(batchSize, need - offset);
    const data = Array.from({ length: size }, (_, index) => {
      const n = existing + offset + index;
      const vahta = n % 10 === 0;
      return {
        slug: `bench-${n}`,
        title: vahta ? `Сварщик вахта ${n}` : `Слесарь ${n}`,
        titleNormalized: vahta ? "сварщик" : "слесарь",
        description: "Сгенерированная запись для замера списка. Не публиковать как настоящую.",
        summaryLine: vahta ? "Вахта · ЯНАО" : "Местная",
        completeness: 40,
        qualityScore: 40,
        normalizerVersion: "bench-1",
        salaryFrom: 30000 + (n % 20) * 1000,
        salaryTo: null,
        citySlug: CITY,
        districtSlug: "centr",
        workFormat: vahta ? "VAHTA" : "LOCAL",
        workLocationText: vahta ? "ЯНАО" : null,
        workCitySlug: vahta ? "yanao" : null,
        rotationPattern: vahta ? "60/30" : null,
        vahtaDays: vahta ? 60 : null,
        housingProvided: vahta,
        sphere: "stroitelstvo",
        professionSlug: vahta ? "svarshchik" : "elektrik",
        schedule: vahta ? null : "5/2",
        source: "MANUAL",
        sourceName: "bench",
        externalId: `bench-${n}`,
        contentHash: `bench-hash-${n}`,
        signature: `bench|${n}`,
        moderationStatus: "AUTO_OK",
        isActive: true,
        publishedAt: new Date(now - (n % 400) * 3600_000),
      };
    });
    await prisma.vacancy.createMany({ data });
    process.stdout.write(`  ${offset + size}/${need}\n`);
  }
}

async function cleanupLoad() {
  const result = await prisma.vacancy.deleteMany({ where: { externalId: { startsWith: "bench-" } } });
  console.log(`Удалено bench-строк: ${result.count}`);
}

async function hitApi() {
  const url = `${ORIGIN}/api/vacancies?city=${CITY}&page=1&pageSize=20&workFormat=LOCAL`;
  const started = performance.now();
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const httpMs = Math.round(performance.now() - started);
  const timing = response.headers.get("Server-Timing");
  const body = await response.json();
  console.log(`\n--- HTTP ${url} ---`);
  console.log(`status ${response.status}, round-trip ${httpMs} мс, Server-Timing: ${timing ?? "нет"}`);
  console.log(`total в ответе: ${body.total}, карточек: ${Array.isArray(body.vacancies) ? body.vacancies.length : 0}`);
}

async function main() {
  const before = await prisma.vacancy.count({ where: { citySlug: CITY } });
  console.log(`Вакансий ${CITY} сейчас: ${before}`);

  if (LOAD) {
    await prepareLoad();
  }

  await explain("list LOCAL take 20", LIST_SQL);
  await explain("count LOCAL", COUNT_SQL);

  const timed = await timePrisma();
  console.log(`\nPrisma findMany+count параллельно: ${timed.ms} мс (строк ${timed.listed}, всего ${timed.total})`);
  console.log("Бюджет API 400 мс / 600 мс при 5000 — про функцию рядом с базой. dbMs выше — про сам запрос.");

  if (HIT_API) {
    await hitApi();
  }

  if (LOAD) {
    await cleanupLoad();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
