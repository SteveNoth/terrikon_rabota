"""Очистка и структура вакансии без ИИ (разделы 11.8–11.9 ядра).

Все шаблоны — shared/normalize.json (Закон 5). Этот файл только применяет
их. Каждая функция ниже — отдельный шаг и покрыта своим тестом.

Порядок эмодзи нельзя менять: сначала ведущие маркеры → «- », потом
декоративные удаляем. В постах ВК эмодзи часто и есть вся разметка
списка. Если вычистить их сразу, останется сплошная строка, и разделы
уже не собрать.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config
from extract import extract_profession
from filter import compile_terms, fold_text

_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000026FF"
    "\U00002700-\U000027BF"
    "\U0001F1E0-\U0001F1FF"
    "\U0000FE00-\U0000FE0F"
    "\U0000200D"
    "]+",
    flags=re.UNICODE,
)
_VS_RE = re.compile("[\uFE0E\uFE0F]")
_MULTI_SPACE_RE = re.compile(r"[^\S\n]+")
_BLANK_RE = re.compile(r"\n{3,}")
_SPACE_BEFORE_PUNCT = re.compile(r" +([,.;:!?])")
_SPACE_AFTER_PERIOD = re.compile(r"([.!?])([^\s\d.])")
_SPACE_AFTER_COMMA = re.compile(r",([^\s\d])")
_LIST_PREFIX_RE = re.compile(r"^(?:[-–—•]|\d{1,2}[.)])\s*")
_CONTACT_TAIL_RE = re.compile(
    r"(?im)\b(?:тел(?:ефон)?\.?|звонит\w*|писать|пишите|пиши)\s*[:.,;–—-]?\s*$"
)
_CONTACT_LOOSE_RE = re.compile(
    r"(?i)\b(?:тел(?:ефон)?\.?|звонит\w*)\s*[:.,;]?\s*(?=\s|$|[.!,])"
)
_OCR_SEP_FALLBACK = "---OCR---"

_compiled: dict[str, Any] = {"mtime": None}


@dataclass
class Sections:
    description: str = ""
    tasks: list[str] = field(default_factory=list)
    requirements: list[str] = field(default_factory=list)
    conditions: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if self.description.strip():
            payload["description"] = self.description.strip()
        if self.tasks:
            payload["tasks"] = list(self.tasks)
        if self.requirements:
            payload["requirements"] = list(self.requirements)
        if self.conditions:
            payload["conditions"] = list(self.conditions)
        return payload

    def has_lists(self) -> bool:
        return bool(self.tasks or self.requirements or self.conditions)


def get_cfg() -> dict[str, Any]:
    return shared_config.get_normalize()


def version() -> str:
    return str(get_cfg().get("NORMALIZER_VERSION") or 1)


def reload_normalize() -> None:
    """Сбросить кэш. После правки shared/normalize.json в тестах."""
    shared_config.reload()
    _compiled["mtime"] = None
    _bundle()


def _bundle() -> dict[str, Any]:
    path = shared_config.NORMALIZE_PATH
    mtime = path.stat().st_mtime if path.exists() else None
    if _compiled.get("mtime") == mtime and _compiled.get("cfg") is not None:
        return _compiled
    shared_config.reload()
    cfg = shared_config.get_normalize()
    headings: dict[str, list[tuple[dict[str, Any], re.Pattern[str]]]] = {}
    for key, entries in (cfg.get("sectionHeadings") or {}).items():
        headings[str(key)] = compile_terms(entries)
    abbrevs = list(cfg.get("keepAbbreviations") or [])
    abbrevs_sorted = sorted(abbrevs, key=len, reverse=True)
    abbrev_patterns = [
        (item, re.compile(rf"\b{re.escape(item)}\b", re.IGNORECASE | re.UNICODE))
        for item in abbrevs_sorted
    ]
    bullets = sorted(
        {_strip_vs(item) for item in (cfg.get("bulletEmoji") or []) if item},
        key=len,
        reverse=True,
    )
    _compiled.clear()
    _compiled.update(
        {
            "mtime": mtime,
            "cfg": cfg,
            "junk": compile_terms(cfg.get("junkPatterns")),
            "titleNoise": compile_terms(cfg.get("titleNoise")),
            "headings": headings,
            "abbrevs": abbrevs_sorted,
            "abbrev_patterns": abbrev_patterns,
            "bullets": bullets,
        }
    )
    return _compiled


def _strip_vs(text: str) -> str:
    return _VS_RE.sub("", text or "")


def _letters(text: str) -> str:
    return "".join(ch for ch in text if ch.isalpha())


def restore_abbreviations(text: str) -> str:
    """Вернуть канонический вид ДНР / ООО / КамАЗ, не трогая остальное."""
    if not text:
        return text
    bundle = _bundle()
    result = text
    for canonical, pattern in bundle["abbrev_patterns"]:
        result = pattern.sub(canonical, result)
    return result


def capitalize_sentences(text: str) -> str:
    """Заглавная после конца предложения. «5.000» не считает концом."""
    if not text:
        return text
    out: list[str] = []
    cap_next = True
    length = len(text)
    for index, char in enumerate(text):
        if cap_next and char.isalpha():
            out.append(char.upper())
            cap_next = False
            continue
        out.append(char)
        if char in "!?":
            cap_next = True
        elif char == ".":
            nxt = text[index + 1] if index + 1 < length else ""
            if nxt == "" or nxt.isspace():
                cap_next = True
    return "".join(out)


def fix_caps(text: str) -> str:
    """Если заглавных больше порога — нормальный регистр, сокращения целы."""
    original = text if text is not None else ""
    if not original:
        return original
    letters = _letters(original)
    if not letters:
        return original
    threshold = float(_bundle()["cfg"].get("capsThreshold") or 0.6)
    caps = sum(1 for ch in letters if ch.isupper())
    if caps / len(letters) <= threshold:
        return original
    lowered = original.lower()
    restored = restore_abbreviations(lowered)
    return capitalize_sentences(restored)


def _line_to_bullet(line: str, bullets: list[str]) -> str:
    ended = ""
    body = line
    if body.endswith("\n"):
        ended = "\n"
        body = body[:-1]
    if body.endswith("\r"):
        ended = "\r" + ended
        body = body[:-1]
    indent_len = len(body) - len(body.lstrip(" \t"))
    indent = body[:indent_len]
    rest = _strip_vs(body[indent_len:])
    for emoji in bullets:
        if rest.startswith(emoji):
            leftover = rest[len(emoji) :].lstrip(" \t")
            leftover = leftover.lstrip("-• ").lstrip()
            return f"{indent}- {leftover}{ended}"
    return line


def _split_inline_bullets(line: str, bullets: list[str]) -> list[str]:
    ended = "\n" if line.endswith("\n") else ""
    body = line.rstrip("\r\n")
    stripped = _strip_vs(body)
    found: list[tuple[int, int]] = []
    index = 0
    while index < len(stripped):
        hit = None
        for emoji in bullets:
            if stripped.startswith(emoji, index):
                hit = (index, index + len(emoji))
                break
        if hit:
            found.append(hit)
            index = hit[1]
        else:
            index += 1
    if len(found) < 2:
        return [line]
    chunks: list[str] = []
    for pos, (start, end) in enumerate(found):
        next_start = found[pos + 1][0] if pos + 1 < len(found) else len(stripped)
        piece = stripped[end:next_start].strip(" \t-•")
        if piece:
            chunks.append(f"- {piece}")
    if not chunks:
        return [line]
    if ended:
        chunks[-1] = chunks[-1] + ended
    return [item if item.endswith("\n") else item + "\n" for item in chunks[:-1]] + [chunks[-1]]


def emoji_to_structure(text: str) -> str:
    """Сначала маркеры списка из эмодзи, потом декоративные убираем.

    Почему так, а не наоборот: в горловских группах ВК строка часто
    выглядит как «🔹касса 🔹витрина» без тире и без переносов. Эмодзи
    здесь — единственная разметка. Если удалить их первым шагом,
    split_sections получит «касса витрина» и не соберёт список.
    Ведущий эмодзи на строке (и повтор в той же строке, если включено
    splitInlineBullets) превращаем в «- ». Остальное — украшение.
    """
    original = text if text is not None else ""
    if not original:
        return original
    bundle = _bundle()
    bullets = bundle["bullets"]
    split_inline = bool(bundle["cfg"].get("splitInlineBullets"))
    converted: list[str] = []
    for line in original.splitlines(keepends=True):
        turned = _line_to_bullet(line, bullets)
        if split_inline:
            converted.extend(_split_inline_bullets(turned, bullets))
        else:
            converted.append(turned)
    joined = "".join(converted)
    return _EMOJI_RE.sub("", joined)


def strip_junk(text: str) -> str:
    """Реклама группы, лайки, репосты, хештеги — по junkPatterns."""
    original = text if text is not None else ""
    if not original:
        return original
    bundle = _bundle()
    result = original
    for _entry, pattern in bundle["junk"]:
        result = pattern.sub(" ", result)
    result = _MULTI_SPACE_RE.sub(" ", result)
    result = _BLANK_RE.sub("\n\n", result)
    return result.strip()


def _heading_ok(text: str, start: int, end: int) -> bool:
    line_start = text.rfind("\n", 0, start) + 1
    prefix = text[line_start:start]
    if prefix.strip(" \t-–—"):
        after = text[end : end + 8]
        return bool(re.match(r"\s*:", after))
    return True


def _to_items(block: str) -> list[str]:
    body = (block or "").strip().lstrip(":").strip()
    if not body:
        return []
    items: list[str] = []
    for raw in body.splitlines():
        line = raw.strip()
        line = _LIST_PREFIX_RE.sub("", line).strip()
        line = line.strip(" ;.")
        if line:
            items.append(line)
    return items


def split_sections(text: str) -> Sections:
    """Описание / Задачи / Требования / Условия. Контакты — не в описание."""
    original = text if text is not None else ""
    sections = Sections()
    if not original.strip():
        return sections
    bundle = _bundle()
    found: list[tuple[int, int, str]] = []
    for key, group in bundle["headings"].items():
        for _entry, pattern in group:
            for match in pattern.finditer(original):
                if not _heading_ok(original, match.start(), match.end()):
                    continue
                found.append((match.start(), match.end(), key))
    found.sort(key=lambda row: (row[0], -(row[1] - row[0])))
    cleaned: list[tuple[int, int, str]] = []
    last_end = -1
    for start, end, key in found:
        if start < last_end:
            continue
        cleaned.append((start, end, key))
        last_end = end
    if not cleaned:
        sections.description = original.strip()
        _promote_orphan_bullets(sections)
        return sections

    before = original[: cleaned[0][0]].strip()
    if before:
        sections.description = before
    for index, (start, end, key) in enumerate(cleaned):
        stop = cleaned[index + 1][0] if index + 1 < len(cleaned) else len(original)
        block = original[end:stop]
        if key == "contacts":
            continue
        items = _to_items(block)
        if key == "tasks":
            sections.tasks.extend(items)
        elif key == "requirements":
            sections.requirements.extend(items)
        elif key == "conditions":
            sections.conditions.extend(items)
        else:
            extra = block.strip()
            if extra:
                sections.description = (sections.description + "\n" + extra).strip()
    _promote_orphan_bullets(sections)
    return sections


def _promote_orphan_bullets(sections: Sections) -> None:
    """Строки «- пункт» без заголовка «Обязанности» — всё равно список.

    В ВК часто только эмодзи, без слова «обязанности». После emoji_to_structure
    они уже «- …». Если не поднять их в tasks, карточка получит сплошную
    строку, хотя разметка была.
    """
    if sections.tasks:
        return
    lines = (sections.description or "").splitlines()
    items: list[str] = []
    rest: list[str] = []
    for line in lines:
        stripped = line.strip()
        if _LIST_PREFIX_RE.match(stripped):
            item = _LIST_PREFIX_RE.sub("", stripped).strip()
            if item:
                items.append(item)
        else:
            rest.append(line)
    if len(items) >= 2:
        sections.tasks = items
        sections.description = "\n".join(rest).strip()


def fix_paragraphs(text: str) -> str:
    """Склеить разорванные строки, пробелы после точек, не больше одной пустой."""
    original = text if text is not None else ""
    if not original:
        return original
    glued = re.sub(r"(\w)-\n(\w)", r"\1\2", original)
    lines = glued.splitlines()
    merged: list[str] = []
    for line in lines:
        piece = line.strip()
        if not merged:
            merged.append(piece)
            continue
        if not piece:
            if merged[-1] != "":
                merged.append("")
            continue
        prev = merged[-1]
        if prev and piece and piece[0].islower() and prev[-1] not in ".!?:;":
            merged[-1] = prev + " " + piece
        else:
            merged.append(piece)
    body = "\n".join(merged)
    body = _SPACE_BEFORE_PUNCT.sub(r"\1", body)
    body = _SPACE_AFTER_PERIOD.sub(r"\1 \2", body)
    body = _SPACE_AFTER_COMMA.sub(r", \1", body)
    body = re.sub(r"(?:,\s*){2,}", ", ", body)
    body = _MULTI_SPACE_RE.sub(" ", body)
    body = _BLANK_RE.sub("\n\n", body)
    return body.strip()


def dedupe_phrases(text: str) -> str:
    """Повтор одной и той же фразы оставляем один раз, порядок — как был."""
    original = text if text is not None else ""
    if not original:
        return original
    seen: set[str] = set()
    out: list[str] = []
    for line in original.splitlines():
        stripped = line.strip()
        if not stripped:
            if out and out[-1] != "":
                out.append("")
            continue
        key = fold_text(stripped)
        if key in seen:
            continue
        seen.add(key)
        out.append(stripped)
    return "\n".join(out).strip()


def dedupe_list(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = fold_text(item)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item.strip())
    return out


def truncate_smart(text: str) -> tuple[str, bool]:
    """Обрезка до maxDescriptionChars по границе предложения, не посреди слова."""
    original = text if text is not None else ""
    cfg = _bundle()["cfg"]
    limit = int(cfg.get("maxDescriptionChars") or 3000)
    ellipsis = str(cfg.get("ellipsis") or "…")
    if len(original) <= limit:
        return original, False
    window = original[:limit]
    cut = -1
    for token in (". ", "! ", "? ", ".\n", "!\n", "?\n"):
        pos = window.rfind(token)
        if pos > cut:
            cut = pos + 1
    if cut < limit * 0.5:
        cut = window.rfind(" ")
    if cut < 1:
        cut = limit
    trimmed = window[:cut].rstrip()
    hint = str(cfg.get("originalHint") or "")
    suffix = ellipsis if not hint else f"{ellipsis} ({hint})"
    return trimmed + suffix, True


def _first_line(text: str, limit: int) -> str:
    for line in (text or "").splitlines():
        piece = line.strip()
        if piece:
            return piece[:limit] if len(piece) > limit else piece
    body = (text or "").strip()
    return body[:limit] if len(body) > limit else body


def _clean_title_fragment(fragment: str) -> str:
    bundle = _bundle()
    body = fragment
    for _entry, pattern in bundle["titleNoise"]:
        body = pattern.sub(" ", body)
    body = _EMOJI_RE.sub(" ", body)
    body = re.sub(r"[!?.,:;]+", " ", body)
    body = _MULTI_SPACE_RE.sub(" ", body).strip(" \t-—–")
    return body.strip()


def clean_title(text: str, profession_name: str | None = None) -> tuple[str, str]:
    """Канонический заголовок + titleOriginal (первая строка как была)."""
    cfg = _bundle()["cfg"]
    limit = int(cfg.get("titleOriginalMax") or 200)
    original = _first_line(text or "", limit)
    if profession_name:
        title = restore_abbreviations(profession_name)
        return title, original
    hit = extract_profession(original) or extract_profession(text or "")
    if hit:
        return hit.name, original
    fragment = _clean_title_fragment(original)
    if not fragment:
        return "", original
    titled = fragment[:1].upper() + fragment[1:].lower() if fragment else ""
    return restore_abbreviations(titled), original


def format_amount(value: int) -> str:
    digits = str(abs(int(value)))
    parts: list[str] = []
    while digits:
        parts.append(digits[-3:])
        digits = digits[:-3]
    grouped = " ".join(reversed(parts))
    return grouped if value >= 0 else f"−{grouped}"


def format_salary_summary(
    salary_from: int | None,
    salary_to: int | None,
    period: str | None = None,
) -> str | None:
    if salary_from is None and salary_to is None:
        return None
    dash = str(_bundle()["cfg"].get("salaryDash") or "–")
    suffix = "₽"
    if period in {"HOUR", "hour"}:
        suffix = "₽/час"
    elif period in {"SHIFT", "shift", "DAY", "day"}:
        suffix = "₽/смена"
    if salary_from is not None and salary_to is not None:
        if salary_from == salary_to:
            return f"{format_amount(salary_from)} {suffix}"
        return f"{format_amount(salary_from)}{dash}{format_amount(salary_to)} {suffix}"
    if salary_from is not None:
        return f"от {format_amount(salary_from)} {suffix}"
    return f"до {format_amount(salary_to or 0)} {suffix}"


def build_summary_line(fields: dict[str, Any]) -> str:
    """«Сварщик · Никитовка · 45 000–60 000 ₽ · 2/2 · опыт от 1 года»."""
    sep = str(_bundle()["cfg"].get("summarySeparator") or " · ")
    parts: list[str] = []
    title = (fields.get("title") or "").strip()
    if title:
        parts.append(title)
    work_format = fields.get("workFormat")
    if work_format == "VAHTA":
        place = (fields.get("workLocationText") or "").strip()
    else:
        place = (
            (fields.get("districtName") or "").strip()
            or (fields.get("cityName") or "").strip()
        )
    if place:
        parts.append(place)
    salary = format_salary_summary(
        fields.get("salaryFrom"),
        fields.get("salaryTo"),
        fields.get("salaryPeriod"),
    )
    if salary:
        parts.append(salary)
    if work_format == "VAHTA":
        rotation = (fields.get("rotationPattern") or "").strip()
        if rotation:
            parts.append(rotation)
    else:
        schedule = (fields.get("schedule") or "").strip()
        if schedule:
            parts.append(schedule)
    experience = (fields.get("experienceSummary") or "").strip()
    if experience:
        parts.append(experience)
    return sep.join(parts)


def completeness(fields: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
    """0–100 и расшифровка, из чего сложилось. Веса — из JSON."""
    cfg = _bundle()["cfg"]
    weights = dict(cfg.get("completenessWeights") or {})
    long_at = int(cfg.get("descriptionLongChars") or 200)
    sections = fields.get("descriptionSections") or {}
    if not isinstance(sections, dict):
        sections = {}
    description = fields.get("description") or sections.get("description") or ""
    has_lists = bool(sections.get("tasks") or sections.get("requirements") or sections.get("conditions"))
    checks = {
        "salary": fields.get("salaryFrom") is not None or fields.get("salaryTo") is not None,
        "schedule": bool(fields.get("schedule") or fields.get("rotationPattern")),
        "place": bool(
            fields.get("districtSlug")
            or fields.get("address")
            or fields.get("workLocationText")
        ),
        "experience": bool(fields.get("experience")),
        "employment": bool(fields.get("employmentType")),
        "contact": bool(
            fields.get("contactPhone")
            or fields.get("contactTelegram")
            or fields.get("contactEmail")
        ),
        "description": len(str(description)) >= long_at,
        "sections": has_lists,
        "employer": bool(fields.get("employerName")),
    }
    breakdown: list[dict[str, Any]] = []
    score = 0
    total = 0
    for key, weight in weights.items():
        weight_n = int(weight)
        total += weight_n
        present = bool(checks.get(key))
        breakdown.append({"id": key, "weight": weight_n, "present": present})
        if present:
            score += weight_n
    percent = round(100 * score / total) if total else 0
    return min(100, max(0, percent)), breakdown


def strip_contact_spans(
    text: str,
    originals: list[str] | None = None,
) -> str:
    """Телефоны, @username и ссылки уже в полях — из текста их вырезаем."""
    result = text if text is not None else ""
    for span in originals or []:
        if span:
            result = result.replace(span, " ")
    result = _CONTACT_TAIL_RE.sub("", result)
    result = _CONTACT_LOOSE_RE.sub(" ", result)
    result = re.sub(r"(?i)(?:^|,|\s)(?:или)\s*$", "", result)
    result = re.sub(r"(?:,\s*){2,}", ", ", result)
    result = _MULTI_SPACE_RE.sub(" ", result)
    result = _BLANK_RE.sub("\n\n", result)
    return result.strip()


def drop_ocr_separator(text: str) -> str:
    cfg = shared_config.get_ocr() if hasattr(shared_config, "get_ocr") else {}
    mark = str((cfg or {}).get("analysisSeparator") or _OCR_SEP_FALLBACK)
    if not text:
        return text or ""
    return text.replace(mark, "\n")


def flatten_description(sections: Sections) -> str:
    parts: list[str] = []
    if sections.description.strip():
        parts.append(sections.description.strip())
    for title, items in (
        ("Задачи", sections.tasks),
        ("Требования", sections.requirements),
        ("Условия", sections.conditions),
    ):
        if not items:
            continue
        body = "\n".join(f"- {item}" for item in items)
        parts.append(f"{title}:\n{body}")
    return "\n\n".join(parts)


def structure_text(
    text: str,
    contact_spans: list[str] | None = None,
) -> tuple[Sections, bool]:
    """Полный пайплайн текста единицы: эмодзи → мусор → капс → разделы."""
    body = drop_ocr_separator(text or "")
    body = emoji_to_structure(body)
    body = strip_junk(body)
    body = fix_caps(body)
    body = strip_contact_spans(body, contact_spans)
    body = fix_paragraphs(body)
    body = dedupe_phrases(body)
    sections = split_sections(body)
    sections.description = dedupe_phrases(fix_paragraphs(sections.description))
    sections.tasks = [fix_paragraphs(item) for item in dedupe_list(sections.tasks)]
    sections.requirements = [fix_paragraphs(item) for item in dedupe_list(sections.requirements)]
    sections.conditions = [fix_paragraphs(item) for item in dedupe_list(sections.conditions)]
    truncated = False
    flat = flatten_description(sections)
    cut, truncated = truncate_smart(flat)
    if truncated:
        sections.description, _flag = truncate_smart(sections.description or flat)
        if len(flatten_description(sections)) > int(_bundle()["cfg"].get("maxDescriptionChars") or 3000):
            sections.tasks = []
            sections.requirements = []
            sections.conditions = []
            sections.description = cut
    return sections, truncated
