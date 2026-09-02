"""Информативность: то, чего в посте не было, но что есть в данных (11.11).

Ничего не выдумываем (Закон 16). Район — если название или алиас из
geo.json буквально есть в тексте. Сфера — из professions.json, пост
про неё молчал. Опыт и занятость — из формулировок, которые extract
уже нашёл. Пробел → подсказка «что уточнить», а не пустая строка.

Работодатель по телефону — самый выгодный бесплатный приём.
Большинство объявлений из групп ВК не содержат названия компании
вообще: «зп хорошая, звонить». Один и тот же нормализованный номер
почти всегда один работодатель. Сгруппировав вакансии по телефону,
мы подставляем имя из другого его объявления и показываем человеку
«ещё N вакансий этого работодателя» — там, где в посте не было ничего.
Это ноль рублей, ноль ИИ и ноль внешних API. На этапе 14 базы ещё нет:
сюда передаётся необязательный индекс уже известных контактов, а в
записи всегда есть contactKey, чтобы парсер потом сгруппировал сам.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config
from extract import Contacts, Phone, extract_employment, extract_experience
from filter import compile_terms, first_match
from normalize import get_cfg
from vahta import detect_work_format

_PERIOD_MAP = {
    "month": "MONTH",
    "MONTH": "MONTH",
    "hour": "HOUR",
    "HOUR": "HOUR",
    "shift": "SHIFT",
    "SHIFT": "SHIFT",
    "day": "SHIFT",
    "DAY": "SHIFT",
    "piece": "PIECE",
    "PIECE": "PIECE",
}

_EMPLOYMENT_MAP = {
    "full": "FULL",
    "part": "PART",
    "temporary": "TEMPORARY",
    "remote": "REMOTE",
    "shift": "SHIFT",
}

_TME_RE = re.compile(r"(?:https?://)?t(?:elegram)?\.me/([a-zA-Z][\w]{3,31})", re.I)


def city_display_name(slug: str | None) -> str | None:
    if not slug:
        return None
    city = shared_config.cities_by_slug().get(slug)
    if not city:
        return None
    names = city.get("name") or {}
    return names.get("nom") or None


def district_display_name(city_slug: str | None, district_slug: str | None) -> str | None:
    if not city_slug or not district_slug:
        return None
    city = shared_config.cities_by_slug().get(city_slug)
    if not city:
        return None
    for district in city.get("districts") or []:
        if district.get("slug") == district_slug:
            return district.get("name") or None
    return None


def enrich_district(text: str, city_slug: str | None = None) -> str | None:
    """Район по названию и алиасу из geo.json. «возле Никитовского рынка» → Никитовка."""
    hit = shared_config.find_district_alias(text or "")
    if not hit:
        return None
    _alias, owner, district_slug = hit
    if city_slug and owner != city_slug:
        folded = (text or "").replace("ё", "е").replace("Ё", "е").casefold()
        city = shared_config.cities_by_slug().get(city_slug) or {}
        for district in city.get("districts") or []:
            terms = [district.get("name") or "", *(district.get("aliases") or [])]
            for term in terms:
                token = term.replace("ё", "е").casefold()
                if token and token in folded:
                    return str(district["slug"])
        return None
    return district_slug


def enrich_sphere(profession_slug: str | None, profession_sphere: str | None = None) -> str | None:
    if profession_sphere:
        return profession_sphere
    if not profession_slug:
        return None
    for item in shared_config.get_profession_items():
        if item.get("slug") == profession_slug:
            return item.get("sphere")
    return None


def map_salary_period(period: str | None) -> str | None:
    if not period:
        return None
    return _PERIOD_MAP.get(period)


def map_experience(info: dict[str, Any] | None) -> str | None:
    if not info:
        return None
    years = info.get("years")
    if years is None:
        return None
    try:
        amount = int(years)
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return "NONE"
    if amount < 1:
        return "UP_TO_1"
    if amount < 3:
        return "FROM_1_TO_3"
    return "FROM_3"


def experience_summary(enum_value: str | None) -> str | None:
    if not enum_value:
        return None
    labels = (get_cfg().get("experienceSummary") or {})
    return labels.get(enum_value) or None


def map_employment(raw: str | None, work_format: str | None) -> str | None:
    if work_format == "REMOTE":
        mapped = _EMPLOYMENT_MAP.get((raw or "").lower())
        return mapped or "REMOTE"
    if not raw:
        return None
    if raw.lower() == "vahta":
        # Формат работы уже VAHTA. Тип занятости не подменяем догадкой.
        return None
    return _EMPLOYMENT_MAP.get(raw.lower())


def contact_key(phone: Phone | None) -> str | None:
    if phone is None:
        return None
    return phone.normalized


def lookup_employer_by_phone(
    phone: str | None,
    contacts_index: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Заготовка «работодатель по контакту». См. модульный комментарий."""
    if not phone or not contacts_index:
        return None
    row = contacts_index.get(phone)
    if not row:
        return None
    name = (row.get("name") or "").strip() or None
    count = row.get("vacancyCount") or row.get("count")
    payload: dict[str, Any] = {}
    if name:
        payload["employerName"] = name
    if isinstance(count, int) and count > 1:
        payload["otherVacancies"] = count - 1
    return payload or None


