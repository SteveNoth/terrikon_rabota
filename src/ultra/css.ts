import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Критический CSS для Ultra: те же переменные, что у основного сайта.
 * HEX живёт только в tokens.css — отсюда мы забираем :root и правки режима.
 */

function readStyle(name: "tokens.css" | "modes.css"): string {
  try {
    return readFileSync(new URL(`../styles/${name}`, import.meta.url), "utf8");
  } catch {
    return readFileSync(join(process.cwd(), "src", "styles", name), "utf8");
  }
}

let cached: string | null = null;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractRule(css: string, selector: string): string {
  const idx = css.indexOf(selector);
  if (idx < 0) {
    return "";
  }
  const start = css.indexOf("{", idx);
  if (start < 0) {
    return "";
  }
  let depth = 0;
  for (let i = start; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(start + 1, i);
      }
    }
  }
  return "";
}

function compact(css: string): string {
  return stripComments(css)
    .replace(/\s+/g, " ")
    .replace(/ ?([{};:,]) ?/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function usedVars(css: string): Set<string> {
  const found = new Set<string>();
  const re = /var\((--[\w-]+)/g;
  let match: RegExpExecArray | null = re.exec(css);
  while (match) {
    found.add(match[1]);
    match = re.exec(css);
  }
  return found;
}

function parseDecls(block: string): Map<string, string> {
  const map = new Map<string, string>();
  const cleaned = stripComments(block);
  let i = 0;
  while (i < cleaned.length) {
    const colon = cleaned.indexOf(":", i);
    if (colon < 0) {
      break;
    }
    const name = cleaned.slice(i, colon).trim();
    let depth = 0;
    let j = colon + 1;
    for (; j < cleaned.length; j += 1) {
      const ch = cleaned[j];
      if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
      } else if (ch === ";" && depth === 0) {
        break;
      }
    }
    const value = cleaned.slice(colon + 1, j).trim();
    if (name.startsWith("--")) {
      map.set(name, value);
    }
    i = j + 1;
  }
  return map;
}

function pickDecls(needed: Set<string>, decls: Map<string, string>): string {
  const out = new Map<string, string>();
  const queue = [...needed];
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name || out.has(name)) {
      continue;
    }
    const value = decls.get(name);
    if (value == null) {
      continue;
    }
    out.set(name, value);
    for (const dep of usedVars(value)) {
      queue.push(dep);
    }
  }
  return [...out.entries()].map(([name, value]) => `${name}:${value}`).join(";");
}

