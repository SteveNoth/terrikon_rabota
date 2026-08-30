"""Единая точка входа обработки поста (раздел 11.1).

Парсеры вызывают только process_post. Никто не собирает запись сам.

Порядок внутри — как в ядре, и его нельзя переставлять:

    0. OCR: подпись + текст с картинок (14B)
    1. явный СВО на целом посте
    2. фильтр is_vacancy
    3. нарезка split_post → 1…N единиц (14A)
    4. поля extract_* на каждой единице
    5. формат работы LOCAL / VAHTA / REMOTE
    6. скрытый СВО на единице
    7. единый вид (11.8–11.12)
    8. информативность (11.11)
    9. полнота (11.12)
    10. доверие trust_score по единице, не по целому посту
    11. сигнатура дублей (уровень 4). Нечёткая группировка — ночью, не здесь.

Возвращает список словарей. Пустой список — пост отброшен: мусор фильтра,
явный набор на СВО, либо все единицы — скрытый СВО. Одна «простыня» даёт
несколько записей; обычный пост — список из одной.

rawText у каждой записи — подпись источника без изменений, до последнего
символа. Распознанное с картинок живёт рядом в ocrText, не вместо.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from enrich import (
    enrich_fields,
    map_salary_period,
    telegram_from_contacts,
)
from extract import (
    content_hash,
    extract_city,
    extract_contacts,
    extract_phone,
    extract_profession,
    extract_salary,
    extract_schedule,
)
from normalize import (
    build_summary_line,
    clean_title,
    completeness,
    flatten_description,
    get_cfg,
    structure_text,
    strip_junk,
    truncate_smart,
    version as normalizer_version,
)
from ocr import AssembledUnit, assemble_post
from dedupe import build_signature
from trust import trust_score
from vahta import (
    detect_employer_kind,
    detect_work_format,
    extract_rotation,
    extract_vahta_conditions,
    extract_work_location,
)


_KEEP_EMPTY = {
    "rawText",
    "splitIndex",
    "completeness",
    "needsAiReview",
    "needsHumanReview",
    "normalizerVersion",
    "workFormat",
    "contentHash",
    "trustScore",
    "trustFlags",
    "signature",
    "moderationStatus",
}


def _omit_empty(payload: dict[str, Any]) -> dict[str, Any]:
    """Незаполненное отсутствует, а не null и не догадка (Закон 16).

    rawText оставляем даже пустым: это подпись источника, и она должна
    совпасть с оригиналом до последнего символа, в том числе когда
    подписи не было, а текст пришёл с картинки.
    """
    clean: dict[str, Any] = {}
    for key, value in payload.items():
        if key in _KEEP_EMPTY:
            clean[key] = value
            continue
        if value is None:
            continue
        if value == "":
            continue
        if value == [] or value == {}:
            continue
        clean[key] = value
    return clean


def _source_type(source: dict[str, Any]) -> str | None:
    raw = source.get("type") or source.get("source")
    if not raw:
        return None
    token = str(raw).upper()
    if token in {"VK", "TELEGRAM", "WEBSITE", "MANUAL", "EMPLOYER"}:
        return token
    return None


def _process_unit(
    unit: AssembledUnit,
    source: dict[str, Any],
    *,
    vacancy_verdict: str | None,
    contacts_index: dict[str, Any] | None,
    market: dict[str, Any] | None = None,
    contact_verdicts: dict[str, Any] | None = None,
    aggregation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    text = unit.unit_text or ""
    profession = unit.profession or extract_profession(text)
    salary = unit.salary if unit.salary is not None else extract_salary(text)
    phones = list(unit.phones) or extract_phone(text)
    schedule = unit.schedule or extract_schedule(text)
    contacts = extract_contacts(text)
    work_format = detect_work_format(strip_junk(text))
    city = extract_city(text, source=source, work_format=work_format)
    rotation = extract_rotation(text)
    location = extract_work_location(text)
    conditions = extract_vahta_conditions(text)
    employer_kind = detect_employer_kind(text)

    spans: list[str] = []
    for phone in phones:
        if phone.original:
            spans.append(phone.original)
    spans.extend(contacts.usernames)
    spans.extend(contacts.links)

    sections, truncated = structure_text(text, contact_spans=spans)
    title, title_original = clean_title(
        text,
        profession.name if profession else None,
    )

    salary_from = salary.min_amount if salary else None
    salary_to = salary.max_amount if salary else None

    primary_phone = phones[0].normalized if phones else None
    telegram = telegram_from_contacts(contacts)
    cfg = get_cfg()
    ai_below = int(cfg.get("aiReviewBelow") or 40)

    draft: dict[str, Any] = {
        "title": title,
        "titleOriginal": title_original,
        "professionSlug": profession.slug if profession else None,
        "professionName": profession.name if profession else None,
        "sphere": profession.sphere if profession else None,
        "salaryFrom": salary_from,
        "salaryTo": salary_to,
        "salaryPeriod": map_salary_period(salary.period) if salary else None,
        "citySlug": city.city_slug,
        "districtSlug": city.district_slug,
        "workFormat": work_format,
        "workLocationText": location.work_location_text,
        "workCitySlug": location.work_city_slug,
        "workDestinationSlug": location.work_destination_slug,
        "rotationPattern": rotation.pattern if rotation else None,
        "vahtaDays": rotation.vahta_days if rotation else None,
        "housingProvided": True if conditions.housing else None,
        "mealsProvided": True if conditions.meals else None,
        "travelPaid": True if conditions.travel else None,
        "advancePayment": True if conditions.advance else None,
        "employerKind": employer_kind if employer_kind != "UNKNOWN" else None,
        "schedule": None if work_format == "VAHTA" else schedule,
        "contactPhone": primary_phone,
        "contactTelegram": telegram,
        "contactPhones": [item.normalized for item in phones] if len(phones) > 1 else None,
    }
    draft = enrich_fields(text, draft, contacts_index=contacts_index)

    section_payload = sections.as_dict()
    flat = flatten_description(sections)
    description, more_cut = truncate_smart(flat)
    draft["description"] = description or None
    draft["descriptionSections"] = section_payload or None
    draft["summaryLine"] = build_summary_line(draft) or None
    score, breakdown = completeness(draft)
    draft["completeness"] = score
    draft["completenessBreakdown"] = breakdown

    trust = trust_score(
        draft,
        text,
        market,
        contact_verdicts=contact_verdicts,
        aggregation=aggregation,
    )
    signature = build_signature(draft)

    needs_human = bool(unit.needs_human_review) or vacancy_verdict == "maybe" or truncated or more_cut
    if not draft.get("citySlug"):
        needs_human = True
    if trust.moderation_status == "PENDING" or trust.high_risk:
        needs_human = True
    if trust.moderation_status == "BLOCKED":
        needs_human = False
    needs_ai = score < ai_below

    phone_for_hash = primary_phone
    payload: dict[str, Any] = {
        "title": draft.get("title"),
        "titleOriginal": draft.get("titleOriginal"),
        "titleNormalized": draft.get("title"),
        "rawText": unit.raw_text,
        "ocrText": unit.ocr_text or None,
        "imageUrls": list(unit.image_urls) or None,
        "unitText": unit.unit_text,
        "splitIndex": unit.split_index,
        "sourcePostExternalId": unit.source_post_external_id,
        "externalId": unit.external_id,
        "professionSlug": draft.get("professionSlug"),
        "professionName": draft.get("professionName"),
        "sphere": draft.get("sphere"),
        "salaryFrom": draft.get("salaryFrom"),
        "salaryTo": draft.get("salaryTo"),
        "salaryPeriod": draft.get("salaryPeriod"),
        "citySlug": draft.get("citySlug"),
        "cityName": draft.get("cityName"),
        "districtSlug": draft.get("districtSlug"),
        "districtName": draft.get("districtName"),
        "workFormat": draft.get("workFormat"),
        "workLocationText": draft.get("workLocationText"),
        "workCitySlug": draft.get("workCitySlug"),
        "workDestinationSlug": draft.get("workDestinationSlug"),
        "rotationPattern": draft.get("rotationPattern"),
        "vahtaDays": draft.get("vahtaDays"),
        "housingProvided": draft.get("housingProvided"),
        "mealsProvided": draft.get("mealsProvided"),
        "travelPaid": draft.get("travelPaid"),
        "advancePayment": draft.get("advancePayment"),
        "employerKind": draft.get("employerKind"),
        "employerName": draft.get("employerName"),
        "otherVacancies": draft.get("otherVacancies"),
        "contactKey": draft.get("contactKey"),
        "schedule": draft.get("schedule"),
        "experience": draft.get("experience"),
        "experienceSummary": draft.get("experienceSummary"),
        "employmentType": draft.get("employmentType"),
        "contactPhone": draft.get("contactPhone"),
        "contactTelegram": draft.get("contactTelegram"),
        "contactPhones": draft.get("contactPhones"),
        "description": draft.get("description"),
        "descriptionSections": draft.get("descriptionSections"),
        "summaryLine": draft.get("summaryLine"),
        "completeness": score,
        "completenessBreakdown": breakdown,
        "missingInfo": draft.get("missingInfo") or None,
        "normalizerVersion": normalizer_version(),
        "splitterVersion": unit.splitter_version,
        "ocrVersion": unit.ocr_version,
        "needsAiReview": needs_ai,
        "needsHumanReview": needs_human,
        "trustScore": trust.score,
        "trustFlags": [item.as_dict() for item in trust.flags],
        "signature": signature,
        "moderationStatus": trust.moderation_status,
        "highRisk": True if trust.high_risk else None,
        "contentHash": content_hash(unit.raw_text, phone_for_hash),
        "vacancyVerdict": vacancy_verdict,
        "sourceName": source.get("name"),
        "sourceUrl": source.get("url") or source.get("sourceUrl"),
        "source": _source_type(source),
        "reasons": list(unit.reasons) or None,
        "truncated": True if (truncated or more_cut) else None,
    }
    return _omit_empty(payload)


def process_post(
    text: str,
    source: dict[str, Any] | None = None,
    images: list[str] | None = None,
    *,
    market: dict[str, Any] | None = None,
    fetch: Any = None,
    ocr: Any = None,
    spam: bool = False,
    contacts_index: dict[str, Any] | None = None,
    contact_verdicts: dict[str, Any] | None = None,
    aggregation: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Список записей. Пустой — пост отброшен. Парсеры вызывают только это.

    Доверие считается по единице: зарплата соседней должности на простыне
    не должна портить честную. Нечёткие дубли здесь не группируем —
    только signature. contact_verdicts: None — таблицы контактов ещё нет;
    словарь (в том числе пустой) включает правило нового телефона.
    """
    source = source or {}
    caption = text if text is not None else ""
    assembled = assemble_post(
        caption,
        images,
        source=source,
        market=market,
        fetch=fetch,
        ocr=ocr,
        spam=spam,
    )
    if not assembled.units:
        return []
    records: list[dict[str, Any]] = []
    for unit in assembled.units:
        records.append(
            _process_unit(
                unit,
                source,
                vacancy_verdict=assembled.vacancy_verdict,
                contacts_index=contacts_index,
                market=market,
                contact_verdicts=contact_verdicts,
                aggregation=aggregation,
            )
        )
    return records
