"""Переобработка сохранённых вакансий из оригинала подписи.

Когда вырос NORMALIZER_VERSION / SPLITTER_VERSION / OCR_VERSION:
берём rawText и сохранённый ocrText (картинки заново не качаем),
гоняем process_post, обновляем обработанные поля.

rawText не трогаем никогда. Отклики и просмотры не трогаем.
Решение модерации не отменяем: одобренная остаётся одобренной,
заблокированная — заблокированной.

Если единиц стало больше — заводим #2, #3.
Если меньше — лишние помечаем неактивными, не удаляем.

Отчёт: обновлено / без изменений / стало хуже / единиц добавлено / единиц снято.
"""

from __future__ import annotations

import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from psycopg.types.json import Json

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from db_pg import connect
from process import process_post
import shared_config
from extract import content_hash as make_content_hash


def _json(value: Any):
    from psycopg.types.json import Json

    return Json(value)


def current_versions() -> dict[str, str]:
    return {
        "normalizer": str(shared_config.get_normalize().get("NORMALIZER_VERSION") or 1),
        "splitter": str(shared_config.get_split().get("SPLITTER_VERSION") or 1),
        "ocr": str(shared_config.get_ocr().get("OCR_VERSION") or 1),
    }


def plan_units(old_count: int, new_count: int) -> tuple[int, list[int], list[int]]:
    """Сколько сопоставить, какие новые индексы завести, какие старые снять."""
    matched = min(old_count, new_count)
    added = list(range(old_count, new_count))
    removed = list(range(new_count, old_count))
    return matched, added, removed


def _slug(profession: str | None, title: str, city: str, source: str, external_id: str) -> str:
    head = (profession or title or "job").lower()
    safe = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in head)[:40].strip("-") or "job"
    tail = hashlib.sha1(f"{source}:{external_id}".encode("utf-8")).hexdigest()[:10]
    return f"{safe}-{city}-{tail}"


def _load_posts() -> dict[tuple[str, str], list[dict[str, Any]]]:
    sql = """
        SELECT *
        FROM "Vacancy"
        ORDER BY source, "sourcePostExternalId", "splitIndex", "firstSeenAt"
    """
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = list(cur.fetchall())
    for row in rows:
        key = (str(row["source"]), str(row.get("sourcePostExternalId") or row["externalId"]))
        grouped.setdefault(key, []).append(row)
    return grouped


def _source_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": row["source"],
        "name": row.get("sourceName") or row["source"],
        "url": row.get("sourceUrl"),
        "default_city": row["citySlug"],
        "externalId": row.get("sourcePostExternalId") or row["externalId"],
    }


def _processed_fields(record: dict[str, Any], old: dict[str, Any]) -> dict[str, Any]:
    description = (record.get("description") or "")[:3000]
    return {
        "title": record.get("title") or old["title"],
        "titleOriginal": record.get("titleOriginal"),
        "titleNormalized": (record.get("titleNormalized") or record.get("title") or old["title"]).lower(),
        "ocrText": record.get("ocrText") if record.get("ocrText") else old.get("ocrText"),
        "imageUrls": _json(record["imageUrls"]) if record.get("imageUrls") else old.get("imageUrls"),
        "splitIndex": int(record.get("splitIndex") or 0),
        "description": description or old["description"],
        "descriptionSections": _json(record["descriptionSections"]) if record.get("descriptionSections") else None,
        "summaryLine": record.get("summaryLine"),
        "completeness": int(record.get("completeness") or 0),
        "normalizerVersion": str(record.get("normalizerVersion") or current_versions()["normalizer"]),
        "ocrVersion": str(record.get("ocrVersion") or current_versions()["ocr"]),
        "splitterVersion": str(record.get("splitterVersion") or current_versions()["splitter"]),
        "needsAiReview": bool(record.get("needsAiReview")),
        "salaryFrom": record.get("salaryFrom"),
        "salaryTo": record.get("salaryTo"),
        "salaryPeriod": record.get("salaryPeriod") or "MONTH",
        "citySlug": record.get("citySlug") or old["citySlug"],
        "districtSlug": record.get("districtSlug"),
        "workFormat": record.get("workFormat") or "LOCAL",
        "workLocationText": record.get("workLocationText"),
        "workCitySlug": record.get("workCitySlug"),
        "rotationPattern": record.get("rotationPattern"),
        "vahtaDays": record.get("vahtaDays"),
        "housingProvided": bool(record.get("housingProvided")),
        "mealsProvided": bool(record.get("mealsProvided")),
        "travelPaid": bool(record.get("travelPaid")),
        "advancePayment": bool(record.get("advancePayment")),
        "employerKind": record.get("employerKind") or "UNKNOWN",
        "sphere": record.get("sphere") or old.get("sphere") or "unknown",
        "professionSlug": record.get("professionSlug"),
        "schedule": None if record.get("workFormat") == "VAHTA" else record.get("schedule"),
        "contactPhone": record.get("contactPhone"),
        "contactTelegram": record.get("contactTelegram"),
        "contentHash": record.get("contentHash")
        or make_content_hash(old.get("rawText") or "", record.get("contactPhone")),
        "signature": record.get("signature") or old.get("signature") or "",
        "qualityScore": int(record.get("completeness") or 0),
        "trustScore": int(record.get("trustScore") or 0),
        "trustFlags": _json(record.get("trustFlags") or []),
    }


