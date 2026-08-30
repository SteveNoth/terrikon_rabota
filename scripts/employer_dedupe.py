"""Пятый уровень дублей: работодатель (ИНН), не вместо шинглов.

Ключ с ИНН склеивает ЦЗН и ВК, даже если тексты не похожи.
Без ИНН — только очередь на подтверждение, не автосклейка.
Приоритет источников — shared/dedupe.json, не if source ==.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import shared_config

_LEGAL_FORM = re.compile(
    r"\b(ооо|оао|зао|пао|ао|ип|ано|нко|гуп|муп|гбу|мбу|фгуп|гау|мау|филиал)\b",
    re.IGNORECASE,
)
_QUOTES = re.compile(r"[«»\"„“”']")
_SPACES = re.compile(r"\s+")
_INN = re.compile(r"^\d{10}(\d{2})?$")


def dedupe_cfg() -> dict[str, Any]:
    return dict(shared_config.get_dedupe() or {})


def normalize_employer_name(name: str | None) -> str:
    text = (name or "").replace("ё", "е").replace("Ё", "е").casefold()
    text = _QUOTES.sub("", text)
    text = _LEGAL_FORM.sub(" ", text)
    text = _SPACES.sub(" ", text).strip(" .,")
    return text


def clean_inn(value: str | None) -> str | None:
    digits = re.sub(r"\D", "", value or "")
    if _INN.match(digits):
        return digits
    return None


def employer_inn_key(
    inn: str | None,
    profession_slug: str | None,
    city_slug: str | None,
    work_format: str | None,
) -> str | None:
    inn_ok = clean_inn(inn)
    profession = (profession_slug or "").strip()
    city = (city_slug or "").strip()
    fmt = (work_format or "LOCAL").strip() or "LOCAL"
    if not inn_ok or not profession or not city:
        return None
    return f"inn:{inn_ok}|{profession}|{city}|{fmt}"


def name_match_key(
    employer_name: str | None,
    profession_slug: str | None,
    city_slug: str | None,
    work_format: str | None,
) -> str | None:
    name = normalize_employer_name(employer_name)
    profession = (profession_slug or "").strip()
    city = (city_slug or "").strip()
    fmt = (work_format or "LOCAL").strip() or "LOCAL"
    if not name or not profession or not city:
        return None
    return f"name:{name}|{profession}|{city}|{fmt}"


def source_rank(source: str | None, cfg: dict[str, Any] | None = None) -> int:
    order = list((cfg or dedupe_cfg()).get("sourcePriority") or [])
    token = (source or "").upper()
    try:
        return order.index(token)
    except ValueError:
        return len(order) + 1


def pick_primary(members: list[dict[str, Any]], cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """Главная в группе — с большей полнотой. Источник — из конфига, не if source ==."""
    rules = list((cfg or dedupe_cfg()).get("primaryBy") or ["completeness", "sourcePriority", "firstSeenAt"])

    def sort_key(item: dict[str, Any]) -> tuple:
        parts: list[Any] = []
        for rule in rules:
            if rule == "completeness":
                parts.append(-int(item.get("completeness") or 0))
            elif rule == "sourcePriority":
                parts.append(source_rank(str(item.get("source") or ""), cfg))
            elif rule == "firstSeenAt":
                stamp = item.get("firstSeenAt") or datetime.now(timezone.utc)
                parts.append(stamp)
            else:
                parts.append(0)
        return tuple(parts)

    return sorted(members, key=sort_key)[0]


def cluster_by_employer(rows: list[dict[str, Any]]) -> list[list[int]]:
    """Индексы записей с одним ИНН + профессия + город + формат. Один индекс в одной корзине."""
    buckets: dict[str, list[int]] = {}
    for index, row in enumerate(rows):
        key = employer_inn_key(
            row.get("employerInn"),
            row.get("professionSlug"),
            row.get("citySlug"),
            row.get("workFormat"),
        )
        if not key:
            continue
        buckets.setdefault(key, []).append(index)
    return [indexes for indexes in buckets.values() if len(indexes) >= 2]


def pending_name_matches(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Одинаковое имя без ИНН — на подтверждение, не в группу."""
    buckets: dict[str, list[int]] = {}
    for index, row in enumerate(rows):
        if clean_inn(row.get("employerInn")):
            continue
        key = name_match_key(
            row.get("employerName"),
            row.get("professionSlug"),
            row.get("citySlug"),
            row.get("workFormat"),
        )
        if not key:
            continue
        buckets.setdefault(key, []).append(index)
    pending: list[dict[str, Any]] = []
    for key, indexes in buckets.items():
        if len(indexes) < 2:
            continue
        pending.append(
            {
                "key": key,
                "indexes": indexes,
                "ids": [rows[i].get("id") for i in indexes],
                "reason": "same_employer_name_no_inn",
            }
        )
    return pending


def suspiciously_small(current: int, previous: int | None, *, ratio: float = 0.5) -> bool:
    if previous is None or previous <= 0:
        return False
    return current < previous * ratio


def ids_missing_two_runs(
    *,
    known_ids: set[str],
    seen_ids: set[str],
    last_seen: dict[str, datetime],
    previous_run_started: datetime | None,
) -> list[str]:
    """Не видели в этом запуске и уже пропустили предыдущий успешный. Без предыдущего — пусто."""
    if previous_run_started is None:
        return []
    missing: list[str] = []
    for external_id in known_ids:
        if external_id in seen_ids:
            continue
        seen_at = last_seen.get(external_id)
        if seen_at is None:
            continue
        if seen_at < previous_run_started:
            missing.append(external_id)
    return missing
