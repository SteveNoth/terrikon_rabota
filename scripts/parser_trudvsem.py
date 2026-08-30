"""Парсер открытых данных «Работа России» — класс OPEN_DATA (Закон 12 и 19).

Только GET JSON opendata.trudvsem.ru. HTML m-czn.ru и HTML trudvsem.ru
не читаем. Карточку парсер не собирает: короткий текст из полей API
отдаёт в process_post. Нарезку 14A не вызываем: одна запись API = одна
вакансия. OCR нет. Ключа API нет.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urljoin

import requests

_SCRIPTS = Path(__file__).resolve().parent
ROOT = _SCRIPTS.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from parser_env import load_env
from process import run_process_post
from shared_config import active_cities

load_env()

os.environ["OCR_PROVIDER"] = "none"

from parser_vk import (
    chunked,
    cron_secret,
    ensure_logs_dir,
    merge_upload_stats,
    post_batch_with_retry,
    preview_text,
    print_record,
    rejected_log_path,
    site_url,
    write_rejected,
)

SOURCES_PATH = _SCRIPTS / "sources_trudvsem.json"
LOGS_DIR = ROOT / "logs"
UPLOAD_BATCH = 100
RETRY_PAUSES = (2.0, 4.0, 8.0)
PAUSE_MIN = 1.0
PAUSE_MAX = 3.0
FETCH_TIMEOUT = 90
API_LIMIT_CAP = 10_000
PORTAL = "https://trudvsem.ru"
COMPLETE_PARSER = "parser_trudvsem_complete"
FALLBACK_PAGE_LIMIT = 5

HttpGet = Callable[..., requests.Response]
HttpPost = Callable[..., requests.Response]
Sleeper = Callable[[float], None]

_TAG_RE = re.compile(r"<[^>]+>")
_INN_RE = re.compile(r"^\d{10}(\d{2})?$")


def is_timeout_error(exc: BaseException) -> bool:
    text = str(exc).casefold()
    return "timed out" in text or "timeout" in text


class TrudvsemApiError(Exception):
    """Сеть / 5xx / пустой справочник. Это «нельзя снимать вакансии», не обход."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        self.status = status
        super().__init__(message)


def source_trudvsem_enabled() -> bool:
    raw = (os.environ.get("SOURCE_TRUDVSEM_ENABLED") or "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def user_agent() -> str:
    site = (
        os.environ.get("NEXT_PUBLIC_SITE_URL")
        or os.environ.get("SITE_URL")
        or "https://terrikon-rabota.vercel.app"
    ).rstrip("/")
    return (
        f"TerriconRabota/0.1 (parser-trudvsem; +{site}; "
        "https://github.com/SteveNoth/terrikon_rabota)"
    )


def pause_sec(configured: float | None = None) -> float:
    raw = os.environ.get("TRUDVSEM_PAUSE_SEC")
    if raw:
        try:
            value = float(raw)
            return max(PAUSE_MIN, min(PAUSE_MAX, value))
        except ValueError:
            pass
    if configured is not None:
        return max(PAUSE_MIN, min(PAUSE_MAX, float(configured)))
    return random.uniform(PAUSE_MIN, PAUSE_MAX)


def load_sources(path: Path | None = None) -> dict[str, Any]:
    target = path or SOURCES_PATH
    with target.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit("scripts/sources_trudvsem.json должен быть объектом, не массивом.")
    return data


def fold_text(value: str) -> str:
    return (value or "").replace("ё", "е").replace("Ё", "е").casefold()


def strip_tags(value: str) -> str:
    text = _TAG_RE.sub(" ", value or "")
    return re.sub(r"\s+", " ", text).strip()


def as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(str(value).replace(" ", "").replace("\u00a0", "")))
    except (TypeError, ValueError):
        return None


def clean_inn(value: Any) -> str | None:
    digits = re.sub(r"\D", "", str(value or ""))
    if _INN_RE.match(digits):
        return digits
    return None


def alias_in_location(alias: str, location: str) -> bool:
    hay = fold_text(location)
    needle = fold_text(alias)
    if not needle or not hay:
        return False
    pattern = re.compile(r"(?<![а-яa-z])" + re.escape(needle) + r"(?![а-яa-z])", re.IGNORECASE)
    return bool(pattern.search(hay))


