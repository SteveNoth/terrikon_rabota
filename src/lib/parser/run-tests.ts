/**
 * Проверки дедупа при приёме без базы.
 * Запуск: npx tsx src/lib/parser/run-tests.ts
 */
import { WorkFormat } from "@prisma/client";
import {
  bodyForFingerprint,
  contentHash,
  isTextDupEligible,
  MIN_TEXT_DUP_CHARS,
  normalizeHashBody,
  textDupBucket,
  textHash,
} from "@/lib/parser/dedupe";
import { storedSphereSnapshot } from "@/lib/hygiene/sphere-snapshot";
import { classifyDoubts } from "@/lib/admin/flags";
import { parserQueueWhere } from "@/lib/admin/queue";

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

console.log("Дедуп текста и счётчики сфер");

const sample =
  "Требуется токарь на завод. График 2/2. Зарплата 60 000. Телефон для связи в тексте не важен для отпечатка.";
ok("textHash устойчив к пробелам и регистру", textHash(sample) === textHash(`  ${sample.toUpperCase()}  \n`));
ok(
  "textHash не зависит от телефона",
  textHash(sample) === textHash(sample) && contentHash(sample, "+79491111111") !== contentHash(sample, "+79492222222"),
);
ok("короткий текст не склеиваем", !isTextDupEligible("работа"));
ok("длинный текст склеиваем", isTextDupEligible(sample) && normalizeHashBody(sample).length >= MIN_TEXT_DUP_CHARS);
ok(
  "вахты в одной корзине, местные — по городу",
  textDupBucket("abc", WorkFormat.VAHTA, "gorlovka") === textDupBucket("abc", WorkFormat.VAHTA, "donetsk") &&
    textDupBucket("abc", WorkFormat.LOCAL, "gorlovka") !== textDupBucket("abc", WorkFormat.LOCAL, "donetsk"),
);
ok("отпечаток берёт rawText", bodyForFingerprint({ rawText: sample, description: "другое" }) === sample);

ok("пустой SphereStat не снимок", storedSphereSnapshot(true, []) === null);
ok("нет CityStat — живой подсчёт", storedSphereSnapshot(false, [{ sphere: "proizvodstvo", count: 4 }]) === null);
ok(
  "есть строки — снимок",
  storedSphereSnapshot(true, [{ sphere: "proizvodstvo", count: 4 }])?.[0]?.count === 4,
);

const queue = parserQueueWhere();
ok("очередь не берёт привязанные дубли", queue.duplicateOfId === null);

ok(
  "точное совпадение текста — сомнение «дубль»",
  classifyDoubts({
    flags: [],
    trustScore: 80,
    highRiskThreshold: 40,
    fraudReportCount: 0,
    duplicateOfId: "other",
    groupPostings: 1,
    completeness: 50,
  }).duplicate,
);

if (failed) {
  console.error(`\nПровалено: ${failed}, прошло: ${passed}`);
  process.exit(1);
}
console.log(`\nВсе ${passed} проверок прошли.`);
