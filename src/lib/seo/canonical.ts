/**
 * Какие параметры оставляем в каноне.
 * `sphere` — посадочная страница сферы (уникальный заголовок, есть в sitemap).
 * page/sort/mode/фильтры — служебные, иначе поисковик видит тысячи дублей.
 */
export const CANONICAL_KEEP = new Set(["sphere"]);

const STRIP_ALWAYS = new Set([
  "mode",
  "page",
  "sort",
  "filters",
  "reset",
  "report",
  "notified",
  "q",
  "pageSize",
  "view",
  "qr",
]);

export type SearchLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function asPairs(search: SearchLike): [string, string][] {
  if (!search) {
    return [];
  }
  if (search instanceof URLSearchParams) {
    return [...search.entries()];
  }
  const pairs: [string, string][] = [];
  for (const [key, raw] of Object.entries(search)) {
    const value = firstParam(raw)?.trim();
    if (value) {
      pairs.push([key, value]);
    }
  }
  return pairs;
}

/** Канонический путь: без служебных параметров, sphere оставляем. */
export function canonicalPath(pathname: string, search?: SearchLike): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const kept = new URLSearchParams();
  for (const [key, value] of asPairs(search)) {
    if (STRIP_ALWAYS.has(key) || !CANONICAL_KEEP.has(key)) {
      continue;
    }
    if (!kept.has(key)) {
      kept.set(key, value);
    }
  }
  const qs = kept.toString();
  return qs ? `${path}?${qs}` : path;
}

export function canonicalSearchParams(search?: SearchLike): URLSearchParams {
  const kept = new URLSearchParams();
  for (const [key, value] of asPairs(search)) {
    if (STRIP_ALWAYS.has(key) || !CANONICAL_KEEP.has(key)) {
      continue;
    }
    if (!kept.has(key)) {
      kept.set(key, value);
    }
  }
  return kept;
}