def enabled_regions(data: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    payload = data if data is not None else load_sources()
    regions: list[dict[str, Any]] = []
    for raw in payload.get("regions") or []:
        if not isinstance(raw, dict) or not raw.get("enabled", True):
            continue
        code = str(raw.get("region_code") or "").strip()
        if not code:
            continue
        regions.append(
            {
                "region_code": code,
                "region_name": str(raw.get("region_name") or ""),
                "ourRegion": str(raw.get("ourRegion") or ""),
                "codeSourceUrl": str(raw.get("codeSourceUrl") or ""),
            }
        )
    return regions


def enabled_cities(data: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    payload = data if data is not None else load_sources()
    cities: list[dict[str, Any]] = []
    active = set(active_cities())
    for raw in payload.get("cities") or []:
        if not isinstance(raw, dict) or not raw.get("enabled", True):
            continue
        slug = str(raw.get("citySlug") or "").strip()
        if not slug:
            continue
        aliases = [str(item).strip() for item in (raw.get("aliases") or []) if str(item).strip()]
        cities.append({"citySlug": slug, "aliases": aliases, "active": slug in active})
    return cities


def match_city(location: str, cities: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Самый длинный алиас в месте работы. «донецк» внутри «донецкая» не считается."""
    best: dict[str, Any] | None = None
    best_len = 0
    for city in cities:
        for alias in city.get("aliases") or []:
            if alias_in_location(alias, location) and len(fold_text(alias)) > best_len:
                best = city
                best_len = len(fold_text(alias))
    return best


def unwrap_vacancy(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    inner = item.get("vacancy") if isinstance(item.get("vacancy"), dict) else item
    return inner if isinstance(inner, dict) else None


def location_fields(vacancy: dict[str, Any]) -> tuple[str, list[str]]:
    addresses = vacancy.get("addresses") or {}
    raw = addresses.get("address") if isinstance(addresses, dict) else None
    items: list[dict[str, Any]] = []
    if isinstance(raw, list):
        items = [item for item in raw if isinstance(item, dict)]
    elif isinstance(raw, dict):
        items = [raw]
    locations = [str(item.get("location") or "").strip() for item in items if item.get("location")]
    return " ".join(locations), locations


def contact_value(vacancy: dict[str, Any], kind: str) -> str | None:
    rows = vacancy.get("contact_list") or []
    if not isinstance(rows, list):
        return None
    needle = kind.casefold()
    for row in rows:
        if not isinstance(row, dict):
            continue
        label = str(row.get("contact_type") or "").casefold()
        value = str(row.get("contact_value") or "").strip()
        if value and needle in label:
            return value
    return None


def salary_is_gross(vacancy: dict[str, Any]) -> bool:
    for key in ("salary_gross", "salaryIsGross", "gross"):
        raw = vacancy.get(key)
        if raw is True:
            return True
        if raw is False:
            return False
        token = str(raw or "").strip().lower()
        if token in {"true", "1", "gross", "до вычета"}:
            return True
        if token in {"false", "0", "net", "на руки"}:
            return False
    return True


def map_employment(value: str | None) -> str | None:
    text = fold_text(value or "")
    if not text:
        return None
    if "частич" in text or "неполн" in text:
        return "PART"
    if "времен" in text:
        return "TEMPORARY"
    if "удал" in text:
        return "REMOTE"
    if "смен" in text:
        return "SHIFT"
    if "полн" in text:
        return "FULL"
    return None


def map_experience(value: Any) -> str | None:
    years = as_int(value)
    if years is None:
        return None
    if years <= 0:
        return "NONE"
    if years <= 1:
        return "UP_TO_1"
    if years <= 3:
        return "FROM_1_TO_3"
    return "FROM_3"


def canonical_source_url(vacancy: dict[str, Any], company_code: str, vac_id: str) -> str:
    raw = str(vacancy.get("vac_url") or "").strip()
    if "m-czn.ru" in raw.casefold():
        raw = ""
    if raw.startswith("http://trudvsem.ru/"):
        raw = "https://" + raw[len("http://") :]
    if raw.startswith("https://trudvsem.ru/"):
        return raw
    if company_code and vac_id:
        return f"{PORTAL}/vacancy/card/{company_code}/{vac_id}"
    return PORTAL


def parse_api_vacancy(item: Any) -> dict[str, Any] | None:
    vacancy = unwrap_vacancy(item)
    if not vacancy:
        return None
    vac_id = str(vacancy.get("id") or "").strip()
    if not vac_id:
        return None
    company = vacancy.get("company") if isinstance(vacancy.get("company"), dict) else {}
    company_code = str(company.get("companycode") or company.get("code") or "").strip()
    region = vacancy.get("region") if isinstance(vacancy.get("region"), dict) else {}
    location_joined, locations = location_fields(vacancy)
    requirement = vacancy.get("requirement") if isinstance(vacancy.get("requirement"), dict) else {}
    salary_from = as_int(vacancy.get("salary_min"))
    salary_to = as_int(vacancy.get("salary_max"))
    if salary_from is None and salary_to is None:
        # Не берём цифры из salary-строки, если API не дал min/max: в адресе бывают индексы.
        salary_from = None
        salary_to = None
    return {
        "id": vac_id,
        "companyCode": company_code,
        "jobName": strip_tags(str(vacancy.get("job-name") or vacancy.get("vacancyName") or "")),
        "employerName": strip_tags(str(company.get("name") or "")),
        "employerInn": clean_inn(company.get("inn")),
        "regionCode": str(region.get("region_code") or region.get("code") or ""),
        "regionName": str(region.get("name") or ""),
        "location": location_joined,
        "locations": locations,
        "address": locations[0] if locations else "",
        "salaryFrom": salary_from,
        "salaryTo": salary_to,
        "salaryText": str(vacancy.get("salary") or "").strip() or None,
        "salaryIsGross": salary_is_gross(vacancy),
        "duty": strip_tags(str(vacancy.get("duty") or "")),
        "requirements": strip_tags(
            str(vacancy.get("requirements") or requirement.get("qualification") or "")
        ),
        "qualification": strip_tags(str(vacancy.get("qualification") or "")),
        "schedule": str(vacancy.get("schedule") or "").strip() or None,
        "employment": map_employment(str(vacancy.get("employment") or "")),
        "experience": map_experience(requirement.get("experience")),
        "phone": contact_value(vacancy, "телефон"),
        "email": contact_value(vacancy, "почта") or str(company.get("email") or "").strip() or None,
        "publishedAt": str(vacancy.get("creation-date") or "").strip() or None,
        "sourceUrl": canonical_source_url(vacancy, company_code, vac_id),
        "hrAgency": bool(company.get("hr-agency")),
    }


def assemble_pipeline_text(parsed: dict[str, Any]) -> str:
    """Короткий текст из полей JSON. Правила заголовка пишет process_post, не этот файл."""
    lines: list[str] = []
    if parsed.get("jobName"):
        lines.append(f"Должность: {parsed['jobName']}")
    if parsed.get("employerName"):
        lines.append(f"Работодатель: {parsed['employerName']}")
    if parsed.get("address") or parsed.get("location"):
        lines.append(f"Место работы: {parsed.get('address') or parsed.get('location')}")
    if parsed.get("salaryFrom") or parsed.get("salaryTo"):
        low = parsed.get("salaryFrom")
        high = parsed.get("salaryTo")
        if low and high and low != high:
            pay = f"{low}–{high} руб."
        else:
            pay = f"{low or high} руб."
        lines.append(f"Зарплата: {pay} до вычета налога")
    elif parsed.get("salaryText"):
        lines.append(f"Зарплата: {parsed['salaryText']} до вычета налога")
    if parsed.get("schedule"):
        lines.append(f"График: {parsed['schedule']}")
    if parsed.get("duty"):
        lines.append(f"Обязанности: {parsed['duty']}")
    if parsed.get("requirements"):
        lines.append(f"Требования: {parsed['requirements']}")
    if parsed.get("qualification"):
        lines.append(f"Квалификация: {parsed['qualification']}")
    if parsed.get("phone"):
        lines.append(f"Телефон: {parsed['phone']}")
    return "\n".join(lines)


def published_iso(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if "T" in text:
        try:
            stamp = datetime.fromisoformat(text.replace("Z", "+00:00"))
            return stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            pass
    try:
        day = datetime.strptime(text[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return day.isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def overlay_structured(record: dict[str, Any], parsed: dict[str, Any], *, city_slug: str, source_name: str) -> dict[str, Any]:
    """Поля, которые API дал структурой, не переизвлекаем из текста (Закон 16)."""
    record["source"] = "TRUDVSEM"
    record["sourceName"] = source_name
    record["sourceUrl"] = parsed["sourceUrl"]
    record["externalId"] = parsed["id"]
    record["sourcePostExternalId"] = parsed["id"]
    record["splitIndex"] = 0
    record["citySlug"] = city_slug
    record["salaryIsGross"] = parsed["salaryIsGross"]
    if parsed.get("employerName"):
        record["employerName"] = parsed["employerName"]
    if parsed.get("employerInn"):
        record["employerInn"] = parsed["employerInn"]
    if parsed.get("address"):
        record["address"] = parsed["address"]
    if parsed.get("salaryFrom") is not None or parsed.get("salaryTo") is not None:
        record["salaryFrom"] = parsed.get("salaryFrom")
        record["salaryTo"] = parsed.get("salaryTo")
        if parsed.get("salaryText"):
            record["salaryText"] = parsed["salaryText"]
    else:
        record.pop("salaryFrom", None)
        record.pop("salaryTo", None)
        record.pop("salaryText", None)
    if parsed.get("schedule") and not record.get("schedule"):
        record["schedule"] = parsed["schedule"]
    if parsed.get("employment"):
        record["employmentType"] = parsed["employment"]
    if parsed.get("experience"):
        record["experience"] = parsed["experience"]
    if parsed.get("phone"):
        record["contactPhone"] = parsed["phone"]
    if parsed.get("email"):
        record["contactEmail"] = parsed["email"]
    if parsed.get("hrAgency"):
        record["employerKind"] = "AGENCY"
    elif parsed.get("employerName"):
        record["employerKind"] = "DIRECT"
    iso = published_iso(parsed.get("publishedAt"))
    if iso:
        record["publishedAt"] = iso
    if parsed.get("jobName") and not record.get("titleOriginal"):
        record["titleOriginal"] = parsed["jobName"]
    return record


def process_trudvsem_item(
    parsed: dict[str, Any],
    *,
    city_slug: str,
    source_name: str,
    default_city: str,
) -> dict[str, Any]:
    text = assemble_pipeline_text(parsed)
    source = {
        "type": "TRUDVSEM",
        "source": "TRUDVSEM",
        "name": source_name,
        "url": parsed["sourceUrl"],
        "sourceUrl": parsed["sourceUrl"],
        "default_city": default_city,
        "externalId": parsed["id"],
    }
    run = run_process_post(text, source=source, images=None, split=False)
    records: list[dict[str, Any]] = []
    for record in run.records[:1]:
        overlay_structured(record, parsed, city_slug=city_slug, source_name=source_name)
        records.append(record)
    return {
        "sourceUrl": parsed["sourceUrl"],
        "externalId": parsed["id"],
        "sourceName": source_name,
        "records": records,
        "reject_reason": run.reject_reason,
        "vacancy_verdict": run.vacancy_verdict,
        "svo_verdict": run.svo_verdict,
        "filter_score": run.filter_score,
        "filter_reasons": list(run.filter_reasons),
        "text": text,
    }


def fetch_region_page(
    *,
    api_base: str,
    region_code: str,
    offset: int,
    limit: int,
    http_get: HttpGet | None = None,
) -> dict[str, Any]:
    url = urljoin(api_base.rstrip("/") + "/", f"region/{region_code}")
    getter = http_get or requests.get
    try:
        response = getter(
            url,
            params={"offset": offset, "limit": limit},
            headers={"User-Agent": user_agent(), "Accept": "application/json"},
            timeout=FETCH_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise TrudvsemApiError(f"Сеть: {exc}") from exc
    if response.status_code >= 500:
        raise TrudvsemApiError(f"HTTP {response.status_code} у источника", status=response.status_code)
    if response.status_code >= 400:
        raise TrudvsemApiError(f"HTTP {response.status_code} для {url}", status=response.status_code)
    try:
        payload = response.json()
    except ValueError as exc:
        raise TrudvsemApiError("Ответ API не JSON") from exc
    if not isinstance(payload, dict):
        raise TrudvsemApiError("Ответ API не объект")
    return payload


def page_vacancies(payload: dict[str, Any]) -> list[Any]:
    results = payload.get("results") if isinstance(payload.get("results"), dict) else {}
    rows = results.get("vacancies") if isinstance(results, dict) else None
    if isinstance(rows, list):
        return rows
    return []


def page_total(payload: dict[str, Any]) -> int:
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    return int(meta.get("total") or 0)


def print_trudvsem_record(record: dict[str, Any], index: int, total: int) -> None:
    print_record(record, index, total)
    print(f"  employer: {record.get('employerName') or '—'}  inn: {record.get('employerInn') or '—'}")
    gross = record.get("salaryIsGross")
    note = "до вычета налога" if gross is True else ("на руки" if gross is False else "—")
    print(f"  salaryIsGross: {gross} ({note})")


def write_summary(stats: dict[str, Any], path: Path | None = None) -> Path:
    target = path or (ensure_logs_dir() / "summary.md")
    lines = [
        "## Парсер «Работа России» (открытые данные ЦЗН)",
        "",
        f"- собрано записей API (регион): **{stats.get('fetched', 0)}**",
        f"- совпало с городом: **{stats.get('city_matched', 0)}**",
        f"- принято конвейером: **{stats.get('accepted', 0)}**",
        f"- спорных (maybe): **{stats.get('maybe', 0)}**",
        f"- отброшено: **{stats.get('rejected', 0)}** (из них СВО: **{stats.get('rejected_svo', 0)})**",
        f"- пропущено по городу: **{stats.get('skipped_city', 0)}**",
        f"- снято как исчезнувшие: **{stats.get('archived', 0)}**",
        f"- добавлено в базу: **{stats.get('added', 0)}**",
        f"- обновлено: **{stats.get('updated', 0)}**",
        f"- на модерации: **{stats.get('pending', 0)}**",
        f"- ошибок пачки: **{stats.get('errors', 0)}**",
        "",
    ]
    if stats.get("dry_run"):
        lines.append("_Режим --dry-run: на сайт ничего не отправляли._")
        lines.append("")
    if stats.get("note"):
        lines.append(str(stats["note"]))
        lines.append("")
    target.write_text("\n".join(lines), encoding="utf-8")
    return target


def print_summary(stats: dict[str, Any]) -> None:
    print()
    print("Итог парсера «Работа России»")
    print(f"  собрано (регион):            {stats.get('fetched', 0)}")
    print(f"  совпало с городом:           {stats.get('city_matched', 0)}")
    print(f"  принято (единиц):            {stats.get('accepted', 0)}")
    print(f"  спорных (maybe):             {stats.get('maybe', 0)}")
    print(f"  отброшено:                   {stats.get('rejected', 0)} (СВО: {stats.get('rejected_svo', 0)})")
    print(f"  пропущено по городу:         {stats.get('skipped_city', 0)}")
    print(f"  снято как исчезнувшие:       {stats.get('archived', 0)}")
    print(f"  добавлено в базу:            {stats.get('added', 0)}")
    print(f"  обновлено:                   {stats.get('updated', 0)}")
    print(f"  на модерации:                {stats.get('pending', 0)}")
    print(f"  ошибок пачки:                {stats.get('errors', 0)}")


def empty_stats(note: str, *, dry_run: bool) -> dict[str, Any]:
    stats = {
        "fetched": 0,
        "city_matched": 0,
        "accepted": 0,
        "maybe": 0,
        "rejected": 0,
        "rejected_svo": 0,
        "skipped_city": 0,
        "archived": 0,
        "added": 0,
        "updated": 0,
        "pending": 0,
        "errors": 0,
        "dry_run": dry_run,
        "note": note,
        "run_ok": False,
    }
    print(note)
    write_summary(stats)
    return stats


def post_archive(
    *,
    seen_ids: list[str],
    fetched_count: int,
    city_slugs: list[str],
    secret: str,
    http_post: HttpPost | None = None,
    sleep: Sleeper | None = None,
) -> dict[str, Any]:
    url = f"{site_url()}/api/parser/archive-missing"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Bearer {secret}",
        "User-Agent": user_agent(),
    }
    body = {
        "source": "TRUDVSEM",
        "seenExternalIds": seen_ids,
        "fetchedCount": fetched_count,
        "cityMatchCount": len(seen_ids),
        "citySlugs": city_slugs,
    }
    poster = http_post or requests.post
    sleeper = sleep or time.sleep
    last_error: Exception | None = None
    last_status: int | None = None
    last_text = ""
    for attempt in range(3):
        if attempt:
            sleeper(RETRY_PAUSES[attempt - 1])
        try:
            response = poster(url, headers=headers, json=body, timeout=90)
        except requests.RequestException as exc:
            last_error = exc
            continue
        last_status = response.status_code
        last_text = response.text[:500]
        if response.status_code == 200:
            try:
                data = response.json()
            except ValueError:
                raise SystemExit("archive-missing вернул 200, но это не JSON.") from None
            if not isinstance(data, dict):
                raise SystemExit("archive-missing вернул 200, но не объект.")
            return data
        if response.status_code in {401, 403}:
            raise SystemExit(f"Дверь archive-missing закрыта (HTTP {response.status_code}).")
        last_error = RuntimeError(f"HTTP {response.status_code}: {last_text}")
    detail = str(last_error) if last_error else last_text
    raise SystemExit(f"Не удалось снять исчезнувшие за 3 попытки (статус {last_status}). {detail}")


def run_parser(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    config: dict[str, Any] | None = None,
    http_get: HttpGet | None = None,
    http_post: HttpPost | None = None,
    sleep: Sleeper | None = None,
    rejected_path: Path | None = None,
) -> dict[str, Any]:
    if not source_trudvsem_enabled():
        return empty_stats(
            "SOURCE_TRUDVSEM_ENABLED=false — источник выключен, запросов к API не было.",
            dry_run=dry_run,
        )

    payload = config if config is not None else load_sources()
    defaults = payload.get("defaults") or {}
    source_name = str(defaults.get("sourceName") or "Работа России · ЦЗН")
    api_base = str(payload.get("apiBase") or "https://opendata.trudvsem.ru/api/v1/vacancies")
    page_limit = max(1, min(int(defaults.get("limit") or 100), 1000))
    max_records = max(1, min(int(defaults.get("maxRecords") or API_LIMIT_CAP), API_LIMIT_CAP))
    configured_pause = defaults.get("pauseSec")
    if limit is not None:
        # Короткая выборка: маленькая страница. С этой машины limit≥10 часто не доходит.
        page_limit = min(page_limit, FALLBACK_PAGE_LIMIT)
    regions = enabled_regions(payload)
    cities = enabled_cities(payload)
    if not regions:
        return empty_stats(
            "Пустой справочник региона: в sources_trudvsem.json нет enabled region_code. Ничего не снимаем.",
            dry_run=dry_run,
        )
    if not cities:
        return empty_stats(
            "Нет включённых городов в sources_trudvsem.json. Ничего не снимаем.",
            dry_run=dry_run,
        )

    sleeper = sleep or time.sleep
    log_path = rejected_path or rejected_log_path()
    active = set(active_cities())
    to_upload: list[dict[str, Any]] = []
    maybe_records: list[dict[str, Any]] = []
    seen_ids: list[str] = []
    fetched = 0
    skipped_city = 0
    rejected = 0
    rejected_svo = 0
    remaining = limit
    default_city = next((item["citySlug"] for item in cities if item["citySlug"] in active), "gorlovka")

    try:
        for region in regions:
            offset = 0
            total = None
            while offset < max_records and (remaining is None or remaining > 0):
                chunk_limit = min(page_limit, max_records - offset)
                try:
                    page = fetch_region_page(
                        api_base=api_base,
                        region_code=region["region_code"],
                        offset=offset,
                        limit=chunk_limit,
                        http_get=http_get,
                    )
                except TrudvsemApiError as exc:
                    if is_timeout_error(exc) and page_limit > FALLBACK_PAGE_LIMIT:
                        print(
                            f"Страница limit={chunk_limit} не дошла (таймаут). "
                            f"Дальше шаг {FALLBACK_PAGE_LIMIT}. Прокси не используем."
                        )
                        page_limit = FALLBACK_PAGE_LIMIT
                        continue
                    raise
                if total is None:
                    total = page_total(page)
                    if total == 0 and not page_vacancies(page):
                        raise TrudvsemApiError(
                            f"Пустой справочник/выдача региона {region['region_code']}. Ничего не снимаем.",
                            status=200,
                        )
                    print(
                        f"Регион {region['region_code']} ({region.get('region_name') or '—'}): "
                        f"в API {total} записей"
                    )
                rows = page_vacancies(page)
                if not rows:
                    break
                for item in rows:
                    fetched += 1
                    parsed = parse_api_vacancy(item)
                    if not parsed:
                        continue
                    city = match_city(parsed.get("location") or "", cities)
                    if city is None:
                        skipped_city += 1
                        write_rejected(
                            {
                                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                                "source": "TRUDVSEM",
                                "reason": "city_not_matched",
                                "externalId": parsed.get("id"),
                                "preview": preview_text(parsed.get("location") or parsed.get("jobName") or ""),
                            },
                            log_path,
                        )
                        continue
                    if city["citySlug"] not in active:
                        skipped_city += 1
                        write_rejected(
                            {
                                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                                "source": "TRUDVSEM",
                                "reason": "city_not_active",
                                "citySlug": city["citySlug"],
                                "externalId": parsed.get("id"),
                                "preview": preview_text(parsed.get("jobName") or ""),
                            },
                            log_path,
                        )
                        continue
                    seen_ids.append(parsed["id"])
                    if remaining is not None and remaining <= 0:
                        continue
                    result = process_trudvsem_item(
                        parsed,
                        city_slug=city["citySlug"],
                        source_name=source_name,
                        default_city=default_city,
                    )
                    if remaining is not None:
                        remaining -= 1
                    records = list(result["records"])
                    if not records:
                        reason = result.get("reject_reason") or "empty"
                        if reason in {"svo", "hidden_svo"}:
                            rejected_svo += 1
                        rejected += 1
                        write_rejected(
                            {
                                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                                "source": "TRUDVSEM",
                                "sourceUrl": result.get("sourceUrl"),
                                "externalId": result.get("externalId"),
                                "reason": reason,
                                "preview": preview_text(result.get("text") or ""),
                            },
                            log_path,
                        )
                        continue
                    kept: list[dict[str, Any]] = []
                    for record in records:
                        if record.get("vacancyVerdict") == "maybe":
                            maybe_records.append(record)
                        kept.append(record)
                    if dry_run:
                        total_kept = len(kept)
                        for index, record in enumerate(kept, start=1):
                            print_trudvsem_record(record, index, total_kept)
                    to_upload.extend(kept)
                offset += len(rows)
                if len(rows) < chunk_limit:
                    break
                if remaining is not None and remaining <= 0:
                    break
                sleeper(pause_sec(float(configured_pause) if configured_pause is not None else None))
    except TrudvsemApiError as exc:
        stats = empty_stats(f"{exc} Запуск с ошибкой — ничего не снимаем.", dry_run=dry_run)
        stats["fetched"] = fetched
        stats["skipped_city"] = skipped_city
        write_summary(stats)
        return stats

    stats: dict[str, Any] = {
        "fetched": fetched,
        "city_matched": len(seen_ids),
        "accepted": len(to_upload),
        "maybe": len(maybe_records),
        "rejected": rejected,
        "rejected_svo": rejected_svo,
        "skipped_city": skipped_city,
        "archived": 0,
        "added": 0,
        "updated": 0,
        "pending": 0,
        "errors": 0,
        "dry_run": dry_run,
        "run_ok": True,
        "seen_ids": list(seen_ids),
    }

    if dry_run:
        stats["note"] = "dry-run: пачку на сайт не отправляли, исчезнувшие не снимали."
        print_summary(stats)
        write_summary(stats)
        return stats

    if to_upload:
        secret = cron_secret()
        merged: list[dict[str, Any]] = []
        for chunk in chunked(to_upload):
            merged.append(
                post_batch_with_retry(
                    chunk,
                    secret=secret,
                    parser="parser_trudvsem",
                    http_post=http_post,
                    sleep=sleep,
                )
            )
        upload = merge_upload_stats(merged)
        stats["added"] = upload["added"]
        stats["updated"] = upload["updated"]
        stats["pending"] = upload["pending"]
        stats["errors"] = upload["errors"]
        stats["maybe"] = upload["maybe"] or stats["maybe"]
        stats["skipped_city"] += upload["skippedCity"]
        stats["rejected_svo"] += upload["discardedSvo"]
        for item in upload.get("skippedCityItems") or []:
            write_rejected(
                {
                    "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "source": "TRUDVSEM",
                    "reason": "city_not_active",
                    "externalId": item.get("externalId") if isinstance(item, dict) else None,
                    "preview": item.get("reason") if isinstance(item, dict) else str(item),
                },
                log_path,
            )
        for item in upload.get("errorItems") or []:
            write_rejected(
                {
                    "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "source": "TRUDVSEM",
                    "reason": "upload_error",
                    "externalId": item.get("externalId") if isinstance(item, dict) else None,
                    "preview": item.get("reason") if isinstance(item, dict) else str(item),
                },
                log_path,
            )
    else:
        stats["note"] = "Нечего отправлять: конвейер не принял ни одной единицы."

    if limit is not None:
        stats["note"] = (
            (stats.get("note") or "")
            + " --limit: полный снимок источника не собран, исчезнувшие не снимаем."
        ).strip()
        print_summary(stats)
        write_summary(stats)
        return stats

    try:
        archive = post_archive(
            seen_ids=seen_ids,
            fetched_count=fetched,
            city_slugs=[item["citySlug"] for item in cities if item["citySlug"] in active],
            secret=cron_secret(),
            http_post=http_post,
            sleep=sleep,
        )
        stats["archived"] = int(archive.get("archived") or archive.get("снято") or 0)
        if archive.get("skippedReason") or archive.get("причинаПропуска"):
            reason = archive.get("skippedReason") or archive.get("причинаПропуска")
            extra = f"Снятие пропущено: {reason}."
            stats["note"] = f"{stats.get('note') or ''} {extra}".strip()
    except SystemExit as exc:
        stats["note"] = f"{stats.get('note') or ''} Снятие не вызвалось: {exc}".strip()
        stats["run_ok"] = False

    print_summary(stats)
    write_summary(stats)
    return stats


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Парсер открытых данных «Работа России». HTML m-czn.ru не читает."
    )
    parser.add_argument("--dry-run", action="store_true", help="Ничего не отправлять на сайт.")
    parser.add_argument("--limit", type=int, default=None, help="Сколько городских вакансий обработать.")
    parser.add_argument(
        "--site-url",
        default=None,
        help="Куда слать пачку. Иначе SITE_URL из .env.local.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    limit = args.limit if args.limit is None or args.limit > 0 else None
    if args.site_url:
        os.environ["SITE_URL"] = str(args.site_url).rstrip("/")
    print(f"OCR_PROVIDER={os.environ.get('OCR_PROVIDER') or 'none'}  (для ЦЗН всегда none)")
    print(f"Режим: {'dry-run' if args.dry_run else 'отправка'}  SITE_URL={site_url() if not args.dry_run else '—'}")
    try:
        run_parser(dry_run=args.dry_run, limit=limit)
    except SystemExit as exc:
        write_summary(
            {
                "fetched": 0,
                "accepted": 0,
                "maybe": 0,
                "rejected": 0,
                "rejected_svo": 0,
                "skipped_city": 0,
                "archived": 0,
                "added": 0,
                "updated": 0,
                "pending": 0,
                "errors": 0,
                "dry_run": args.dry_run,
                "note": str(exc),
            }
        )
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
