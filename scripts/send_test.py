"""Пример для всех парсеров: пачка на /api/parser/upload.

Обычный запуск отправляет 3 вакансии. Повторный — 0 новых, 3 обновления.
Расширенная проверка: python scripts/send_test.py --suite
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from parser_env import load_env

load_env()

TRUSTED_PHONE = "+79491234501"
NEW_PHONE = "+79990001122"
BLOCKED_PHONE = "+79001230000"


def _site_url() -> str:
    return (
        os.environ.get("SITE_URL")
        or os.environ.get("NEXT_PUBLIC_SITE_URL")
        or "http://127.0.0.1:3000"
    ).rstrip("/")


def _secret() -> str:
    value = (os.environ.get("CRON_SECRET") or "").strip()
    if len(value) < 32:
        raise SystemExit(
            "CRON_SECRET пустой или короче 32 символов. Сгенерируй в PowerShell:\n"
            "[BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','').ToLower()\n"
            "и вставь в .env.local, Vercel и GitHub Secrets."
        )
    return value


def _headers(secret: str | None = None) -> dict[str, str]:
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if secret is not None:
        headers["Authorization"] = f"Bearer {secret}"
    return headers


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def vacancy(
    *,
    external_id: str,
    title: str,
    raw_text: str,
    profession: str,
    sphere: str,
    city: str = "gorlovka",
    work_format: str = "LOCAL",
    phone: str = TRUSTED_PHONE,
    trust: int = 88,
    completeness: int = 90,
    split_index: int = 0,
    source_post: str | None = None,
    ocr_text: str | None = None,
    verdict: str = "accept",
    moderation: str = "AUTO_OK",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    post_id = source_post or external_id.split("#")[0]
    payload: dict[str, Any] = {
        "rawText": raw_text,
        "ocrText": ocr_text,
        "splitIndex": split_index,
        "sourcePostExternalId": post_id,
        "externalId": external_id,
        "title": title,
        "titleOriginal": title,
        "titleNormalized": title.lower(),
        "description": raw_text[:1500],
        "descriptionSections": {
            "description": raw_text[:500],
            "tasks": ["Работа по наряду"],
            "requirements": ["Ответственность"],
            "conditions": ["Оформление"],
        },
        "summaryLine": f"{title} · 45 000 ₽",
        "completeness": completeness,
        "normalizerVersion": "1",
        "ocrVersion": "1",
        "splitterVersion": "2",
        "needsAiReview": False,
        "salaryFrom": 45000,
        "salaryTo": 60000,
        "salaryPeriod": "MONTH",
        "citySlug": city,
        "workFormat": work_format,
        "sphere": sphere,
        "professionSlug": profession,
        "schedule": None if work_format == "VAHTA" else "5/2",
        "contactPhone": phone,
        "source": "VK",
        "sourceName": "send_test",
        "sourceUrl": f"https://vk.com/wall-1_{external_id}",
        "contentHash": None,
        "signature": f"{profession}|{work_format}|{city if work_format != 'VAHTA' else 'yanao'}|{45000 // 10000 * 10000}|",
        "trustScore": trust,
        "trustFlags": [],
        "moderationStatus": moderation,
        "vacancyVerdict": verdict,
        "publishedAt": _now(),
    }
    if work_format == "VAHTA":
        payload["workLocationText"] = "ЯНАО, Новый Уренгой"
        payload["rotationPattern"] = "60/30"
        payload["vahtaDays"] = 60
        payload["housingProvided"] = True
        payload["mealsProvided"] = True
        payload["signature"] = f"{profession}|VAHTA|yanao|40000|60/30"
    if extra:
        payload.update(extra)
    if payload.get("contentHash") is None:
        payload.pop("contentHash")
    if payload.get("ocrText") is None:
        payload.pop("ocrText")
    return payload


def three_vacancies() -> list[dict[str, Any]]:
    return [
        vacancy(
            external_id="send-test-1",
            title="Сварщик",
            raw_text="Требуется сварщик 4 разряда, цех, 45 000–60 000 руб, график 5/2. Тел. 071 123-45-01.",
            profession="svarshchik",
            sphere="stroitelstvo",
        ),
        vacancy(
            external_id="send-test-2",
            title="Продавец",
            raw_text="Ищем продавца в магазин, 45 000 руб, 2/2, Никитовка. Звонить 071 123-45-01.",
            profession="prodavets",
            sphere="torgovlya",
            extra={"schedule": "2/2", "districtSlug": "nikitovka"},
        ),
        vacancy(
            external_id="send-test-3",
            title="Сварщик",
            raw_text="Вахта Ямал, сварщики 180 000, 60/30, проживание и питание. Набор из Горловки. 071 123-45-01.",
            profession="svarshchik",
            sphere="stroitelstvo",
            work_format="VAHTA",
            extra={"salaryFrom": 180000, "salaryTo": 180000},
        ),
    ]


def trust_contact(phone: str) -> None:
    try:
        from db_pg import execute
    except SystemExit:
        print("Нет строки базы — контакт не помечен как проверенный. Вакансии уйдут в PENDING.")
        return
    execute(
        """
        INSERT INTO "ContactVerdict" (id, contact, verdict, reason, "decidedAt", "vacanciesCount")
        VALUES (concat('c', substr(md5(random()::text), 1, 24)), %s, 'TRUSTED', 'send_test: проверенный контакт', NOW(), 1)
        ON CONFLICT (contact) DO UPDATE
        SET verdict = 'TRUSTED', reason = EXCLUDED.reason
        """,
        (phone,),
    )


def post_batch(items: list[Any], *, secret: str | None, parser: str = "send_test") -> requests.Response:
    url = f"{_site_url()}/api/parser/upload"
    body = {"parser": parser, "vacancies": items, "startedAt": _now()}
    return requests.post(url, headers=_headers(secret), json=body, timeout=90)


def print_result(response: requests.Response) -> dict[str, Any]:
    print(f"HTTP {response.status_code}")
    try:
        data = response.json()
    except ValueError:
        print(response.text[:500])
        return {}
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return data if isinstance(data, dict) else {}


def run_default() -> int:
    secret = _secret()
    trust_contact(TRUSTED_PHONE)
    response = post_batch(three_vacancies(), secret=secret)
    data = print_result(response)
    if response.status_code != 200:
        return 1
    print(
        f"добавлено={data.get('added')} обновлено={data.get('updated')} "
        f"на модерации={data.get('pending')} ошибок={data.get('errors')}"
    )
    return 0


def _expect(ok: bool, title: str, detail: str = "") -> bool:
    mark = "OK" if ok else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{mark}] {title}{suffix}")
    return ok


def run_suite() -> int:
    secret = _secret()
    trust_contact(TRUSTED_PHONE)
    failed = 0

    no_token = post_batch(three_vacancies(), secret=None)
    if not _expect(no_token.status_code == 401, "без токена — 401", str(no_token.status_code)):
        failed += 1
    if no_token.status_code == 401:
        body = no_token.json()
        if not _expect(body.get("error") == "Unauthorized" and "Bearer" not in json.dumps(body), "401 без подсказки"):
            failed += 1

    with_token = post_batch(three_vacancies(), secret=secret)
    data = with_token.json() if with_token.ok else {}
    if not _expect(with_token.status_code == 200, "с токеном — 200", str(with_token.status_code)):
        failed += 1
        print(json.dumps(data, ensure_ascii=False)[:800])

    again = post_batch(three_vacancies(), secret=secret)
    again_data = again.json() if again.ok else {}
    if not _expect(
        again.ok and again_data.get("added") == 0 and again_data.get("updated") == 3,
        "повтор: добавлено 0, обновлено 3",
        json.dumps({k: again_data.get(k) for k in ("added", "updated")}, ensure_ascii=False),
    ):
        failed += 1

    donetsk = vacancy(
        external_id="send-test-donetsk",
        title="Продавец",
        raw_text="Требуется продавец в Донецке, 40 000, телефон 071 123-45-01.",
        profession="prodavets",
        sphere="torgovlya",
        city="donetsk",
    )
    donetsk_resp = post_batch([donetsk], secret=secret, parser="send_test_city")
    donetsk_data = donetsk_resp.json() if donetsk_resp.ok else {}
    reasons = json.dumps(donetsk_data.get("пропускиПоГороду") or donetsk_data.get("skippedCityItems") or "", ensure_ascii=False)
    if not _expect(
        donetsk_resp.ok and donetsk_data.get("skippedCity") == 1 and "Донецк" in reasons,
        "город Донецк пропускается с причиной",
        reasons[:200],
    ):
        failed += 1

    batch10: list[Any] = three_vacancies()
    while len(batch10) < 9:
        batch10.append(
            vacancy(
                external_id=f"send-test-ok-{len(batch10)}",
                title="Электрик",
                raw_text="Требуется электрик, 45 000, график 5/2. Тел. 071 123-45-01.",
                profession="elektrik",
                sphere="stroitelstvo",
            )
        )
    batch10.append({"title": "без подписи", "externalId": "broken", "source": "VK"})
    mixed = post_batch(batch10, secret=secret, parser="send_test_mixed")
    mixed_data = mixed.json() if mixed.ok else {}
    if not _expect(
        mixed.ok and mixed_data.get("errors") == 1 and (mixed_data.get("added", 0) + mixed_data.get("updated", 0)) >= 9,
        "одна битая из 10 не мешает остальным",
        json.dumps({k: mixed_data.get(k) for k in ("added", "updated", "errors")}, ensure_ascii=False),
    ):
        failed += 1

    maybe = vacancy(
        external_id="send-test-maybe",
        title="Разнорабочий",
        raw_text="Возможно работа, подробности неясны, 071 123-45-01.",
        profession="raznorabochiy",
        sphere="stroitelstvo",
        verdict="maybe",
        extra={"filterScore": 45, "reasons": ["maybe"]},
    )
    maybe_resp = post_batch([maybe], secret=secret, parser="send_test_maybe")
    maybe_data = maybe_resp.json() if maybe_resp.ok else {}
    if not _expect(
        maybe_resp.ok and maybe_data.get("maybe") == 1 and maybe_data.get("added") == 0,
        "maybe → ParsedPost, не Vacancy",
        json.dumps({k: maybe_data.get(k) for k in ("maybe", "added")}, ensure_ascii=False),
    ):
        failed += 1

    missing = post_batch(
        [{"title": "Сварщик", "externalId": "no-raw", "source": "VK", "description": "нет подписи"}],
        secret=secret,
        parser="send_test_noraw",
    )
    missing_data = missing.json() if missing.ok else {}
    err = json.dumps(missing_data.get("ошибки") or missing_data.get("errorItems") or missing_data, ensure_ascii=False)
    if not _expect(missing.ok and missing_data.get("errors") == 1 and "rawText" in err, "без rawText — понятная причина", err[:240]):
        failed += 1

    ocr_only = vacancy(
        external_id="send-test-ocr",
        title="Продавец",
        raw_text="",
        profession="prodavets",
        sphere="torgovlya",
        ocr_text="Требуется продавец, 28 000, телефон 071 123-45-01.",
        extra={"description": "Требуется продавец, 28 000."},
    )
    ocr_resp = post_batch([ocr_only], secret=secret, parser="send_test_ocr")
    ocr_data = ocr_resp.json() if ocr_resp.ok else {}
    if not _expect(
        ocr_resp.ok and (ocr_data.get("added", 0) + ocr_data.get("updated", 0)) == 1,
        "пустая подпись + ocrText принимается",
        json.dumps({k: ocr_data.get(k) for k in ("added", "updated", "errors")}, ensure_ascii=False),
    ):
        failed += 1

    sheet = [
        vacancy(
            external_id="send-test-sheet",
            title="Продавец",
            raw_text="Требуется продавец и диспетчер. Продавец 30 000, диспетчер 35 000. 071 123-45-01.",
            profession="prodavets",
            sphere="torgovlya",
            split_index=0,
            source_post="send-test-sheet",
        ),
        vacancy(
            external_id="send-test-sheet#2",
            title="Диспетчер",
            raw_text="Требуется продавец и диспетчер. Продавец 30 000, диспетчер 35 000. 071 123-45-01.",
            profession="dispetcher",
            sphere="transport",
            split_index=1,
            source_post="send-test-sheet",
        ),
    ]
    sheet_resp = post_batch(sheet, secret=secret, parser="send_test_split")
    sheet_data = sheet_resp.json() if sheet_resp.ok else {}
    if not _expect(
        sheet_resp.ok and (sheet_data.get("added", 0) + sheet_data.get("updated", 0)) == 2,
        "пост с #2 даёт две вакансии",
        json.dumps({k: sheet_data.get(k) for k in ("added", "updated")}, ensure_ascii=False),
    ):
        failed += 1

    blocked = vacancy(
        external_id="send-test-blocked",
        title="Курьер",
        raw_text="Оформить карту на себя, ежедневная оплата 250 000. Тел. +7 900 123-00-00.",
        profession="kurer",
        sphere="transport",
        phone=BLOCKED_PHONE,
        trust=0,
        moderation="BLOCKED",
        extra={
            "hard": True,
            "trustFlags": [{"id": "oformit_kartu", "points": 0, "label": "дроппер"}],
        },
    )
    blocked_resp = post_batch([blocked], secret=secret, parser="send_test_block")
    blocked_data = blocked_resp.json() if blocked_resp.ok else {}
    if not _expect(
        blocked_resp.ok and blocked_data.get("blocked") == 1,
        "жёсткий флаг → BLOCKED",
        json.dumps({k: blocked_data.get(k) for k in ("blocked", "added")}, ensure_ascii=False),
    ):
        failed += 1

    pending_item = vacancy(
        external_id="send-test-pending",
        title="Сварщик",
        raw_text="Требуется сварщик, 45 000, график 5/2. Новый телефон +7 999 000-11-22.",
        profession="svarshchik",
        sphere="stroitelstvo",
        phone=NEW_PHONE,
        trust=90,
        moderation="AUTO_OK",
    )
    pending_resp = post_batch([pending_item], secret=secret, parser="send_test_pending")
    pending_data = pending_resp.json() if pending_resp.ok else {}
    if not _expect(
        pending_resp.ok and pending_data.get("pending") >= 1 and pending_data.get("added", 0) + pending_data.get("updated", 0) == 1,
        "новый контакт → PENDING",
        json.dumps({k: pending_data.get(k) for k in ("pending", "added")}, ensure_ascii=False),
    ):
        failed += 1

    print(f"\nИтог suite: {failed} провалов")
    return 1 if failed else 0


def run_yamal() -> int:
    from process import process_post
    from tests.fraud import load_fraud_samples

    secret = _secret()
    trust_contact(TRUSTED_PHONE)
    data = load_fraud_samples()
    items: list[dict[str, Any]] = []
    for index, item in enumerate(data["yamalGroup"], start=1):
        source = {
            "type": "VK",
            "name": f"yamal-{index}",
            "default_city": item["city"],
            "url": f"https://vk.com/wall-1_yamal{index}",
            "externalId": f"yamal-{index}",
        }
        batch = process_post(item["text"], source=source, contact_verdicts={TRUSTED_PHONE: "TRUSTED"})
        if not batch:
            print(f"пропуск {item['id']}: process_post вернул пусто")
            continue
        record = batch[0]
        record["source"] = "VK"
        record["externalId"] = f"yamal-{index}"
        record["sourcePostExternalId"] = f"yamal-{index}"
        phone = record.get("contactPhone") or TRUSTED_PHONE
        record["contactPhone"] = phone
        trust_contact(phone)
        record["citySlug"] = "gorlovka"
        record["publishedAt"] = _now()
        record["vacancyVerdict"] = record.get("vacancyVerdict") or "accept"
        if not record.get("descriptionSections"):
            record["descriptionSections"] = {"description": record.get("description") or record.get("rawText") or ""}
        items.append(record)
    response = post_batch(items, secret=secret, parser="send_test_yamal")
    print_result(response)
    print("Дальше: python scripts/regroup.py — восемь вахт должны склеиться в одну группу.")
    return 0 if response.ok else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--suite", action="store_true", help="все проверки Этапа 15 против живого API")
    parser.add_argument("--yamal", action="store_true", help="восемь похожих вахт для regroup.py")
    args = parser.parse_args()
    print(f"Адрес: {_site_url()}/api/parser/upload")
    if args.suite:
        return run_suite()
    if args.yamal:
        return run_yamal()
    return run_default()


if __name__ == "__main__":
    raise SystemExit(main())
