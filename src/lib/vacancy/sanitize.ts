/**
 * XSS (межсайтовый скрипт) — атака, когда в страницу попадает чужой HTML
 * с кодом, и браузер его выполняет. Пост из ВК или Telegram может содержать
 * `<script>…</script>`, `<img onerror=…>` или ссылку `javascript:`.
 *
 * Мы агрегатор: текст источника — недоверенные данные. Его нельзя вставлять
 * как HTML (`dangerouslySetInnerHTML`). Даже «почти свой» текст после парсера
 * проходит через эту функцию. Браузер тогда рисует буквы, а не выполняет теги.
 *
 * Закон 15: пользователю показываем свою реконструкцию, не вёрстку источника.
 */

const BLOCK_BREAK = /<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;
const TAG = /<[^>]+>/g;
const SCRIPT_OR_STYLE = /<(script|style|noscript|iframe|object|embed)[\s\S]*?<\/\1>/gi;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntity(entity: string): string {
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    const code = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  }
  if (entity.startsWith("#")) {
    const code = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  }
  return NAMED_ENTITIES[entity.toLowerCase()] ?? "";
}

/** Вычищает HTML. Переносы абзацев сохраняет. Скрипт не остаётся в тексте. */
export function stripHtml(input: string): string {
  return input
    .replace(SCRIPT_OR_STYLE, " ")
    .replace(BLOCK_BREAK, "\n\n")
    .replace(LINE_BREAK, "\n")
    .replace(TAG, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => decodeEntity(entity))
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Режет очищенный текст на абзацы. Пустые не возвращает. */
export function toParagraphs(input: string): string[] {
  return stripHtml(input)
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
