"""Читает shared/*.json — один источник правды для Python-парсеров (Закон 5)."""

from __future__ import annotations

import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_GEO_PATH = _ROOT / "shared" / "geo.json"

with _GEO_PATH.open(encoding="utf-8") as _geo_file:
    GEO = json.load(_geo_file)

_CITIES = sorted(GEO["cities"], key=lambda city: city["priority"])

ALL_CITIES = [city["slug"] for city in _CITIES]
ACTIVE_CITIES = [city["slug"] for city in _CITIES if city["status"] == "active"]
CITIES_BY_SLUG = {city["slug"]: city for city in _CITIES}

DISTRICTS = {city["slug"]: city.get("districts", []) for city in _CITIES}

_GENERIC_DISTRICT_NAME_MAX = 6


def _district_terms(district: dict) -> list[str]:
    terms = list(district.get("aliases") or [])
    name = district.get("name") or ""
    if len(name) > _GENERIC_DISTRICT_NAME_MAX or " " in name:
        terms.append(name)
    return terms


def _alias_variants(alias: str) -> list[str]:
    variants = [alias]
    if len(alias) >= 8 and (alias.endswith("ский") or alias.endswith("ской")):
        variants.append(alias[:-4] + "ск")
    return variants


def _build_city_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    for city in _CITIES:
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
            alias = term.strip().casefold()
            for variant in _alias_variants(alias):
                if variant and variant not in aliases:
                    aliases[variant] = slug

        for district in city.get("districts") or []:
            for term in _district_terms(district):
                alias = term.strip().casefold()
                for variant in _alias_variants(alias):
                    if variant and variant not in aliases:
                        aliases[variant] = slug

    return aliases


CITY_ALIASES = _build_city_aliases()
_ALIAS_HITS = sorted(CITY_ALIASES.items(), key=lambda item: (-len(item[0]), item[1]))


def resolve_city(text: str) -> str | None:
    """Город по тексту: сначала более длинные алиасы, затем районы."""
    haystack = (text or "").strip().casefold()
    if not haystack:
        return None

    for alias, slug in _ALIAS_HITS:
        if alias in haystack:
            return slug

    return None
