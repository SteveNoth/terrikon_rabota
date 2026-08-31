import keywordsJson from "@shared/keywords.json";
import type { TrustFlag } from "@/lib/admin/flags";

export type HighlightPart = {
  text: string;
  marked: boolean;
};

type PhraseEntry = { id?: string; phrase?: string; stem?: string; sample?: string };

function collectDictionaryPhrases(flagIds: Set<string>): string[] {
  const phrases: string[] = [];
  const fraud = keywordsJson.fraud as unknown as Record<string, unknown>;
  const buckets = ["fastMoney", "privacy", "denials", "hardFlags", "abroad", "documentsHelp", "klady", "dailyPay"];
  for (const key of buckets) {
    const list = fraud[key];
    if (!Array.isArray(list)) {
      continue;
    }
    for (const raw of list) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const entry = raw as PhraseEntry;
      if (!entry.id || !flagIds.has(entry.id)) {
        continue;
      }
      if (entry.phrase) {
        phrases.push(entry.phrase);
      }
    }
  }
  const stop = keywordsJson.stopWords;
  if (Array.isArray(stop)) {
    for (const raw of stop) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const entry = raw as PhraseEntry;
      if (entry.id && flagIds.has(entry.id) && entry.phrase) {
        phrases.push(entry.phrase);
      }
    }
  }
  return phrases;
}

function uniqueNeedles(flags: TrustFlag[]): string[] {
  const ids = new Set(flags.map((flag) => flag.id));
  const needles: string[] = [];
  const seen = new Set<string>();
  function add(raw: string) {
    const value = raw.trim();
    if (value.length < 3) {
      return;
    }
    const key = value.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    needles.push(value);
  }
  for (const flag of flags) {
    if (flag.sample && !/^\d+$/.test(flag.sample)) {
      add(flag.sample);
    }
  }
  for (const phrase of collectDictionaryPhrases(ids)) {
    add(phrase);
  }
  needles.sort((a, b) => b.length - a.length);
  return needles;
}

/**
 * Режет оригинал поста на куски, чтобы подозрительные фразы можно было подсветить.
 * Без подсветки очередь из ста постов в день не разбирается — это не украшение.
 */
export function highlightParts(text: string, flags: TrustFlag[]): HighlightPart[] {
  const source = text || "";
  const needles = uniqueNeedles(flags);
  if (!source || needles.length === 0) {
    return source ? [{ text: source, marked: false }] : [];
  }

  type Hit = { start: number; end: number };
  const hits: Hit[] = [];
  const lower = source.toLocaleLowerCase("ru-RU");
  for (const needle of needles) {
    const needleLower = needle.toLocaleLowerCase("ru-RU");
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needleLower, from);
      if (at === -1) {
        break;
      }
      hits.push({ start: at, end: at + needle.length });
      from = at + needle.length;
    }
  }
  if (hits.length === 0) {
    return [{ text: source, marked: false }];
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Hit[] = [];
  for (const hit of hits) {
    const last = merged[merged.length - 1];
    if (!last || hit.start > last.end) {
      merged.push({ ...hit });
      continue;
    }
    last.end = Math.max(last.end, hit.end);
  }

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const hit of merged) {
    if (hit.start > cursor) {
      parts.push({ text: source.slice(cursor, hit.start), marked: false });
    }
    parts.push({ text: source.slice(hit.start, hit.end), marked: true });
    cursor = hit.end;
  }
  if (cursor < source.length) {
    parts.push({ text: source.slice(cursor), marked: false });
  }
  return parts;
}

export function diffParts(original: string, current: string): { left: HighlightPart[]; right: HighlightPart[] } {
  const leftWords = new Set(tokenize(original));
  const rightWords = new Set(tokenize(current));
  return {
    left: markTokens(original, (word) => !rightWords.has(word) && word.length > 2),
    right: markTokens(current, (word) => !leftWords.has(word) && word.length > 2),
  };
}

function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase("ru-RU")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function markTokens(text: string, shouldMark: (word: string) => boolean): HighlightPart[] {
  if (!text) {
    return [];
  }
  const parts: HighlightPart[] = [];
  const re = /(\p{L}+\p{N}*|\p{N}+|[^\p{L}\p{N}]+)/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const chunk = match[0] ?? "";
    const word = chunk.toLocaleLowerCase("ru-RU");
    const marked = /[\p{L}\p{N}]/u.test(chunk) && shouldMark(word);
    const last = parts[parts.length - 1];
    if (last && last.marked === marked) {
      last.text += chunk;
    } else {
      parts.push({ text: chunk, marked });
    }
  }
  return parts;
}
