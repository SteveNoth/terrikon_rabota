/**
 * Проверки админ-списка без сети.
 * Запуск: npx tsx src/lib/admin/run-tests.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminPageWindow, adminVacanciesPath } from "@/lib/admin/vacancies";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

console.log("Админка — список вакансий");

ok("первая страница без page=", adminVacanciesPath({}) === "/admin/vacancies");
ok(
  "вторая страница пишется в query",
  adminVacanciesPath({ city: "gorlovka" }, 2) === "/admin/vacancies?city=gorlovka&page=2",
);
const filtered = adminVacanciesPath({ status: "PENDING", q: "слесарь", hasReports: true }, 3);
ok(
  "фильтры не теряются",
  filtered.includes("status=PENDING") &&
    filtered.includes("hasReports=1") &&
    filtered.includes("page=3") &&
    filtered.includes("q="),
);
ok("окно до 7 страниц подряд", adminPageWindow(1, 5).join(",") === "1,2,3,4,5");
ok("окно 20 страниц содержит разрыв", adminPageWindow(10, 20).includes("gap"));
ok("окно держит первую и последнюю", adminPageWindow(10, 20)[0] === 1 && adminPageWindow(10, 20).at(-1) === 20);

const pageSource = fs.readFileSync(path.join(ROOT, "app/admin/vacancies/page.tsx"), "utf8");
ok("в списке есть «Вперёд»", pageSource.includes("Вперёд"));
ok("ссылки пагинации сохраняют фильтры", pageSource.includes("adminVacanciesPath"));

if (failed) {
  console.error(`\nУпало: ${failed}, прошло: ${passed}`);
  process.exit(1);
}
console.log(`\nВсе ${passed} проверок прошли.`);