def reprocess() -> dict[str, int]:
    report = {
        "updated": 0,
        "unchanged": 0,
        "worse": 0,
        "unitsAdded": 0,
        "unitsDeactivated": 0,
    }
    posts = _load_posts()
    versions = current_versions()

    with connect() as conn:
        with conn.cursor() as cur:
            for (source, post_id), rows in posts.items():
                raw_text = ""
                ocr_text = ""
                for row in rows:
                    if row.get("rawText") is not None and not raw_text:
                        raw_text = row["rawText"]
                    if row.get("ocrText") and not ocr_text:
                        ocr_text = row["ocrText"]
                if raw_text is None:
                    continue
                records = process_post(
                    raw_text,
                    source=_source_payload(rows[0]),
                    ocr_text=ocr_text or None,
                )
                if not records:
                    # Фильтр сейчас не узнаёт пост. Уже принятые записи не снимаем:
                    # решение модерации важнее новой нарезки.
                    report["unchanged"] += len(rows)
                    continue
                matched, added, removed = plan_units(len(rows), len(records))

                for index in range(matched):
                    old = rows[index]
                    new = records[index]
                    fields = _processed_fields(new, old)
                    old_score = int(old.get("completeness") or 0)
                    new_score = int(fields["completeness"])
                    changed = (
                        old.get("description") != fields["description"]
                        or old.get("title") != fields["title"]
                        or old_score != new_score
                    )
                    if not changed:
                        report["unchanged"] += 1
                        continue
                    if new_score + 5 < old_score:
                        report["worse"] += 1
                    else:
                        report["updated"] += 1
                    assignments = [
                        '"title" = %(title)s',
                        '"titleOriginal" = %(titleOriginal)s',
                        '"titleNormalized" = %(titleNormalized)s',
                        '"ocrText" = %(ocrText)s',
                        '"imageUrls" = %(imageUrls)s',
                        '"splitIndex" = %(splitIndex)s',
                        "description = %(description)s",
                        '"descriptionSections" = %(descriptionSections)s',
                        '"summaryLine" = %(summaryLine)s',
                        "completeness = %(completeness)s",
                        '"normalizerVersion" = %(normalizerVersion)s',
                        '"ocrVersion" = %(ocrVersion)s',
                        '"splitterVersion" = %(splitterVersion)s',
                        '"needsAiReview" = %(needsAiReview)s',
                        '"salaryFrom" = %(salaryFrom)s',
                        '"salaryTo" = %(salaryTo)s',
                        '"salaryPeriod" = %(salaryPeriod)s',
                        '"districtSlug" = %(districtSlug)s',
                        '"workFormat" = %(workFormat)s',
                        '"workLocationText" = %(workLocationText)s',
                        '"workCitySlug" = %(workCitySlug)s',
                        '"rotationPattern" = %(rotationPattern)s',
                        '"vahtaDays" = %(vahtaDays)s',
                        '"housingProvided" = %(housingProvided)s',
                        '"mealsProvided" = %(mealsProvided)s',
                        '"travelPaid" = %(travelPaid)s',
                        '"advancePayment" = %(advancePayment)s',
                        '"employerKind" = %(employerKind)s',
                        "sphere = %(sphere)s",
                        '"professionSlug" = %(professionSlug)s',
                        "schedule = %(schedule)s",
                        '"contactPhone" = %(contactPhone)s',
                        '"contactTelegram" = %(contactTelegram)s',
                        '"contentHash" = %(contentHash)s',
                        "signature = %(signature)s",
                        '"qualityScore" = %(qualityScore)s',
                        '"trustScore" = %(trustScore)s',
                        '"trustFlags" = %(trustFlags)s',
                    ]
                    fields["id"] = old["id"]
                    cur.execute(
                        f'UPDATE "Vacancy" SET {", ".join(assignments)} WHERE id = %(id)s',
                        fields,
                    )

                for index in added:
                    record = records[index]
                    template = rows[0]
                    external_id = record.get("externalId") or f"{post_id}#{index + 1}"
                    fields = _processed_fields(record, template)
                    slug = _slug(
                        record.get("professionSlug"),
                        record.get("title") or "job",
                        fields["citySlug"],
                        source,
                        external_id,
                    )
                    now = datetime.now(timezone.utc)
                    cur.execute(
                        """
                        INSERT INTO "Vacancy" (
                            id, slug, title, "titleOriginal", "titleNormalized",
                            "rawText", "ocrText", "imageUrls", "splitIndex", "sourcePostExternalId",
                            "ocrVersion", "splitterVersion", description, "descriptionSections",
                            "summaryLine", completeness, "normalizerVersion", "needsAiReview",
                            "salaryFrom", "salaryTo", "salaryPeriod", "citySlug", "districtSlug",
                            "workFormat", "workLocationText", "workCitySlug", "rotationPattern",
                            "vahtaDays", "housingProvided", "mealsProvided", "travelPaid",
                            "advancePayment", "employerKind", sphere, "professionSlug", schedule,
                            "contactPhone", "contactTelegram", source, "sourceName", "sourceUrl",
                            "externalId", "contentHash", signature, "qualityScore", "trustScore",
                            "trustFlags", "moderationStatus", "isActive", "publishedAt"
                        ) VALUES (
                            concat('v', substr(md5(random()::text), 1, 24)),
                            %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s
                        )
                        """,
                        (
                            slug,
                            fields["title"],
                            fields["titleOriginal"],
                            fields["titleNormalized"],
                            raw_text,
                            fields["ocrText"],
                            fields["imageUrls"],
                            fields["splitIndex"],
                            post_id,
                            versions["ocr"],
                            versions["splitter"],
                            fields["description"],
                            fields["descriptionSections"],
                            fields["summaryLine"],
                            fields["completeness"],
                            fields["normalizerVersion"],
                            fields["needsAiReview"],
                            fields["salaryFrom"],
                            fields["salaryTo"],
                            fields["salaryPeriod"],
                            fields["citySlug"],
                            fields["districtSlug"],
                            fields["workFormat"],
                            fields["workLocationText"],
                            fields["workCitySlug"],
                            fields["rotationPattern"],
                            fields["vahtaDays"],
                            fields["housingProvided"],
                            fields["mealsProvided"],
                            fields["travelPaid"],
                            fields["advancePayment"],
                            fields["employerKind"],
                            fields["sphere"],
                            fields["professionSlug"],
                            fields["schedule"],
                            fields["contactPhone"],
                            fields["contactTelegram"],
                            source,
                            template.get("sourceName"),
                            template.get("sourceUrl"),
                            external_id,
                            fields["contentHash"],
                            fields["signature"],
                            fields["qualityScore"],
                            fields["trustScore"],
                            fields["trustFlags"],
                            "PENDING",
                            True,
                            template.get("publishedAt") or now,
                        ),
                    )
                    report["unitsAdded"] += 1

                for index in removed:
                    old = rows[index]
                    if old.get("isActive"):
                        cur.execute(
                            'UPDATE "Vacancy" SET "isActive" = false WHERE id = %s',
                            (old["id"],),
                        )
                        report["unitsDeactivated"] += 1
        conn.commit()

    return report


def main() -> int:
    versions = current_versions()
    print(
        f"версии: normalizer={versions['normalizer']} "
        f"splitter={versions['splitter']} ocr={versions['ocr']}"
    )
    report = reprocess()
    print(
        f"обновлено: {report['updated']}; "
        f"без изменений: {report['unchanged']}; "
        f"стало хуже: {report['worse']}; "
        f"единиц добавлено: {report['unitsAdded']}; "
        f"единиц снято: {report['unitsDeactivated']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
