"""Один пост → несколько единиц вакансий (раздел 11.15 ядра).

Ложное склеивание лучше ложного разреза. Одну «простыню» я поправлю
в админке: разрежу руками или оставлю как есть. Пять фантомных карточек
из ложного разреза попадут в выдачу и в статистику (медиана, счётчики,
«кого ищут»). Закон 13 запрещает считать выдуманные работы. Поэтому
сомнительный текст не режем: одна единица и needsHumanReview=True.

Идентичность для Этапа 15 (в базу здесь не пишем, только контракт):
- неразрезанный пост: externalId как в источнике;
- разрезанный: первая единица сохраняет исходный id, остальные — {id}#2,
  {id}#3 (splitIndex 0, 1, 2…);
- rawText у всех детей — полный оригинал поста, не кусок. Кусок живёт
  в unitText. Иначе «Показать оригинал» и reprocess.py покажут обрывок;
- разные единицы одного поста не схлопываются в группу дублей: у них
  разная сигнатура (профессия, зарплата, место). Это разные работы,
  не повторы. Закон 13 про дубли — про одну вахту в восьми группах.

Правила — shared/split.json (Закон 5). Цифры в поля — только из unitText
(Закон 16): мы копируем шапку в кусок, а extract_* читает уже unitText.
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
from extract import (
    ProfessionHit,
    extract_city,
    extract_phone,
    extract_profession,
    extract_professions,
    extract_salary,
    extract_schedule,
)
from filter import compile_terms, compiled, fold_text, iter_hits

_compiled: dict[str, Any] = {"mtime": None}


@dataclass
class SplitUnit:
    unit_text: str
    raw_text: str
    split_index: int
    source_post_external_id: str | None
    external_id: str | None
    reasons: list[str] = field(default_factory=list)
    needs_human_review: bool = False
    inherited: dict[str, str] = field(default_factory=dict)
    profession: ProfessionHit | None = None
    salary: Any = None
    phones: list[Any] = field(default_factory=list)
    schedule: str | None = None
    splitter_version: int = 1

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "unitText": self.unit_text,
            "rawText": self.raw_text,
            "splitIndex": self.split_index,
            "sourcePostExternalId": self.source_post_external_id,
            "externalId": self.external_id,
            "reasons": list(self.reasons),
            "needsHumanReview": self.needs_human_review,
            "inherited": dict(self.inherited),
            "splitterVersion": self.splitter_version,
        }
        if self.profession is not None:
            payload["profession"] = self.profession.slug
        if self.salary is not None:
            payload["salary"] = self.salary.as_dict()
        if self.phones:
            payload["phones"] = [item.normalized for item in self.phones]
        if self.schedule:
            payload["schedule"] = self.schedule
        return payload


def reload_split() -> None:
    """Сбросить кэш. После правки shared/split.json в тестах."""
    shared_config.reload()
    _compiled["mtime"] = None
    _split_bundle()


def _split_bundle() -> dict[str, Any]:
    path = shared_config.SPLIT_PATH
    mtime = path.stat().st_mtime if path.exists() else None
    if _compiled["mtime"] == mtime and _compiled.get("cfg") is not None:
        return _compiled
    shared_config.reload()
    cfg = shared_config.get_split()
    do_not = cfg.get("doNotSplit") or {}
    line_markers = []
    for entry in cfg.get("lineMarkers") or []:
        item = dict(entry)
        if item.get("pattern"):
            item["compiled"] = re.compile(item["pattern"], re.IGNORECASE | re.UNICODE)
        line_markers.append(item)
    _compiled.clear()
    _compiled.update(
        {
            "mtime": mtime,
            "cfg": cfg,
            "role": compile_terms(cfg.get("roleMarkers")),
            "employer": compile_terms(cfg.get("employerMarkers")),
            "listIntro": compile_terms(cfg.get("listIntros")),
            "org": compile_terms(cfg.get("orgMarkers")),
            "duty": compile_terms(do_not.get("dutyStarters")),
            "sharedCond": compile_terms(do_not.get("sharedConditions")),
            "inheritPhrases": compile_terms(cfg.get("inheritPhrases")),
            "lineMarkers": line_markers,
        }
    )
    return _compiled


def _source_external_id(source: dict[str, Any] | None) -> str | None:
    if not source:
        return None
    for key in ("externalId", "external_id", "id"):
        value = source.get(key)
        if value:
            return str(value)
    return None


def unit_external_id(source_id: str | None, split_index: int, unit_count: int) -> str | None:
    """Контракт Этапа 15: суффикс только у детей после первой единицы."""
    if source_id is None:
        return None
    if unit_count <= 1 or split_index == 0:
        return source_id
    return f"{source_id}#{split_index + 1}"


def _lines(text: str) -> list[tuple[int, int, str, int]]:
    """(start, end, строка без перевода, отступ) по исходному тексту."""
    rows: list[tuple[int, int, str, int]] = []
    pos = 0
    for raw in text.splitlines(keepends=True):
        body = raw.rstrip("\r\n")
        indent = len(body) - len(body.lstrip(" \t"))
        rows.append((pos, pos + len(raw), body, indent))
        pos += len(raw)
    if not rows and text:
        rows.append((0, len(text), text, 0))
    return rows


def _line_start(text: str, pos: int) -> int:
    return text.rfind("\n", 0, pos) + 1


def _at_line_start(text: str, pos: int) -> int:
    start = _line_start(text, pos)
    if text[start:pos].strip() == "":
        return start
    return pos


def _original_slice(text: str, folded_snippet: str) -> str | None:
    if not folded_snippet:
        return None
    haystack = fold_text(text)
    needle = fold_text(folded_snippet)
    pos = haystack.find(needle)
    if pos < 0:
        return None
    return text[pos : pos + len(needle)]


def _profession_in_window(text: str, start: int, window: int) -> bool:
    piece = text[start : start + max(window, 0)]
    return bool(extract_professions(piece))


def _line_marker_id(line: str, markers: list[dict[str, Any]]) -> str | None:
    stripped = line.lstrip(" \t")
    if not stripped:
        return None
    for entry in markers:
        prefix = entry.get("prefix")
        if prefix and stripped.startswith(prefix):
            return str(entry.get("id") or prefix)
        compiled = entry.get("compiled")
        if compiled is not None and compiled.search(line):
            return str(entry.get("id") or "line")
    return None


def _merge_hyphen_hits(text: str, hits: list[ProfessionHit], separators: list[str]) -> list[ProfessionHit]:
    if len(hits) < 2:
        return hits
    folded = fold_text(text)
    merged: list[ProfessionHit] = [hits[0]]
    for hit in hits[1:]:
        prev = merged[-1]
        between = folded[prev.end : hit.start].strip()
        if between in separators or between == "":
            continue
        merged.append(hit)
    return merged


def _duty_spans(text: str, bundle: dict[str, Any], stop_positions: list[int]) -> list[tuple[int, int]]:
    body = fold_text(text)
    stops = sorted({pos for pos in stop_positions if pos >= 0})
    spans: list[tuple[int, int]] = []
    for _entry, pattern in bundle["duty"]:
        for match in pattern.finditer(body):
            start = match.start()
            end = len(text)
            for stop in stops:
                if stop > start:
                    end = stop
                    break
            spans.append((start, end))
    spans.sort()
    return spans


def _inside(pos: int, spans: list[tuple[int, int]]) -> bool:
    return any(start <= pos < end for start, end in spans)


def _collect_phrase_starts(
    text: str,
    group: list[tuple[dict[str, Any], re.Pattern[str]]],
    window: int,
    reason_prefix: str,
) -> list[tuple[int, str, int]]:
    body = fold_text(text)
    found: list[tuple[int, str, int]] = []
    for entry, pattern in group:
        for match in pattern.finditer(body):
            if entry.get("needsProfession") and not _profession_in_window(text, match.end(), window):
                continue
            # «Требуется продавец» — первая (часто единственная) должность,
            # не граница между двумя работами. Режем только со второго такого маркера.
            if entry.get("subsequentOnly") and not extract_professions(text[: match.start()]):
                continue
            pos = _at_line_start(text, match.start())
            reason = f"{reason_prefix}:{entry.get('id')}"
            found.append((pos, reason, match.end() - match.start()))
    return found


def _org_matches(text: str, bundle: dict[str, Any]) -> list[tuple[int, str]]:
    body = fold_text(text)
    found: list[tuple[int, str]] = []
    for _entry, pattern in bundle["org"]:
        for match in pattern.finditer(body):
            found.append((match.start(), match.group(0)))
    found.sort()
    return found


def _plan_starts(text: str, bundle: dict[str, Any]) -> tuple[list[tuple[int, str]], bool]:
    """Список (позиция, причина) начал единиц и флаг «сомнительно»."""
    cfg = bundle["cfg"]
    window = int(cfg.get("professionWindow") or 72)
    min_list = int(cfg.get("minListItems") or 2)
    min_gap = int(cfg.get("minChunkChars") or 12)
    do_not = cfg.get("doNotSplit") or {}
    separators = list(do_not.get("compoundSeparators") or ["-", "—", "–"])
    folded = fold_text(text)

    phrase_starts = _collect_phrase_starts(text, bundle["role"], window, "role")
    phrase_starts += _collect_phrase_starts(text, bundle["employer"], window, "employer")

    intro_positions = sorted({match.start() for _e, pattern in bundle["listIntro"] for match in pattern.finditer(folded)})

    raw_line_jobs: list[tuple[int, str, int]] = []
    for start, _end, line, indent in _lines(text):
        marker_id = _line_marker_id(line, bundle["lineMarkers"])
        if not marker_id:
            continue
        if not extract_professions(line):
            continue
        raw_line_jobs.append((start, f"line:{marker_id}", indent))

    stop_for_duty = [pos for pos, _reason, _span in phrase_starts]
    stop_for_duty += [pos for pos, _reason, _indent in raw_line_jobs]
    stop_for_duty += intro_positions
    duty_spans = _duty_spans(text, bundle, stop_for_duty)

    line_jobs = [item for item in raw_line_jobs if not _inside(item[0], duty_spans)]
    top_line_jobs: list[tuple[int, str]] = []
    if line_jobs:
        min_indent = min(item[2] for item in line_jobs)
        same_level = [item for item in line_jobs if item[2] == min_indent]
        if len(same_level) >= min_list:
            top_line_jobs = [(item[0], item[1]) for item in same_level]

    after_intro: list[tuple[int, str]] = []
    if cfg.get("bareProfessionAfterIntro") and intro_positions:
        first_intro = intro_positions[0]
        for start, _end, line, indent in _lines(text):
            if start <= first_intro:
                continue
            if _inside(start, duty_spans):
                continue
            if not line.strip():
                continue
            if not extract_professions(line):
                continue
            after_intro.append((start, "list:intro_item"))
        if len(after_intro) < min_list:
            after_intro = []

    org_starts: list[tuple[int, str]] = []
    if cfg.get("orgChangeSplits"):
        seen_org: str | None = None
        for pos, sample in _org_matches(text, bundle):
            line_pos = _line_start(text, pos)
            line = text[line_pos : text.find("\n", line_pos) if text.find("\n", line_pos) >= 0 else len(text)]
            if not extract_professions(line):
                continue
            key = fold_text(sample)
            if seen_org is None:
                seen_org = key
                continue
            if key != seen_org:
                org_starts.append((line_pos, "employer:org_change"))
                seen_org = key

    phone_starts: list[tuple[int, str]] = []
    if cfg.get("phoneTiedToProfessionBlock"):
        prev_phone: str | None = None
        for start, _end, line, _indent in _lines(text):
            if _inside(start, duty_spans):
                continue
            hits = extract_professions(line)
            phones = extract_phone(line)
            if not hits or not phones:
                continue
            current = phones[0].normalized
            if prev_phone is None:
                prev_phone = current
                continue
            if current != prev_phone:
                phone_starts.append((start, "employer:phone_block"))
                prev_phone = current

    inline_starts: list[tuple[int, str]] = []
    if cfg.get("inlineDashProfession"):
        for match in re.finditer(r"[-—–]\s+", text):
            if _inside(match.start(), duty_spans):
                continue
            prev = text[match.start() - 1] if match.start() else " "
            if prev.isalnum():
                continue
            if not _profession_in_window(text, match.end(), window):
                continue
            if not extract_professions(text[: match.start()]):
                continue
            inline_starts.append((match.start(), "line:inline_dash"))

    hits = extract_professions(text)
    if cfg.get("compoundIfHyphen") is not False:
        hits = _merge_hyphen_hits(text, hits, separators)
    job_hits = [hit for hit in hits if not _inside(max(hit.start, 0), duty_spans)]
    if not job_hits and hits:
        job_hits = [hits[0]]

    first_job: list[tuple[int, str]] = []
    if job_hits:
        first_pos = _line_start(text, max(job_hits[0].start, 0))
        first_job = [(first_pos, "first")]

    candidates: list[tuple[int, str, int]] = [(pos, reason, 0) for pos, reason in first_job]
    candidates += [(pos, reason, span) for pos, reason, span in phrase_starts]
    candidates += [(pos, reason, 0) for pos, reason in top_line_jobs]
    candidates += [(pos, reason, 0) for pos, reason in after_intro]
    candidates += [(pos, reason, 0) for pos, reason in org_starts]
    candidates += [(pos, reason, 0) for pos, reason in phone_starts]
    candidates += [(pos, reason, 0) for pos, reason in inline_starts]
    candidates.sort(key=lambda row: (row[0], -row[2], row[1]))

    starts: list[tuple[int, str]] = []
    for pos, reason, _span in candidates:
        if pos < 0 or pos >= len(text):
            continue
        if starts and pos - starts[-1][0] < min_gap:
            continue
        starts.append((pos, reason))

    extra_professions = len(job_hits) >= 2
    structural = any(reason != "first" for _pos, reason in starts)
    doubtful = extra_professions and (len(starts) < 2 or not structural)
    if doubtful and len(starts) < 2:
        return starts[:1], True
    if doubtful:
        return starts[:1] if starts else [(0, "first")], True
    return starts, False


def _shared_facts(text: str, bundle: dict[str, Any]) -> list[tuple[str, str]]:
    cfg = bundle["cfg"]
    inherit = cfg.get("inherit") or {}
    folded = fold_text(text)
    found: list[tuple[int, str, str]] = []

    if inherit.get("city"):
        city = shared_config.find_city_alias(folded)
        if city:
            snippet = _original_slice(text, city[0])
            pos = folded.find(city[0])
            if snippet and pos >= 0:
                found.append((pos, "city", snippet))
    if inherit.get("district"):
        district = shared_config.find_district_alias(folded)
        if district:
            snippet = _original_slice(text, district[0])
            pos = folded.find(district[0])
            if snippet and pos >= 0:
                found.append((pos, "district", snippet))

    if inherit.get("singlePhone"):
        phones = extract_phone(text)
        unique = list(dict.fromkeys(item.normalized for item in phones))
        if len(unique) == 1 and phones[0].original:
            snippet = phones[0].original.strip()
            pos = text.find(snippet)
            if pos < 0:
                pos = 0
            found.append((pos, "phone", snippet))

    if inherit.get("singleOrg"):
        orgs = _org_matches(text, bundle)
        keys = list(dict.fromkeys(fold_text(sample) for _pos, sample in orgs))
        if len(keys) == 1 and orgs:
            pos, sample = orgs[0]
            snippet = _original_slice(text, sample) or sample
            found.append((pos, "org", snippet))

    field_flags = {
        "housing": inherit.get("vahtaHousing"),
        "meals": inherit.get("vahtaMeals"),
        "travel": inherit.get("vahtaTravel"),
    }
    body = folded
    for entry, sample in iter_hits(compiled()["vahtaConditions"], body):
        field_name = str(entry.get("field") or "")
        if not field_flags.get(field_name):
            continue
        snippet = _original_slice(text, sample) or sample
        pos = body.find(fold_text(sample))
        if pos < 0:
            pos = 0
        found.append((pos, field_name, snippet))

    for entry, pattern in bundle["inheritPhrases"]:
        match = pattern.search(folded)
        if not match:
            continue
        field_name = str(entry.get("field") or "shared")
        snippet = _original_slice(text, match.group(0)) or match.group(0)
        found.append((match.start(), field_name, snippet))

    if inherit.get("sharedConditionBlocks"):
        for entry, pattern in bundle["sharedCond"]:
            match = pattern.search(folded)
            if not match:
                continue
            snippet = _original_slice(text, match.group(0)) or match.group(0)
            found.append((match.start(), "sharedConditions", snippet))

    found.sort(key=lambda row: (row[0], row[1]))
    facts: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for _pos, field_name, snippet in found:
        key = (field_name, fold_text(snippet))
        if key in seen or not snippet.strip():
            continue
        seen.add(key)
        facts.append((field_name, snippet.strip()))
    return facts


def _apply_header(header: str, chunk: str, facts: list[tuple[str, str]]) -> tuple[str, dict[str, str]]:
    base = chunk
    inherited: dict[str, str] = {}
    header_s = header.strip()
    folded = fold_text(base)
    if header_s and fold_text(header_s) not in folded:
        base = header_s + "\n" + base
        folded = fold_text(base)
        inherited["header"] = header_s
    missing: list[str] = []
    for field_name, snippet in facts:
        token = fold_text(snippet)
        if token and token not in folded:
            missing.append(snippet)
            folded += "\n" + token
        if token and token in fold_text(base) or token in folded:
            inherited[field_name] = snippet
    if missing:
        base = "\n".join(missing) + "\n" + base
    return base, inherited


def _fill_fields(unit: SplitUnit, source: dict[str, Any] | None) -> None:
    unit.profession = extract_profession(unit.unit_text)
    unit.salary = extract_salary(unit.unit_text)
    unit.phones = extract_phone(unit.unit_text)
    unit.schedule = extract_schedule(unit.unit_text)
    extract_city(unit.unit_text, source=source)


def _one_unit(
    text: str,
    source: dict[str, Any] | None,
    source_id: str | None,
    version: int,
    *,
    review: bool,
    reasons: list[str],
) -> SplitUnit:
    unit = SplitUnit(
        unit_text=text,
        raw_text=text,
        split_index=0,
        source_post_external_id=source_id,
        external_id=unit_external_id(source_id, 0, 1),
        reasons=reasons,
        needs_human_review=review,
        splitter_version=version,
    )
    _fill_fields(unit, source)
    return unit


def split_post(text: str, source: dict[str, Any] | None = None) -> list[SplitUnit]:
    """Список единиц. Одна единица, если резать нечего или сомнительно."""
    original = text if text is not None else ""
    bundle = _split_bundle()
    cfg = bundle["cfg"]
    version = int(cfg.get("SPLITTER_VERSION") or 1)
    max_units = int(cfg.get("maxUnits") or 8)
    source_id = _source_external_id(source)

    if not original.strip():
        return [_one_unit(original, source, source_id, version, review=False, reasons=[])]

    starts, doubtful = _plan_starts(original, bundle)
    truncated = False
    if len(starts) > max_units:
        starts = starts[:max_units]
        truncated = True

    if len(starts) < 2 or doubtful:
        reasons: list[str] = []
        if doubtful:
            reasons.append("doubtful")
        if truncated:
            reasons.append("truncated")
        return [
            _one_unit(
                original,
                source,
                source_id,
                version,
                review=doubtful or truncated,
                reasons=reasons,
            )
        ]

    facts = _shared_facts(original, bundle)
    header = original[: starts[0][0]]
    units: list[SplitUnit] = []
    count = len(starts)
    for index, (start, reason) in enumerate(starts):
        end = starts[index + 1][0] if index + 1 < count else len(original)
        chunk = original[start:end]
        if index == 0:
            body = original[:end]
            inherited: dict[str, str] = {}
            folded_body = fold_text(body)
            extras: list[str] = []
            for field_name, snippet in facts:
                token = fold_text(snippet)
                if not token:
                    continue
                inherited[field_name] = snippet
                if token not in folded_body:
                    extras.append(snippet)
                    folded_body += "\n" + token
            if extras:
                body = "\n".join(extras) + "\n" + body
            unit_text = body
        else:
            unit_text, inherited = _apply_header(header, chunk, facts)
        reasons = ["split", reason] if reason != "first" else ["split"]
        if truncated:
            reasons.append("truncated")
        unit = SplitUnit(
            unit_text=unit_text,
            raw_text=original,
            split_index=index,
            source_post_external_id=source_id,
            external_id=unit_external_id(source_id, index, count),
            reasons=reasons,
            needs_human_review=truncated,
            inherited=inherited,
            splitter_version=version,
        )
        _fill_fields(unit, source)
        units.append(unit)
    return units
