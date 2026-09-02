import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { BANNED_DEPENDENCIES, BANNED_IMPORTS, BUDGET_KB } from "./budgets.mjs";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const NEXT = path.join(ROOT, ".next");
const KB = 1024;

const IMPORT_RE = new RegExp(
  `(?:from\\s+|import\\s*\\(\\s*|import\\s+)['"](?:${BANNED_IMPORTS.map((name) => name.replace(".", "\\.")).join("|")})['"]`,
  "g",
);

let failed = 0;

function fail(message) {
  failed += 1;
  console.error(`  FAIL  ${message}`);
}

function ok(message) {
  console.log(`  ok   ${message}`);
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) {
    return acc;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      walk(full, acc);
      continue;
    }
    if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function scanImports() {
  const files = walk(SRC);
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const matches = text.match(IMPORT_RE);
    if (matches) {
      hits.push(`${rel}: ${[...new Set(matches)].join(", ")}`);
    }
  }
  if (hits.length) {
    fail("запрещённый импорт в исходниках (раздел 8.5 / Закон 4):");
    for (const hit of hits) {
      console.error(`        ${hit}`);
    }
    return;
  }
  ok("в src нет запрещённых библиотек");
}

function scanPackage() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const bad = BANNED_DEPENDENCIES.filter((name) => deps[name]);
  if (bad.length) {
    fail(`package.json тащит ${bad.join(", ")} — это сразу ломает бюджет Lite`);
    return;
  }
  ok("package.json без тяжёлых библиотек графиков/утилит");
}

function gzipSize(filePath) {
  const buf = fs.readFileSync(filePath);
  return gzipSync(buf).length;
}

function collectStrings(node, acc) {
  if (typeof node === "string") {
    if (node.includes("static/")) {
      acc.add(node.replace(/^\//, ""));
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectStrings(item, acc);
    }
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) {
      collectStrings(value, acc);
    }
  }
}

function jobsManifestFiles() {
  const files = new Set();
  let foundJobs = false;
  const manifestPath = path.join(NEXT, "build-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const json = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    collectStrings(json.rootMainFiles, files);
    collectStrings(json.polyfillFiles, files);
    if (Array.isArray(json.rootMainFiles) && json.rootMainFiles.length) {
      foundJobs = true;
    }
  }

  const appManifest = path.join(NEXT, "app-build-manifest.json");
  if (fs.existsSync(appManifest)) {
    const json = JSON.parse(fs.readFileSync(appManifest, "utf8"));
    const pages = json.pages ?? json;
    if (pages && typeof pages === "object") {
      for (const [key, value] of Object.entries(pages)) {
        const keyText = String(key);
        if (/jobs\/page|\[city\]\/layout|app\/layout/.test(keyText)) {
          foundJobs = true;
          collectStrings(value, files);
        }
      }
    }
  }

  const jobsPageManifest = path.join(NEXT, "server", "app", "[city]", "jobs", "page", "build-manifest.json");
  if (fs.existsSync(jobsPageManifest)) {
    const json = JSON.parse(fs.readFileSync(jobsPageManifest, "utf8"));
    collectStrings(json.rootMainFiles, files);
    collectStrings(json.polyfillFiles, files);
    foundJobs = true;
  }

  return { files: [...files], foundJobs };
}

function checkSizes() {
  const buildId = path.join(NEXT, "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    console.log("  skip размеры: нет production-сборки (.next/BUILD_ID). Сначала npm run build.");
    return;
  }

  const { files, foundJobs } = jobsManifestFiles();
  const jsFiles = [];
  const cssFiles = [];
  for (const rel of files) {
    const full = path.join(NEXT, rel);
    if (!fs.existsSync(full)) {
      continue;
    }
    if (/\.css$/i.test(rel)) {
      cssFiles.push(full);
    } else if (/\.js$/i.test(rel)) {
      jsFiles.push(full);
    }
  }

  const cssDir = path.join(NEXT, "static", "css");
  if (fs.existsSync(cssDir)) {
    for (const name of fs.readdirSync(cssDir)) {
      if (name.endsWith(".css")) {
        cssFiles.push(path.join(cssDir, name));
      }
    }
  }
  const chunkDir = path.join(NEXT, "static", "chunks");
  if (fs.existsSync(chunkDir)) {
    for (const name of fs.readdirSync(chunkDir)) {
      if (name.endsWith(".css")) {
        cssFiles.push(path.join(chunkDir, name));
      }
    }
  }

  const jsBytes = [...new Set(jsFiles)].reduce((sum, file) => sum + gzipSize(file), 0);
  const cssBytes = [...new Set(cssFiles)].reduce((sum, file) => sum + gzipSize(file), 0);

  if (jsFiles.length === 0) {
    fail("сборка есть, но манифест не дал JS первой загрузки — открой .next/app-build-manifest.json");
    return;
  }
  const jsKb = jsBytes / KB;
  const cssKb = cssBytes / KB;

  console.log(
    `  бандл списка (gzip): JS ${jsKb.toFixed(1)} КБ, CSS ${cssKb.toFixed(1)} КБ` +
      `${foundJobs ? "" : " (манифест без явного jobs/page — сумма шире первой загрузки)"}`,
  );

  if (jsKb > BUDGET_KB.full.js) {
    fail(
      `JS ${jsKb.toFixed(1)} КБ > ${BUDGET_KB.full.js} КБ (потолок Full из 8.5). ` +
        `Lite ${BUDGET_KB.lite.js} КБ каркас Next.js пока не закрывает — это записанный долг, но Full превысить нельзя.`,
    );
  } else {
    ok(`JS ${jsKb.toFixed(1)} КБ ≤ ${BUDGET_KB.full.js} КБ (Full 8.5)`);
  }

  if (jsKb > BUDGET_KB.lite.js) {
    console.log(
      `  долг  Lite JS: ${jsKb.toFixed(1)} КБ при бюджете ${BUDGET_KB.lite.js} КБ — общий рантайм Next, не новая библиотека`,
    );
  }

  if (cssKb > BUDGET_KB.full.css) {
    fail(`CSS ${cssKb.toFixed(1)} КБ > ${BUDGET_KB.full.css} КБ (Full 8.5)`);
  } else {
    ok(`CSS ${cssKb.toFixed(1)} КБ ≤ ${BUDGET_KB.full.css} КБ`);
  }
}

console.log("Бюджеты 8.5");
scanPackage();
scanImports();
checkSizes();

if (failed) {
  console.error(`\ncheck:budget: ${failed} нарушений`);
  process.exit(1);
}

console.log("\ncheck:budget прошёл.");