/** Вёрстка Ultra. Только токены, без второго набора цветов. */
const LAYOUT = `
html{font-size:var(--t-font-size-base)}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--t-color-bg);color:var(--t-color-text);font-family:var(--t-font-sans);line-height:var(--t-leading-normal)}
a{color:var(--t-color-brand);text-decoration:none}
h1,h2,h3,p,ul,ol{margin:0}
h1,h2,h3{font-family:var(--t-font-display);font-weight:500;line-height:var(--t-leading-tight)}
h1{font-size:var(--t-text-2xl)}
h2{font-size:var(--t-text-xl)}
h3{font-size:var(--t-text-lg)}
.wrap{max-width:var(--t-container-max);margin:0 auto;padding:0 var(--t-space-4)}
.site{display:flex;flex-direction:column;min-height:100vh;padding-bottom:calc(var(--t-bottomnav-height) + var(--t-space-2))}
main{flex:1}
.header,.footer,.bottom{background:var(--t-color-surface);border:solid var(--t-color-border);border-width:0}
.header{position:sticky;top:0;z-index:2;border-bottom-width:var(--t-border-width)}
.header-inner,.footer-inner{display:flex;flex-wrap:wrap;align-items:center;gap:var(--t-space-3);padding:var(--t-space-2) var(--t-space-4);max-width:var(--t-container-max);margin:0 auto;width:100%}
.brand{display:flex;align-items:center;gap:var(--t-space-2);color:var(--t-color-brand);font-family:var(--t-font-display);font-size:var(--t-text-xl);font-weight:600;text-decoration:none}
.brand svg{height:2rem;width:auto}
.mark-sun{fill:var(--t-color-accent)}
.city-form,.tools{display:flex;flex:1;min-width:0;gap:var(--t-space-2);align-items:center}
.tools{flex:1 1 100%;flex-wrap:nowrap}
.qform{display:flex;flex:0 1 auto;align-items:center;gap:var(--t-space-2)}
.tg{color:var(--t-color-accent-text);background:var(--t-color-accent);border-radius:var(--t-radius-pill);padding:var(--t-space-2) var(--t-space-3);font-size:var(--t-text-sm);text-decoration:none;min-height:var(--t-tap-min);display:inline-flex;align-items:center}
.footer{border-top-width:var(--t-border-width);margin-top:var(--t-space-6)}
.footer-inner{flex-direction:column;align-items:flex-start;padding:var(--t-space-5) var(--t-space-4);gap:var(--t-space-3)}
.footer-links{display:flex;flex-wrap:wrap;gap:var(--t-space-3) var(--t-space-4);font-size:var(--t-text-sm)}
.muted{color:var(--t-color-text-muted)}
.small{font-size:var(--t-text-sm)}
.stack,.jobs,.results,.filters,.article,.field,.checks{display:flex;flex-direction:column;gap:var(--t-space-4);min-width:0}
.stack,.article{padding:var(--t-space-5) 0}
.tight{padding:0}
.split,.chips,.contacts,.pages{display:flex;flex-wrap:wrap;gap:var(--t-space-3)}
.split{justify-content:space-between}
.hero{background:var(--t-color-surface-inverse);color:var(--t-color-text-inverse);padding:var(--t-space-5) 0}
.hero .muted,.hero p{color:var(--t-color-text-inverse)}
.search{display:flex;flex-wrap:nowrap;align-items:center;gap:var(--t-space-3);margin-top:var(--t-space-4)}
.city-form select,.qform select,.search input,.search select,.field input,.field select,.field textarea{min-height:var(--t-tap-min);padding:var(--t-space-2) var(--t-space-3);border:var(--t-border-width) solid var(--t-color-border);border-radius:var(--t-radius-md);background:var(--t-color-surface);color:var(--t-color-text);font:inherit}
.field input,.field select,.field textarea{width:100%}
.city-form select,.search input{flex:1;min-width:0}
.search select,.qform select{flex:0 1 10rem}
.field{gap:var(--t-space-1)}
.field span,.field label{font-size:var(--t-text-sm);font-weight:500}
.checks{gap:var(--t-space-2)}
.checks label{display:flex;align-items:center;gap:var(--t-space-2);min-height:var(--t-tap-min)}
.btn,.chip,.pages a,.pages span{display:inline-flex;align-items:center;justify-content:center;min-height:var(--t-tap-min);border-radius:var(--t-radius-md);text-decoration:none;font:inherit;font-weight:500;color:var(--t-color-text)}
.btn{padding:var(--t-space-2) var(--t-space-4);border:var(--t-border-width) solid transparent}
.btn-primary{background:var(--t-color-brand);color:var(--t-color-brand-text);border-color:var(--t-color-brand)}
.btn-accent{background:var(--t-color-accent);color:var(--t-color-accent-text)}
.btn-outline,.chip,.pages a,.pages span{background:var(--t-color-surface);border:var(--t-border-width) solid var(--t-color-border)}
.chip-on,.pages [aria-current="page"]{background:var(--t-color-brand);color:var(--t-color-brand-text);border-color:var(--t-color-brand)}
.btn-full{width:100%}
.chip{padding:0 var(--t-space-3);border-radius:var(--t-radius-pill);font-size:var(--t-text-sm)}
.grid{display:grid;gap:var(--t-space-3)}
.cards,.spheres{grid-template-columns:1fr}
.spheres{grid-template-columns:1fr 1fr}
.card,.warn,.note,details{padding:var(--t-space-3);border:var(--t-border-width) solid var(--t-color-border);border-radius:var(--t-radius-md);background:var(--t-color-surface)}
.card{display:block;color:inherit;text-decoration:none}
.warn,.note,details{background:var(--t-color-surface-muted)}
.warn{border-color:var(--t-color-warning)}
.note{font-size:var(--t-text-sm);color:var(--t-color-text-muted)}
.salary{font-weight:500}
.employer{display:flex;align-items:center;gap:var(--t-space-2);flex-wrap:wrap}
.avatar{display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:var(--t-radius-pill);font-size:var(--t-text-xs);font-weight:500;text-transform:uppercase;flex-shrink:0}
.avatar-0{background:var(--t-color-brand);color:var(--t-color-brand-text)}
.avatar-1{background:var(--t-color-accent);color:var(--t-color-accent-text)}
.avatar-2{background:var(--t-color-success);color:var(--t-color-text-inverse)}
.avatar-3{background:var(--t-color-info);color:var(--t-color-text-inverse)}
.avatar-4{background:var(--t-color-warning);color:var(--t-color-accent-text)}
.avatar-5{background:var(--t-color-danger);color:var(--t-color-text-inverse)}
.avatar-6{background:var(--t-color-surface-inverse);color:var(--t-color-text-inverse)}
.avatar-7{background:var(--t-chart-6);color:var(--t-color-text-inverse)}
.ok{color:var(--t-color-success)}
.filters{display:none;padding:var(--t-space-4)}
.results{flex:1}
.is-filters .filters{display:flex;position:fixed;inset:0;z-index:3;overflow:auto;border-radius:0}
.is-filters .results{display:none}
.pages a,.pages span{min-width:var(--t-tap-min);padding:0 var(--t-space-2)}
.list{padding-left:1em}
.plain{list-style:none;padding:0}
.chips{gap:var(--t-space-2);margin-top:var(--t-space-5)}
summary{cursor:pointer;font-weight:500}
pre.orig{margin-top:var(--t-space-3);white-space:pre-wrap;font:inherit}
.bottom{display:grid;grid-template-columns:1fr 1fr;position:fixed;bottom:0;left:0;right:0;z-index:2;border-top-width:var(--t-border-width)}
.bottom a{display:flex;align-items:center;justify-content:center;min-height:var(--t-bottomnav-height);font-size:var(--t-text-sm);color:var(--t-color-text-muted);text-decoration:none}
.bottom a[aria-current="page"]{color:var(--t-color-brand)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.phone-obf{unicode-bidi:bidi-override;direction:rtl;white-space:nowrap}
:focus-visible{outline:2px solid var(--t-color-focus);outline-offset:2px}
@media (min-width:768px){
.site{padding-bottom:0}
.bottom{display:none}
.cards{grid-template-columns:1fr 1fr 1fr}
.spheres{grid-template-columns:repeat(4,1fr)}
.jobs{flex-direction:row;align-items:flex-start}
.filters{display:flex;order:-1;width:18rem}
.is-filters .filters{position:static;overflow:visible}
.is-filters .results{display:flex}
.filter-bar,.mob-only{display:none}
h1{font-size:var(--t-text-3xl)}
}
`;

export function criticalCss(): string {
  if (cached && process.env.NODE_ENV === "production") {
    return cached;
  }

  const tokens = readStyle("tokens.css");
  const modes = readStyle("modes.css");
  const rootDecls = parseDecls(extractRule(tokens, ":root"));
  const ultraDecls = parseDecls(extractRule(modes, 'html[data-mode="ultra"]'));
  const needed = usedVars(LAYOUT);
  const root = pickDecls(needed, rootDecls);
  const rootVars = new Set([...root.matchAll(/--[\w-]+/g)].map((match) => match[0]));
  const ultraKeys = new Set(
    [...ultraDecls.keys()].filter((name) => needed.has(name) || rootVars.has(name)),
  );
  const ultra = pickDecls(ultraKeys, ultraDecls);
  cached = compact(`:root{${root}}html[data-mode="ultra"]{${ultra}}${LAYOUT}`);
  return cached;
}

export function criticalCssBytes(): number {
  return Buffer.byteLength(criticalCss(), "utf8");
}
