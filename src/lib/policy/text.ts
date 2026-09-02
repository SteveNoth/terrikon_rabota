/**
 * Нормализация и поиск по словарю — те же правила, что scripts/filter.py.
 * Границы слов юникодные: JS `\b` не считает кириллицу словом и сломал бы «СВО» / «курс».
 */

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]+/gu;
const SPACE_RE = /[\s\u00a0\u2028\u2029]+/g;
const QUOTE_RE = /[«»„“”‚‘’`´]/g;
const DASH_RE = /[–—−]/g;
const CYRILLIC_RE = /[а-яё]/i;

const HOMOGLYPHS: Record<string, string> = {
  a: "а",
  e: "е",
  o: "о",
  p: "р",
  c: "с",
  x: "х",
  y: "у",
  t: "т",
  h: "н",
  k: "к",
  m: "м",
  b: "в",
};

/** Как Python `\b` при UNICODE: граница между буквой/цифрой/_ и всем остальным. */
const UNICODE_BOUND = String.raw`(?:(?<=[\p{L}\p{N}_])(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?=[\p{L}\p{N}_]))`;

export type CompiledTerm = {
  entry: import("./types").KeywordEntry;
  pattern: RegExp;
};

function foldHomoglyphs(text: string): string {
  const chars = Array.from(text);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? "";
    const replacement = HOMOGLYPHS[char];
    if (!replacement) {
      continue;
    }
    const left = chars[index - 1] ?? "";
    const right = chars[index + 1] ?? "";
    if (CYRILLIC_RE.test(left) || CYRILLIC_RE.test(right)) {
      chars[index] = replacement;
    }
  }
  return chars.join("");
}

export function foldText(text: string): string {
  const folded = (text || "").replaceAll("ё", "е").replaceAll("Ё", "е").toLocaleLowerCase("ru-RU");
  return foldHomoglyphs(folded);
}

export function normalizeText(text: string): string {
  let cleaned = foldText(text || "");
  cleaned = cleaned.replace(EMOJI_RE, " ");
  cleaned = cleaned.replace(QUOTE_RE, '"');
  cleaned = cleaned.replace(DASH_RE, "-");
  cleaned = cleaned.replace(SPACE_RE, " ").trim();
  return cleaned;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translatePythonPattern(pattern: string): string {
  return pattern.replace(/\\w/g, String.raw`[\p{L}\p{N}_]`).replace(/\\b/g, UNICODE_BOUND);
}

function wrapBounds(body: string): string {
  return `${UNICODE_BOUND}${body}${UNICODE_BOUND}`;
}

export function compileTerm(entry: import("./types").KeywordEntry): RegExp | null {
  if (entry.pattern) {
    try {
      return new RegExp(translatePythonPattern(entry.pattern), "iu");
    } catch {
      return null;
    }
  }
  if (entry.phrase) {
    const phrase = foldText(entry.phrase).trim();
    const parts = phrase.split(/\s+/).filter(Boolean).map(escapeRegex);
    if (parts.length === 0) {
      return null;
    }
    return new RegExp(wrapBounds(parts.join(String.raw`\s+`)), "iu");
  }
  if (!entry.stem) {
    return null;
  }
  const stem = escapeRegex(foldText(entry.stem));
  const rawEndings = entry.endings;
  const requireEnding = Boolean(entry.requireEnding);
  let body: string;
  if (rawEndings == null) {
    body = stem;
  } else {
    const nonempty = rawEndings.map((item) => foldText(item)).filter(Boolean);
    const hasEmpty = rawEndings.some((item) => !item);
    if (nonempty.length > 0) {
      const alt = nonempty.map(escapeRegex).join("|");
      if (requireEnding && !hasEmpty) {
        body = `${stem}(?:${alt})`;
      } else {
        body = `${stem}(?:${alt})?`;
      }
    } else {
      body = stem;
    }
  }
  return new RegExp(wrapBounds(body), "iu");
}

export function compileTerms(entries: import("./types").KeywordEntry[] | undefined | null): CompiledTerm[] {
  const result: CompiledTerm[] = [];
  for (const entry of entries || []) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    if (entry.id == null && !entry.stem && !entry.phrase && !entry.pattern) {
      continue;
    }
    const pattern = compileTerm(entry);
    if (!pattern) {
      continue;
    }
    result.push({ entry, pattern });
  }
  return result;
}

export function firstMatch(pattern: RegExp, text: string): string | null {
  pattern.lastIndex = 0;
  const found = pattern.exec(text);
  return found?.[0] ?? null;
}

export function iterHits(group: CompiledTerm[], text: string): { entry: import("./types").KeywordEntry; sample: string }[] {
  const hits: { entry: import("./types").KeywordEntry; sample: string }[] = [];
  const seen = new Set<string>();
  for (const item of group) {
    const sample = firstMatch(item.pattern, text);
    if (!sample) {
      continue;
    }
    const key = String(item.entry.id || item.entry.stem || item.entry.phrase || item.pattern.source);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hits.push({ entry: item.entry, sample });
  }
  return hits;
}
