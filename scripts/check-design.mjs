import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = [path.join(ROOT, "src", "app"), path.join(ROOT, "src", "components")];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const RGB = /\b(?:rgb|rgba|hsl|hsla)\s*\(/;
const ARBITRARY = /(?:^|[\s"'`])([a-zA-Z][\w:-]*)-\[[^\]]+\]/;
const IMPORTANT = /!important\b/;
const TAILWIND_BANG = /['"`][^'"`]*![a-zA-Z]/;
const INLINE_STYLE = /\bstyle\s*=\s*\{/;
const RAW_SHADOW = /\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/;
const RAW_ROUNDED = /\brounded-(?:xl|2xl|3xl|full)\b/;
const RAW_PALETTE =
  /\b(?:bg|text|border|fill|stroke|from|to|via|outline|ring|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;
const RAW_DURATION = /\bduration-(?:75|100|150|200|300|500|700|1000)\b/;

const CSS_VAR_ONLY_STYLE =
  /style\s*=\s*\{\{\s*(?:['"]--[\w-]+['"]\s*:\s*[^}]+,?\s*)+\}\}/;

/**
 * @typedef {{ file: string, line: number, found: string, rule: string, fix: string }} Violation
 */

/** @type {{ test: (line: string) => boolean, pick: (line: string) => string, rule: string, fix: string }[]} */
const RULES = [
  {
    test: (line) => HEX.test(line),
    pick: (line) => line.match(HEX)?.[0] ?? "#",
    rule: "HEX-цвет вне файла токенов",
    fix: "Замени на смысловой токен: класс вроде bg-brand / text-danger или var(--t-color-brand) в CSS.",
  },
  {
    test: (line) => RGB.test(line),
    pick: (line) => line.match(RGB)?.[0] ?? "rgb(",
    rule: "Сырой rgb/hsl вне файла токенов",
    fix: "Цвет должен идти из tokens.css через --t-* и классы Tailwind (bg-surface, text-muted).",
  },
  {
    test: (line) => ARBITRARY.test(line),
    pick: (line) => line.match(ARBITRARY)?.[1] ? `${line.match(ARBITRARY)?.[1]}-[…]` : "[…]",
    rule: "Произвольное значение Tailwind в квадратных скобках",
    fix: "Добавь токен в src/styles/tokens.css и класс в @theme, не пиши text-[13px] или bg-[#fff].",
  },
  {
    test: (line) => IMPORTANT.test(line) || TAILWIND_BANG.test(line),
    pick: (line) => (IMPORTANT.test(line) ? "!important" : "!класс"),
    rule: "Запрещён !important и Tailwind-префикс !",
    fix: "Усиль специфичность через токен или вариант компонента, а не через !important.",
  },
  {
    test: (line) => INLINE_STYLE.test(line) && !CSS_VAR_ONLY_STYLE.test(line),
    pick: () => "style={{ … }}",
    rule: "Инлайновый style={{ }}",
    fix: "Оформление — только классами токенов. style разрешён лишь для CSS-переменных-модификаторов (--t-…) и позиционирования карты. Иначе добавь путь в .designignore.",
  },
  {
    test: (line) => RAW_SHADOW.test(line),
    pick: (line) => line.match(RAW_SHADOW)?.[0] ?? "shadow-*",
    rule: "Сырой класс тени Tailwind",
    fix: "Используй shadow-1, shadow-2 или shadow-3 — они читают --t-shadow-*.",
  },
  {
    test: (line) => RAW_ROUNDED.test(line),
    pick: (line) => line.match(RAW_ROUNDED)?.[0] ?? "rounded-*",
    rule: "Сырой класс скругления Tailwind",
    fix: "Используй rounded-sm, rounded-md, rounded-lg или rounded-pill.",
  },
  {
    test: (line) => RAW_PALETTE.test(line),
    pick: (line) => line.match(RAW_PALETTE)?.[0] ?? "text-gray-*",
    rule: "Сырой цвет палитры Tailwind",
    fix: "Используй смысловые классы: bg-brand, bg-surface, text-text, text-muted, border-border.",
  },
  {
    test: (line) => RAW_DURATION.test(line),
    pick: (line) => line.match(RAW_DURATION)?.[0] ?? "duration-*",
    rule: "Сырая длительность анимации Tailwind",
    fix: "Используй duration-fast или duration-normal — они читают --t-motion-*.",
  },
];

function loadIgnore() {
  const file = path.join(ROOT, ".designignore");
  if (!fs.existsSync(file)) {
    return [];
  }

  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replaceAll("\\", "/"));
}

/** @param {string} relative */
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", ":::").replaceAll("*", "[^/]*").replaceAll(":::", ".*");
  return new RegExp(`^${escaped}$`);
}

/** @param {string} relative @param {string[]} ignores */
function isIgnored(relative, ignores) {
  const normalized = relative.replaceAll("\\", "/");
  return ignores.some((pattern) => globToRegExp(pattern).test(normalized));
}

/** @param {string} dir @param {string[]} acc */
function walk(dir, acc) {
  if (!fs.existsSync(dir)) {
    return acc;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) {
      acc.push(full);
    }
  }

  return acc;
}

function main() {
  const ignores = loadIgnore();
  /** @type {Violation[]} */
  const violations = [];

  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir, [])) {
      const relative = path.relative(ROOT, file).replaceAll("\\", "/");
      if (isIgnored(relative, ignores)) {
        continue;
      }

      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const rule of RULES) {
          if (rule.test(line)) {
            violations.push({
              file: relative,
              line: index + 1,
              found: rule.pick(line),
              rule: rule.rule,
              fix: rule.fix,
            });
          }
        }
      });
    }
  }

  if (violations.length === 0) {
    console.log("Дизайн-система в порядке: запрещённых значений в src/app и src/components нет.");
    process.exit(0);
  }

  console.error(`Найдено нарушений: ${violations.length}\n`);
  for (const item of violations) {
    console.error(`${item.file}:${item.line}`);
    console.error(`  найдено: ${item.found}`);
    console.error(`  правило: ${item.rule}`);
    console.error(`  как исправить: ${item.fix}\n`);
  }

  process.exit(1);
}

main();
