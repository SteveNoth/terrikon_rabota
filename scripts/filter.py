"""Фильтр «вакансия / не вакансия» (разделы 11.2–11.3 ядра).

Словари и пороги — в shared/keywords.json. Этот файл только собирает из них
регулярные выражения и считает баллы.

Критично: нельзя искать основу как подстроку. Иначе:

    курс      ловит  конкурс, экскурсия
    акция     ловит  реакция, фракция
    форма     ловит  информация
    авто      ловит  авторитет, автономный
    дом       ловит  домашний, стадом

Правильно: граница слова \\b + явные окончания, без открытого \\w* на короткой
основе. «конкурс»: перед «курс» стоит буква, \\b не срабатывает.
«авторитет»: основа «авто» с окончанием из списка не совпадёт, а \\bавто\\w*
совпало бы — поэтому \\w* на коротких основах запрещён.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config

Verdict = Literal["accept", "maybe", "reject"]

# Эмодзи и пиктограммы: считаем до удаления, потом вычищаем для анализа.
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
_SPACE_RE = re.compile(r"[\s\u00a0\u2028\u2029]+")
_QUOTE_RE = re.compile(r"[«»„“”‚‘’`´]")
_DASH_RE = re.compile(r"[–—−]")

_compiled: dict[str, Any] = {"mtime": None, "groups": None}


# Латиница, которую в горловских постах ставят вместо кириллицы: «Тpeбуeтся».
# Меняем только рядом с кириллицей, иначе сломаем https, MAX, hh.ru.
_HOMOGLYPHS = {
    "a": "а",
    "e": "е",
    "o": "о",
    "p": "р",
    "c": "с",
    "x": "х",
    "y": "у",
    "t": "т",
    "h": "н",
    "k": "к",
    "m": "м",
    "b": "в",
}
_CYRILLIC_RE = re.compile(r"[а-яё]", re.IGNORECASE)


def fold_homoglyphs(text: str) -> str:
    chars = list(text)
    for index, char in enumerate(chars):
        replacement = _HOMOGLYPHS.get(char)
        if replacement is None:
            continue
        left = chars[index - 1] if index else ""
        right = chars[index + 1] if index + 1 < len(chars) else ""
        if _CYRILLIC_RE.match(left) or _CYRILLIC_RE.match(right):
            chars[index] = replacement
    return "".join(chars)


def fold_text(text: str) -> str:
    """ё→е, нижний регистр, латинские «двойники» рядом с кириллицей."""
    folded = (text or "").replace("ё", "е").replace("Ё", "е").casefold()
    return fold_homoglyphs(folded)


@dataclass(frozen=True)
class NormalizedText:
    original: str
    text: str
    length: int
    emoji_count: int
    caps_count: int
    letter_count: int


def normalize(text: str) -> NormalizedText:
    """Очистка для анализа. Исходник не трогаем — он потом уйдёт в rawText.

    Делаем: ё→е, эмодзи убрать, пробелы и переносы склеить, кавычки привести.
    Регистр для поиска — нижний; долю КАПСа считаем по исходнику.
    """
    original = text if text is not None else ""
    emoji_count = len(_EMOJI_RE.findall(original))
    letters = [ch for ch in original if ch.isalpha()]
    caps_count = sum(1 for ch in letters if ch.isupper())
    letter_count = len(letters)

    cleaned = fold_text(original)
    cleaned = _EMOJI_RE.sub(" ", cleaned)
    cleaned = _QUOTE_RE.sub('"', cleaned)
    cleaned = _DASH_RE.sub("-", cleaned)
    cleaned = _SPACE_RE.sub(" ", cleaned).strip()

    return NormalizedText(
        original=original,
        text=cleaned,
        length=len(cleaned),
        emoji_count=emoji_count,
        caps_count=caps_count,
        letter_count=letter_count,
    )


def compile_term(entry: dict[str, Any]) -> re.Pattern[str]:
    """Основа + окончания → регулярка с границами слов.

    Никогда не подставляем открытый \\w* к короткой основе: «авто»+\\w*
    это «авторитет». Окончания только из списка в JSON.
    """
    flags = re.IGNORECASE | re.UNICODE
    if entry.get("pattern"):
        return re.compile(entry["pattern"], flags)

    if entry.get("phrase"):
        phrase = fold_text(entry["phrase"]).strip()
        parts = [re.escape(part) for part in phrase.split() if part]
        body = r"\s+".join(parts)
        return re.compile(rf"\b{body}\b", flags)

    stem = fold_text(entry["stem"])
    stem_esc = re.escape(stem)
    raw_endings = entry.get("endings")
    require_ending = bool(entry.get("requireEnding"))

    if raw_endings is None:
        body = rf"\b{stem_esc}\b"
    else:
        nonempty = [fold_text(item) for item in raw_endings if item]
        has_empty = any(not item for item in raw_endings)
        if nonempty:
            alt = "|".join(re.escape(item) for item in nonempty)
            if require_ending and not has_empty:
                body = rf"\b{stem_esc}(?:{alt})\b"
            else:
                body = rf"\b{stem_esc}(?:{alt})?\b"
        else:
            body = rf"\b{stem_esc}\b"

    return re.compile(body, flags)


def compile_terms(entries: list[dict[str, Any]] | None) -> list[tuple[dict[str, Any], re.Pattern[str]]]:
    result: list[tuple[dict[str, Any], re.Pattern[str]]] = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        if entry.get("id") is None and not entry.get("stem") and not entry.get("phrase") and not entry.get("pattern"):
            continue
        result.append((entry, compile_term(entry)))
    return result


def _compile_all() -> dict[str, Any]:
    keywords = shared_config.get_keywords()
    vahta = keywords.get("vahta") or {}
    extract_cfg = keywords.get("extract") or {}
    return {
        "vacancyMarkers": compile_terms(keywords.get("vacancyMarkers")),
        "contactHints": compile_terms(keywords.get("contactHints")),
        "structureBlocks": compile_terms(keywords.get("structureBlocks")),
        "scheduleWords": compile_terms(keywords.get("scheduleWords")),
        "stopWords": compile_terms(keywords.get("stopWords")),
        "ads": compile_terms(keywords.get("ads")),
        "remote": compile_terms(keywords.get("remote")),
        "vahtaWords": compile_terms(vahta.get("words")),
        "vahtaConditions": compile_terms(vahta.get("conditions")),
        "vahtaAgency": compile_terms(vahta.get("agency")),
        "vahtaDirect": compile_terms(vahta.get("direct")),
        "experience": compile_terms(extract_cfg.get("experience")),
        "employment": compile_terms(extract_cfg.get("employment")),
        "keywords": keywords,
    }


def compiled() -> dict[str, Any]:
    mtime = shared_config.KEYWORDS_PATH.stat().st_mtime
    geo_mtime = shared_config.GEO_PATH.stat().st_mtime
    prof_mtime = shared_config.PROFESSIONS_PATH.stat().st_mtime
    token = (mtime, geo_mtime, prof_mtime)
    if _compiled["mtime"] != token:
        shared_config.reload()
        _compiled["groups"] = _compile_all()
        _compiled["mtime"] = token
    return _compiled["groups"]


def reload_keywords() -> None:
    """Сбросить кэш регулярок. После правки shared/keywords.json."""
    shared_config.reload()
    _compiled["mtime"] = None
    compiled()


def first_match(pattern: re.Pattern[str], text: str) -> str | None:
    found = pattern.search(text)
    return found.group(0) if found else None


def iter_hits(
    group: list[tuple[dict[str, Any], re.Pattern[str]]],
    text: str,
) -> list[tuple[dict[str, Any], str]]:
    hits: list[tuple[dict[str, Any], str]] = []
    seen: set[str] = set()
    for entry, pattern in group:
        sample = first_match(pattern, text)
        if not sample:
            continue
        key = str(entry.get("id") or entry.get("stem") or entry.get("phrase") or pattern.pattern)
        if key in seen:
            continue
        seen.add(key)
        hits.append((entry, sample))
    return hits


@dataclass
class RuleHit:
    id: str
    points: int
    sample: str = ""
    label: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "points": self.points,
            "sample": self.sample,
            "label": self.label or self.id,
        }


@dataclass
class ScoreResult:
    total: int
    rules: list[RuleHit] = field(default_factory=list)
    normalized: NormalizedText | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "rules": [item.as_dict() for item in self.rules],
        }


@dataclass
class VacancyDecision:
    verdict: Verdict
    score: int
    reasons: list[str]
    rules: list[RuleHit]
    thresholds: dict[str, int]

    def as_dict(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "score": self.score,
            "reasons": list(self.reasons),
            "rules": [item.as_dict() for item in self.rules],
            "thresholds": dict(self.thresholds),
        }


def _add(rules: list[RuleHit], rule_id: str, points: int, sample: str = "", label: str = "") -> None:
    rules.append(RuleHit(id=rule_id, points=points, sample=sample, label=label or rule_id))


def _caps_emoji_ratio(norm: NormalizedText) -> float:
    total = max(len(norm.original), 1)
    return (norm.emoji_count + norm.caps_count) / total


def score(text: str, *, source: dict[str, Any] | None = None, spam: bool = False) -> ScoreResult:
    """Сумма баллов и список сработавших правил (для логов и админки)."""
    from extract import (
        extract_city,
        extract_contacts,
        extract_phone,
        extract_profession,
        extract_salary,
        extract_schedule,
    )
    from vahta import detect_work_format, extract_rotation

    groups = compiled()
    keywords = groups["keywords"]
    weights = keywords["weights"]
    length_cfg = keywords["length"]
    ratio_limit = float(keywords.get("capsEmojiRatio") or 0.4)

    norm = normalize(text)
    body = norm.text
    rules: list[RuleHit] = []

    marker_hits = iter_hits(groups["vacancyMarkers"], body)
    marker_cap = int(weights["vacancyMarkerMax"])
    marker_each = int(weights["vacancyMarker"])
    marker_points = 0
    for entry, sample in marker_hits:
        if marker_points >= marker_cap:
            break
        add = min(marker_each, marker_cap - marker_points)
        marker_points += add
        _add(rules, f"marker:{entry.get('id')}", add, sample, "маркер вакансии")

    for entry, sample in iter_hits(groups["structureBlocks"], body):
        _add(
            rules,
            f"structure:{entry.get('id')}",
            int(weights["structureBlock"]),
            sample,
            "блок структура",
        )

    salary = extract_salary(text)
    if salary is not None:
        _add(rules, "salary", int(weights["salary"]), salary.raw, "зарплата")

    schedule = extract_schedule(text)
    rotation = extract_rotation(text)
    schedule_word_hits = iter_hits(groups["scheduleWords"], body)
    work_format = detect_work_format(text)
    if schedule or rotation or schedule_word_hits or work_format == "VAHTA":
        sample = ""
        if schedule:
            sample = schedule
        elif rotation:
            sample = rotation.pattern
        elif schedule_word_hits:
            sample = schedule_word_hits[0][1]
        elif work_format == "VAHTA":
            sample = "вахта"
        _add(rules, "schedule", int(weights["schedule"]), sample, "график")

    phones = extract_phone(text)
    if phones:
        _add(rules, "phone", int(weights["phone"]), phones[0].original, "телефон")

    contacts = extract_contacts(text)
    if contacts.usernames or contacts.links:
        sample = (contacts.usernames[0] if contacts.usernames else contacts.links[0])
        _add(rules, "username", int(weights["username"]), sample, "аккаунт или ссылка")

    for entry, sample in iter_hits(groups["contactHints"], body):
        _add(
            rules,
            f"contact:{entry.get('id')}",
            int(weights.get("contactHint") or weights["username"]),
            sample,
            "контакт без номера",
        )

    profession = extract_profession(text)
    if profession is not None:
        _add(rules, "profession", int(weights["profession"]), profession.name, "профессия")

    city = extract_city(text, source=source, work_format=work_format)
    if city.reason in {"explicit_city", "district"}:
        _add(rules, "city", int(weights["city"]), city.city_slug or "", "город или район в тексте")

    if length_cfg["okMin"] <= norm.length <= length_cfg["okMax"]:
        _add(rules, "length_ok", int(weights["lengthOk"]), str(norm.length), "длина нормальная")
    too_short = norm.length < length_cfg["tooShort"]
    too_long = norm.length > length_cfg["tooLong"]
    # Коротыш с профессией и телефоном — это объявление («грузчик +7949…»),
    # а не обрывок. Порог 80 из ядра иначе отбрасывает живые посты из групп.
    short_but_complete = too_short and phones and profession is not None
    if (too_short or too_long) and not short_but_complete:
        _add(rules, "length_bad", int(weights["lengthBad"]), str(norm.length), "длина плохая")

    for entry, sample in iter_hits(groups["stopWords"], body):
        _add(rules, f"stop:{entry.get('id')}", int(weights["stopWord"]), sample, "стоп-слово")

    for entry, sample in iter_hits(groups["ads"], body):
        _add(rules, f"ads:{entry.get('id')}", int(weights["ads"]), sample, "реклама")

    if _caps_emoji_ratio(norm) > ratio_limit:
        _add(rules, "caps_emoji", int(weights["capsOrEmoji"]), "", "много капса или эмодзи")

    if spam:
        _add(rules, "spam", int(weights["spam"]), "", "спам источника")

    total = sum(item.points for item in rules)
    return ScoreResult(total=total, rules=rules, normalized=norm)


def is_vacancy(
    text: str,
    *,
    source: dict[str, Any] | None = None,
    spam: bool = False,
) -> VacancyDecision:
    """accept / maybe / reject. Пороги читаются из JSON при каждом вызове."""
    result = score(text, source=source, spam=spam)
    thresholds = compiled()["keywords"]["thresholds"]
    accept_at = int(thresholds["accept"])
    maybe_at = int(thresholds["maybe"])

    if result.total >= accept_at:
        verdict: Verdict = "accept"
    elif result.total >= maybe_at:
        verdict = "maybe"
    else:
        verdict = "reject"

    reasons = [
        f"{item.label}: {item.points:+d}" + (f" («{item.sample}»)" if item.sample else "")
        for item in result.rules
    ]
    if not reasons:
        reasons = ["нет сработавших правил"]

    return VacancyDecision(
        verdict=verdict,
        score=result.total,
        reasons=reasons,
        rules=result.rules,
        thresholds={"accept": accept_at, "maybe": maybe_at},
    )
