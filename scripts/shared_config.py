"""Читает shared/*.json — один источник правды для Python (Закон 5).

Менять пороги и словари нужно в JSON, не здесь. Этот модуль только
загружает файлы и строит индексы (города, районы, профессии, направления вахты).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / "shared"

GEO_PATH = SHARED / "geo.json"
KEYWORDS_PATH = SHARED / "keywords.json"
PROFESSIONS_PATH = SHARED / "professions.json"
SPLIT_PATH = SHARED / "split.json"

_GENERIC_DISTRICT_NAME_MAX = 6

_cache: dict[str, Any] = {
    "mtimes": {},
    "geo": None,
    "keywords": None,
    "professions": None,
    "split": None,
}


def _mtime(path: Path) -> float:
    return path.stat().st_mtime


def _read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _stale() -> bool:
    mtimes = {
        "geo": _mtime(GEO_PATH),
        "keywords": _mtime(KEYWORDS_PATH),
        "professions": _mtime(PROFESSIONS_PATH),
        "split": _mtime(SPLIT_PATH) if SPLIT_PATH.exists() else None,
    }
    return mtimes != _cache["mtimes"]


def reload() -> None:
    """Перечитать JSON с диска. Нужно тестам: правка порога без правки кода."""
    geo = _read_json(GEO_PATH)
    keywords = _read_json(KEYWORDS_PATH)
    professions = _read_json(PROFESSIONS_PATH)
    split = _read_json(SPLIT_PATH) if SPLIT_PATH.exists() else {}
    _cache["geo"] = geo
    _cache["keywords"] = keywords
    _cache["professions"] = professions
    _cache["split"] = split
    _cache["mtimes"] = {
        "geo": _mtime(GEO_PATH),
        "keywords": _mtime(KEYWORDS_PATH),
        "professions": _mtime(PROFESSIONS_PATH),
        "split": _mtime(SPLIT_PATH) if SPLIT_PATH.exists() else None,
    }
    _cache["indexes"] = _build_indexes(geo, professions)


def _ensure_loaded() -> None:
    if _cache["geo"] is None or _stale():
        reload()


def get_geo() -> dict[str, Any]:
    _ensure_loaded()
    return _cache["geo"]


def get_keywords() -> dict[str, Any]:
    _ensure_loaded()
    return _cache["keywords"]


def get_professions() -> dict[str, Any]:
    _ensure_loaded()
    return _cache["professions"]


def get_profession_items() -> list[dict[str, Any]]:
    return list(get_professions()["items"])


def get_split() -> dict[str, Any]:
    _ensure_loaded()
    return _cache["split"] or {}


def _alias_variants(alias: str) -> list[str]:
    variants = [alias]
    if len(alias) >= 8 and (alias.endswith("ский") or alias.endswith("ской")):
        variants.append(alias[:-4] + "ск")
    return variants


def _district_terms(district: dict[str, Any]) -> list[str]:
    terms = list(district.get("aliases") or [])
    name = district.get("name") or ""
    if len(name) > _GENERIC_DISTRICT_NAME_MAX or " " in name:
        terms.append(name)
    return terms


def _prep_alias(text: str) -> str:
    return text.strip().replace("ё", "е").replace("Ё", "е").casefold()


def _build_indexes(geo: dict[str, Any], professions: dict[str, Any]) -> dict[str, Any]:
    cities = sorted(geo["cities"], key=lambda city: city["priority"])
    destinations = list(geo.get("externalDestinations") or [])

    city_hits: list[tuple[str, str]] = []
    district_hits: list[tuple[str, str, str]] = []
    seen_city_alias: set[str] = set()

    for city in cities:
        slug = city["slug"]
        names = city.get("name") or {}
        terms = {
            names.get("nom", ""),
            names.get("gen", ""),
            names.get("loc", ""),
            names.get("adj", ""),
            *city.get("aliases", []),
        }
        for term in terms:
            for variant in _alias_variants(_prep_alias(term)):
                if variant and variant not in seen_city_alias:
                    seen_city_alias.add(variant)
                    city_hits.append((variant, slug))

        for district in city.get("districts") or []:
            district_slug = district["slug"]
            seen_district: set[str] = set()
            for term in _district_terms(district):
                for variant in _alias_variants(_prep_alias(term)):
                    if variant and variant not in seen_district:
                        seen_district.add(variant)
                        district_hits.append((variant, slug, district_slug))

    dest_hits: list[tuple[str, str]] = []
    seen_dest: set[str] = set()
    for dest in destinations:
        slug = dest["slug"]
        terms = {dest.get("name", ""), *dest.get("aliases", [])}
        for term in terms:
            alias = _prep_alias(term)
            if alias and alias not in seen_dest:
                seen_dest.add(alias)
                dest_hits.append((alias, slug))

    city_hits.sort(key=lambda item: (-len(item[0]), item[1]))
    district_hits.sort(key=lambda item: (-len(item[0]), item[1], item[2]))
    dest_hits.sort(key=lambda item: (-len(item[0]), item[1]))

    return {
        "cities": cities,
        "cities_by_slug": {city["slug"]: city for city in cities},
        "destinations": destinations,
        "destinations_by_slug": {item["slug"]: item for item in destinations},
        "city_hits": city_hits,
        "district_hits": district_hits,
        "dest_hits": dest_hits,
        "all_cities": [city["slug"] for city in cities],
        "active_cities": [city["slug"] for city in cities if city["status"] == "active"],
        "profession_items": list(professions["items"]),
    }


def _indexes() -> dict[str, Any]:
    _ensure_loaded()
    return _cache["indexes"]


def cities() -> list[dict[str, Any]]:
    return _indexes()["cities"]


def cities_by_slug() -> dict[str, dict[str, Any]]:
    return _indexes()["cities_by_slug"]


def destinations() -> list[dict[str, Any]]:
    return _indexes()["destinations"]


def destinations_by_slug() -> dict[str, dict[str, Any]]:
    return _indexes()["destinations_by_slug"]


def active_cities() -> list[str]:
    return _indexes()["active_cities"]


def find_city_alias(text: str) -> tuple[str, str] | None:
    """Первый (самый длинный) алиас города в тексте → (alias, slug)."""
    haystack = _prep_alias(text)
    if not haystack:
        return None
    for alias, slug in _indexes()["city_hits"]:
        if alias in haystack:
            return alias, slug
    return None


def find_district_alias(text: str) -> tuple[str, str, str] | None:
    """Первый алиас района → (alias, city_slug, district_slug)."""
    haystack = _prep_alias(text)
    if not haystack:
        return None
    for alias, city_slug, district_slug in _indexes()["district_hits"]:
        if alias in haystack:
            return alias, city_slug, district_slug
    return None


def find_destination_alias(text: str) -> tuple[str, str] | None:
    """Направление вахты вне покрытия → (alias, slug). Не город проекта."""
    haystack = _prep_alias(text)
    if not haystack:
        return None
    for alias, slug in _indexes()["dest_hits"]:
        if alias in haystack:
            return alias, slug
    return None


def resolve_city(text: str) -> str | None:
    """Город по тексту: сначала более длинные алиасы городов, затем районы."""
    hit = find_city_alias(text)
    if hit:
        return hit[1]
    district = find_district_alias(text)
    if district:
        return district[1]
    return None


def active_city_for_region(region: str) -> str | None:
    """Если в регионе ровно один активный город — его и берём (слабый признак по коду)."""
    matches = [
        city["slug"]
        for city in cities()
        if city.get("region") == region and city.get("status") == "active"
    ]
    if len(matches) == 1:
        return matches[0]
    return None


# Совместимость со старыми импортами
def _legacy() -> None:
    _ensure_loaded()


GEO = None  # заполняется ниже через __getattr__


def __getattr__(name: str) -> Any:
    _ensure_loaded()
    idx = _indexes()
    geo = get_geo()
    mapping = {
        "GEO": geo,
        "ALL_CITIES": idx["all_cities"],
        "ACTIVE_CITIES": idx["active_cities"],
        "CITIES_BY_SLUG": idx["cities_by_slug"],
        "DISTRICTS": {city["slug"]: city.get("districts", []) for city in idx["cities"]},
        "CITY_ALIASES": {alias: slug for alias, slug in idx["city_hits"]},
    }
    if name in mapping:
        return mapping[name]
    raise AttributeError(name)
