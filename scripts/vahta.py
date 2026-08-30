"""Формат работы: местная / вахта / удалённая (раздел 11.16, Закон 17).

Вахта — не «ещё одна категория» и не сфера. Это вторая география:
город набора (citySlug, откуда пост) и место работы (workLocationText /
workCitySlug) — два разных поля.

Ловушка 1. 60/30 против 2/2
    Схема вахты и сменный график пишутся одинаково: «число дробь число».
    Различаем по величине. Порог в keywords.json → vahta.scheduleMax (до 7)
    и vahta.rotationMin (от 15). 2/2 остаётся графиком и не делает вакансию
    вахтой. 60/30 не попадает в поле «график». Числа 8–14 сознательно никуда
    не кладём — это не график смен и не ротация.

Ловушка 2. Вахта бывает внутри нашей географии
    Восстановительные работы в Мариуполе и Донецке набирают вахтовым методом
    с проживанием. Поэтому правило «место работы вне списка наших городов =
    вахта» НЕВЕРНО. Формат определяют слова («вахта», «вахтовый метод») и
    схема смен от 15 дней. Место работы извлекается отдельно: Ямал — это
    externalDestinations (не город проекта: нет страницы и статистики),
    Мариуполь — наш citySlug в workCitySlug.

Не упрощайте это до «чужой город = вахта»: потеряете половину вахт.
Слово «вахтёр» — это охранник, не вахта. Основа «вахт» с окончаниями
а/ы/у/е/ой не совпадает с «вахтер».
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config
from filter import compiled, iter_hits, normalize

WorkFormat = Literal["LOCAL", "VAHTA", "REMOTE"]
EmployerKind = Literal["DIRECT", "AGENCY", "UNKNOWN"]

_PAIR_RE = re.compile(r"\b(\d{1,3})\s*[\/\\]\s*(\d{1,3})\b")


@dataclass
class Rotation:
    pattern: str
    vahta_days: int


@dataclass
class WorkLocation:
    work_location_text: str | None
    work_city_slug: str | None
    work_destination_slug: str | None


@dataclass
class VahtaConditions:
    housing: bool = False
    meals: bool = False
    travel: bool = False
    advance: bool = False
    hits: list[str] | None = None


def _bounds() -> tuple[int, int]:
    vahta = compiled()["keywords"].get("vahta") or {}
    return int(vahta.get("scheduleMax") or 7), int(vahta.get("rotationMin") or 15)


def extract_rotation(text: str) -> Rotation | None:
    """«60/30» и длительность смены числом. Пары до 7 дней игнорируем."""
    _schedule_max, rotation_min = _bounds()
    body = normalize(text).text
    for match in _PAIR_RE.finditer(body):
        left, right = int(match.group(1)), int(match.group(2))
        if left >= rotation_min and right >= rotation_min:
            return Rotation(pattern=f"{left}/{right}", vahta_days=left)
    return None


def extract_vahta_conditions(text: str) -> VahtaConditions:
    body = normalize(text).text
    groups = compiled()
    housing = meals = travel = advance = False
    hits: list[str] = []
    for entry, sample in iter_hits(groups["vahtaConditions"], body):
        field = entry.get("field")
        hits.append(str(entry.get("id") or sample))
        if field == "housing":
            housing = True
        elif field == "meals":
            meals = True
        elif field == "travel":
            travel = True
        elif field == "advance":
            advance = True
    return VahtaConditions(
        housing=housing,
        meals=meals,
        travel=travel,
        advance=advance,
        hits=hits,
    )


def detect_work_format(text: str) -> WorkFormat:
    """LOCAL / VAHTA / REMOTE. Направление вроде Ямала само по себе формат не ставит."""
    body = normalize(text).text
    groups = compiled()
    vahta_cfg = groups["keywords"].get("vahta") or {}

    if iter_hits(groups["vahtaWords"], body):
        return "VAHTA"
    if extract_rotation(text) is not None:
        return "VAHTA"

    conditions = extract_vahta_conditions(text)
    strong_fields = set(vahta_cfg.get("formatStrongFields") or ["housing", "advance"])
    if conditions.housing and "housing" in strong_fields:
        return "VAHTA"
    if conditions.advance and "advance" in strong_fields:
        return "VAHTA"
    weak = int(conditions.meals) + int(conditions.travel)
    if weak >= 2:
        return "VAHTA"

    if iter_hits(groups["remote"], body):
        return "REMOTE"
    return "LOCAL"


def extract_work_location(text: str) -> WorkLocation:
    """Где работа. Для внешних направлений workCitySlug пустой — это не город сайта."""
    body = normalize(text).text
    dest = shared_config.find_destination_alias(body)
    if dest:
        dest_obj = shared_config.destinations_by_slug().get(dest[1]) or {}
        name = dest_obj.get("name") or dest[0]
        return WorkLocation(
            work_location_text=name,
            work_city_slug=None,
            work_destination_slug=dest[1],
        )

    city = shared_config.find_city_alias(body)
    if city:
        city_obj = shared_config.cities_by_slug().get(city[1]) or {}
        names = city_obj.get("name") or {}
        name = names.get("nom") or city[0]
        return WorkLocation(
            work_location_text=name,
            work_city_slug=city[1],
            work_destination_slug=None,
        )

    return WorkLocation(
        work_location_text=None,
        work_city_slug=None,
        work_destination_slug=None,
    )


def detect_employer_kind(text: str) -> EmployerKind:
    body = normalize(text).text
    groups = compiled()
    # Сначала «без посредников»: основа «посредник» иначе ловит эту же фразу.
    if iter_hits(groups["vahtaDirect"], body):
        return "DIRECT"
    if iter_hits(groups["vahtaAgency"], body):
        return "AGENCY"
    return "UNKNOWN"


def describe_vahta(text: str, source: dict[str, Any] | None = None) -> dict[str, Any]:
    """Сводка для тестов и отчёта: набор и место работы рядом, но разными полями."""
    from extract import extract_city

    work_format = detect_work_format(text)
    city = extract_city(text, source=source, work_format=work_format)
    location = extract_work_location(text)
    rotation = extract_rotation(text)
    conditions = extract_vahta_conditions(text)
    payload: dict[str, Any] = {
        "workFormat": work_format,
        "citySlug": city.city_slug,
        "cityReason": city.reason,
        "workLocationText": location.work_location_text,
        "workCitySlug": location.work_city_slug,
        "workDestinationSlug": location.work_destination_slug,
        "employerKind": detect_employer_kind(text),
        "housingProvided": conditions.housing or None,
        "mealsProvided": conditions.meals or None,
        "travelPaid": conditions.travel or None,
        "advancePayment": conditions.advance or None,
    }
    if rotation is not None:
        payload["rotationPattern"] = rotation.pattern
        payload["vahtaDays"] = rotation.vahta_days
    return {key: value for key, value in payload.items() if value is not None}