def extract_org_name(text: str) -> str | None:
    """ООО / ИП из текста источника, не догадка."""
    markers = compile_terms((shared_config.get_split() or {}).get("orgMarkers"))
    sample = None
    for _entry, pattern in markers:
        sample = first_match(pattern, text or "")
        if sample:
            break
    if not sample:
        return None
    cleaned = re.sub(r"\s+", " ", sample).strip(" «»\"'")
    return cleaned or None


def telegram_from_contacts(contacts: Contacts) -> str | None:
    if contacts.usernames:
        return contacts.usernames[0]
    for link in contacts.links:
        match = _TME_RE.search(link)
        if match:
            return "@" + match.group(1)
    return None


def missing_info(fields: dict[str, Any]) -> list[str]:
    """Пробел → совет, что уточнить у работодателя. Пустое поле не показываем."""
    labels = dict((get_cfg().get("missingInfo") or {}))
    items: list[str] = []
    if fields.get("salaryFrom") is None and fields.get("salaryTo") is None:
        if labels.get("salary"):
            items.append(str(labels["salary"]))
    is_vahta = fields.get("workFormat") == "VAHTA"
    if is_vahta:
        if not (fields.get("rotationPattern") or "").strip() and labels.get("rotation"):
            items.append(str(labels["rotation"]))
    elif not (fields.get("schedule") or "").strip() and labels.get("schedule"):
        items.append(str(labels["schedule"]))
    if not fields.get("experience") and labels.get("experience"):
        items.append(str(labels["experience"]))
    if not fields.get("employmentType") and labels.get("employment"):
        items.append(str(labels["employment"]))
    if not is_vahta and not (fields.get("address") or "").strip() and labels.get("address"):
        items.append(str(labels["address"]))
    if not (
        fields.get("contactPhone")
        or fields.get("contactTelegram")
        or fields.get("contactEmail")
    ) and labels.get("contact"):
        items.append(str(labels["contact"]))
    if not fields.get("employerName") and labels.get("employer"):
        items.append(str(labels["employer"]))
    return items


def enrich_fields(
    text: str,
    fields: dict[str, Any],
    *,
    contacts_index: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Дополнить поля единицы. Исходный словарь не портим."""
    merged = dict(fields)
    city_slug = merged.get("citySlug")
    if not merged.get("districtSlug"):
        district = enrich_district(text, city_slug)
        if district:
            merged["districtSlug"] = district
    merged["districtName"] = district_display_name(merged.get("citySlug"), merged.get("districtSlug"))
    merged["cityName"] = city_display_name(merged.get("citySlug"))
    merged["sphere"] = enrich_sphere(merged.get("professionSlug"), merged.get("sphere"))

    if not merged.get("experience"):
        merged["experience"] = map_experience(extract_experience(text))
    merged["experienceSummary"] = experience_summary(merged.get("experience"))

    work_format = merged.get("workFormat") or detect_work_format(text)
    merged["workFormat"] = work_format
    if not merged.get("employmentType"):
        merged["employmentType"] = map_employment(extract_employment(text), work_format)

    if not merged.get("employerName"):
        org = extract_org_name(text)
        if org:
            merged["employerName"] = org
    phone = merged.get("contactPhone")
    found = lookup_employer_by_phone(phone, contacts_index)
    if found:
        if not merged.get("employerName") and found.get("employerName"):
            merged["employerName"] = found["employerName"]
        if found.get("otherVacancies"):
            merged["otherVacancies"] = found["otherVacancies"]
    if phone:
        merged["contactKey"] = phone

    merged["missingInfo"] = missing_info(merged)
    return merged
