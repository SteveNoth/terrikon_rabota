/**
 * Выгрузка схемы public в backups/. Пароль из URL в консоль не печатаем.
 *
 *   node scripts/backup-db.mjs
 *   node scripts/backup-db.mjs --out backups/manual.dump
 *
 * Нужен pg_dump в PATH или Docker с образом postgres:16.
 * Куда класть и как проверять: docs/SETUP-LOG.md (Этап 25) и docs/MIGRATION.md.
 */
import { config as loadEnv } from "dotenv";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function connectionUrl() {
  const raw = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!raw) {
    throw new Error("Нет DIRECT_URL / DATABASE_URL. Возьми строки из .env.local.");
  }
  return raw;
}

function stampName() {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  return `terrikon-${iso}.dump`;
}

function which(cmd) {
  const probe = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(probe, [cmd], { encoding: "utf8" });
  return found.status === 0;
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "pg_dump не удался").trim();
    const safe = err.replace(/:[^@/]+@/g, ":[скрыто]@");
    throw new Error(safe.slice(0, 800));
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const outArg = argValue("--out");
const outFile = path.resolve(ROOT, outArg || path.join("backups", stampName()));
ensureDir(path.dirname(outFile));
const url = connectionUrl();
const dumpArgs = [
  "--format=custom",
  "--no-owner",
  "--no-acl",
  "--schema=public",
  `--file=${outFile}`,
  `--dbname=${url}`,
];

if (which("pg_dump")) {
  run("pg_dump", dumpArgs);
} else if (which("docker")) {
  const rel = path.relative(ROOT, outFile).replaceAll("\\", "/");
  run("docker", [
    "run",
    "--rm",
    "-v",
    `${ROOT}:/work`,
    "postgres:16",
    "pg_dump",
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--schema=public",
    `--file=/work/${rel}`,
    `--dbname=${url}`,
  ]);
} else {
  throw new Error(
    "Нет pg_dump и нет Docker. Поставь клиент PostgreSQL или Docker и повтори. На GitHub Actions клиент ставится сам.",
  );
}

const bytes = fs.statSync(outFile).size;
if (bytes < 100) {
  throw new Error("Файл бэкапа слишком маленький — выгрузка похоже пустая.");
}
console.log(`Бэкап записан: ${path.relative(ROOT, outFile)} (${bytes} байт).`);
console.log("Проверка восстановлением: npm run db:backup:verify (в CI) или шаги в docs/SETUP-LOG.md.");
