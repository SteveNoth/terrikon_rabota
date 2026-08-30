"""Загрузка пар «плохой пост → ожидаемый результат» для нормализатора."""

from __future__ import annotations

import json
from pathlib import Path
from extract import extract_phone

SAMPLES = Path(__file__).resolve().parent / "samples.json"
DEFAULT_SOURCE = {
    "name": "Работа Горловка",
    "default_city": "gorlovka",
    "externalId": "norm-src",
}


def load_normalize_samples() -> tuple[dict, list[dict]]:
    data = json.loads(SAMPLES.read_text(encoding="utf-8"))
    source = data.get("source") or DEFAULT_SOURCE
    return source, list(data["posts"])


def _haystack(record: dict[str, Any]) -> str:
    parts = [
        record.get("description") or "",
        record.get("title") or "",
        record.get("summaryLine") or "",
    ]
    sections = record.get("descriptionSections") or {}
    if isinstance(sections, dict):
        parts.append(str(sections.get("description") or ""))
        for key in ("tasks", "requirements", "conditions"):
            parts.extend(sections.get(key) or [])
    return "\n".join(parts)


def check_expected(records: list[dict[str, Any]], expected: dict[str, Any]) -> list[str]:
    """Список ошибок. Пустой — пример совпал с ожиданием."""
    errors: list[str] = []
    count = expected.get("recordCount")
    if count is not None and len(records) != count:
        errors.append(f"записей {len(records)}, ждали {count}")
        return errors
    if not records:
        return errors
    record = records[0]
    if "title" in expected and record.get("title") != expected["title"]:
        errors.append(f"заголовок «{record.get('title')}», ждали «{expected['title']}»")
    if expected.get("hasTasks") and not (record.get("descriptionSections") or {}).get("tasks"):
        errors.append("нет списка задач")
    if expected.get("hasRequirements") and not (record.get("descriptionSections") or {}).get("requirements"):
        errors.append("нет списка требований")
    if expected.get("hasConditions") and not (record.get("descriptionSections") or {}).get("conditions"):
        errors.append("нет списка условий")
    hay = _haystack(record)
    hay_fold = hay.casefold()
    for junk in expected.get("junkAbsent") or []:
        if junk.casefold() in hay_fold:
            errors.append(f"мусор «{junk}» остался в тексте")
    phone = expected.get("phone")
    if phone and record.get("contactPhone") != phone:
        errors.append(f"телефон {record.get('contactPhone')}, ждали {phone}")
    if expected.get("phoneNotInDescription"):
        leftover = extract_phone(hay)
        if leftover:
            errors.append(
                "телефон остался в описании: " + leftover[0].original
            )
    summary = record.get("summaryLine") or ""
    for piece in expected.get("summaryContains") or []:
        if piece not in summary:
            errors.append(f"сводка без «{piece}»: {summary}")
    min_c = expected.get("minCompleteness")
    if min_c is not None:
        got = record.get("completeness")
        if not isinstance(got, int) or got < min_c:
            errors.append(f"полнота {got}, ждали ≥ {min_c}")
    for abbr in expected.get("abbreviationsPresent") or []:
        blob = hay + (record.get("titleOriginal") or "")
        if abbr not in blob and abbr not in (record.get("description") or ""):
            errors.append(f"сокращение «{abbr}» потерялось")
    if "workFormat" in expected and record.get("workFormat") != expected["workFormat"]:
        errors.append(f"формат {record.get('workFormat')}, ждали {expected['workFormat']}")
    if "districtSlug" in expected and record.get("districtSlug") != expected["districtSlug"]:
        errors.append(f"район {record.get('districtSlug')}, ждали {expected['districtSlug']}")
    if expected.get("emptyFieldAbsent"):
        for key in expected["emptyFieldAbsent"]:
            if key in record and record[key] in (None, "", [], {}):
                errors.append(f"пустое поле {key} присутствует")
            if key in record and record.get(key) is None:
                errors.append(f"поле {key} = null")
    if expected.get("hasCompletenessBreakdown"):
        if not record.get("completenessBreakdown"):
            errors.append("нет расшифровки полноты")
    if "professionSlug" in expected and record.get("professionSlug") != expected["professionSlug"]:
        errors.append(f"профессия {record.get('professionSlug')}, ждали {expected['professionSlug']}")
    return errors
