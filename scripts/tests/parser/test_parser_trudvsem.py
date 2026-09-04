"""Парсер «Работы России»: JSON API, не HTML m-czn / trudvsem.ru."""

from __future__ import annotations

import inspect
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests

from employer_dedupe import (
    cluster_by_employer,
    ids_missing_two_runs,
    pending_name_matches,
    suspiciously_small,
)
from parser_trudvsem import (
    COMPLETE_PARSER,
    SOURCES_PATH,
    TrudvsemApiError,
    build_arg_parser,
    canonical_source_url,
    enabled_cities,
    enabled_regions,
    fetch_region_page,
    load_sources,
    match_city,
    overlay_structured,
    parse_api_vacancy,
    process_trudvsem_item,
    run_parser,
    source_trudvsem_enabled,
)

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "scripts" / "tests" / "fixtures" / "trudvsem" / "page.json"


@pytest.fixture(autouse=True)
def _enable_trudvsem(monkeypatch):
    monkeypatch.setenv("SOURCE_TRUDVSEM_ENABLED", "true")
    monkeypatch.setenv("TRUDVSEM_PAUSE_SEC", "1")
    monkeypatch.setenv("OCR_PROVIDER", "none")


def fixture_page() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class FakeResponse:
    def __init__(self, payload: dict | str, status: int = 200) -> None:
        self._payload = payload
        self.status_code = status
        self.text = payload if isinstance(payload, str) else json.dumps(payload)
        self.url = "https://opendata.trudvsem.ru/api/v1/vacancies/region/9300000000000"

    def json(self) -> dict:
        if isinstance(self._payload, str):
            raise ValueError("not json")
        return self._payload


def test_region_code_from_api_dictionary_not_guessed():
    data = load_sources()
    regions = enabled_regions(data)
    assert len(regions) == 1
    assert regions[0]["region_code"] == "9300000000000"
    assert "opendata.trudvsem.ru" in regions[0]["codeSourceUrl"]
    raw = data["regions"][0]
    assert "9300000000000" in raw["regionEndpointChecked"]
    assert raw["codeSourceField"] == "results.vacancies[].vacancy.region.region_code"
    cities = enabled_cities(data)
    assert len(cities) == 1
    assert cities[0]["citySlug"] == "gorlovka"
    assert "Горловка" in cities[0]["aliases"]


def test_only_gorlovka_enabled_in_config():
    data = load_sources()
    slugs = [item["citySlug"] for item in data["cities"] if item.get("enabled", True)]
    assert slugs == ["gorlovka"]


def test_parse_maps_structured_fields_and_stable_id():
    page = fixture_page()
    first = parse_api_vacancy(page["results"]["vacancies"][0])
    assert first is not None
    assert first["id"] == "tv-gor-weld-001"
    assert first["jobName"] == "Сварщик"
    assert first["employerName"] == "ООО Горловский механический завод"
    assert first["employerInn"] == "9303012345"
    assert first["salaryFrom"] == 45000
    assert first["salaryTo"] == 55000
    assert first["salaryIsGross"] is True
    assert first["sourceUrl"].startswith("https://trudvsem.ru/")
    assert "m-czn.ru" not in first["sourceUrl"]
    again = parse_api_vacancy(page["results"]["vacancies"][0])
    assert again is not None
    assert again["id"] == first["id"]


def test_index_in_address_is_not_salary():
    page = fixture_page()
    parsed = parse_api_vacancy(page["results"]["vacancies"][4])
    assert parsed is not None
    assert "284627" in parsed["location"]
    assert parsed["salaryFrom"] is None
    assert parsed["salaryTo"] is None


def test_match_city_skips_foreign_and_keeps_aliases():
    cities = enabled_cities()
    assert match_city("г. Горловка, ул. Ленина, 10", cities)["citySlug"] == "gorlovka"
    assert match_city("Горловка", cities)["citySlug"] == "gorlovka"
    assert match_city("город Горловка", cities)["citySlug"] == "gorlovka"
    assert match_city("г. Донецк, ул. Артёма, 1", cities) is None
    assert match_city("Донецкая Народная Республика", cities) is None


def test_canonical_url_rejects_mczn():
    url = canonical_source_url(
        {"vac_url": "https://m-czn.ru/vacancy/x"},
        "comp-1",
        "vac-1",
    )
    assert url == "https://trudvsem.ru/vacancy/card/comp-1/vac-1"


def test_process_overlays_json_not_html():
    page = fixture_page()
    parsed = parse_api_vacancy(page["results"]["vacancies"][0])
    assert parsed is not None
    result = process_trudvsem_item(
        parsed,
        city_slug="gorlovka",
        source_name="Работа России · ЦЗН",
        default_city="gorlovka",
    )
    assert result["records"]
    record = result["records"][0]
    assert record["source"] == "TRUDVSEM"
    assert record["externalId"] == "tv-gor-weld-001"
    assert record["salaryIsGross"] is True
    assert record["employerInn"] == "9303012345"
    assert record["employerName"]
    assert record["salaryFrom"] == 45000
    assert "m-czn.ru" not in (record.get("sourceUrl") or "")
    assert "trudvsem.ru" in (record.get("sourceUrl") or "")


def test_long_duty_is_split_under_upload_limit():
    duty = ("Выполнение работ по обслуживанию тепловых сетей и насосных станций. " * 20).strip()
    assert len(duty) > 500
    parsed = {
        "id": "tv-long-duty-001",
        "jobName": "Слесарь",
        "employerName": "МУП Теплосеть",
        "employerInn": "9303011111",
        "sourceUrl": "https://trudvsem.ru/vacancy/card/a/tv-long-duty-001",
        "salaryIsGross": True,
        "salaryFrom": 40000,
        "salaryTo": 40000,
        "salaryText": "40000",
        "address": "г. Горловка, ул. Ленина, 1",
        "location": "г. Горловка",
        "duty": duty,
        "requirements": "",
        "qualification": "",
        "schedule": "5/2",
        "employment": "FULL",
        "experience": "FROM_1_TO_3",
        "phone": "0710000000",
        "email": None,
        "hrAgency": False,
        "publishedAt": "2026-08-01T10:00:00+03:00",
    }
    result = process_trudvsem_item(
        parsed,
        city_slug="gorlovka",
        source_name="Работа России · ЦЗН",
        default_city="gorlovka",
    )
    assert result["records"]
    record = result["records"][0]
    sections = record.get("descriptionSections") or {}
    for key in ("tasks", "requirements", "conditions"):
        for item in sections.get(key) or []:
            assert len(item) <= 500, (key, len(item), item[:80])
    joined = " ".join(sections.get("tasks") or []) + " " + (record.get("description") or "")
    assert "Выполнение работ по обслуживанию" in joined
    assert len(record.get("address") or "") <= 200


def test_overlay_drops_salary_extracted_from_index():
    parsed = {
        "id": "x",
        "sourceUrl": "https://trudvsem.ru/vacancy/card/a/x",
        "salaryIsGross": True,
        "salaryFrom": None,
        "salaryTo": None,
        "employerName": "Завод",
        "address": "г. Горловка, индекс 284627",
    }
    record = overlay_structured(
        {"title": "Слесарь", "salaryFrom": 284627, "salaryTo": 284627, "salaryText": "284627"},
        parsed,
        city_slug="gorlovka",
        source_name="Работа России · ЦЗН",
    )
    assert "salaryFrom" not in record
    assert "salaryTo" not in record
    assert "salaryText" not in record


def test_dry_run_skips_foreign_city_and_does_not_upload(tmp_path):
    page = fixture_page()
    posted: list[object] = []

    def http_get(url, **kwargs):
        assert "opendata.trudvsem.ru" in url
        assert "m-czn.ru" not in url
        assert "/region/9300000000000" in url
        return FakeResponse(page)

    def http_post(url, **kwargs):
        posted.append(url)
        raise AssertionError("dry-run не должен ходить на upload")

    stats = run_parser(
        dry_run=True,
        http_get=http_get,
        http_post=http_post,
        sleep=lambda _s: None,
        rejected_path=tmp_path / "rejected.jsonl",
    )
    assert stats["fetched"] == 5
    assert stats["skipped_city"] == 1
    assert stats["city_matched"] == 4
    assert stats["accepted"] >= 3
    assert stats["dry_run"] is True
    assert stats["archived"] == 0
    assert posted == []
    ids = stats["seen_ids"]
    assert "tv-gor-weld-001" in ids
    assert "tv-donetsk-skip-004" not in ids
    assert ids.count("tv-gor-weld-001") == 1


def test_second_run_same_external_ids():
    page = fixture_page()

    def http_get(url, **kwargs):
        return FakeResponse(page)

    first = run_parser(dry_run=True, http_get=http_get, sleep=lambda _s: None)
    second = run_parser(dry_run=True, http_get=http_get, sleep=lambda _s: None)
    assert first["seen_ids"] == second["seen_ids"]
    assert len(first["seen_ids"]) == len(set(first["seen_ids"]))


def test_limit_does_not_archive(tmp_path, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "a" * 32)
    monkeypatch.setenv("SITE_URL", "http://127.0.0.1:3999")
    page = fixture_page()
    posted: list[str] = []

    def http_get(url, **kwargs):
        return FakeResponse(page)

    def http_post(url, **kwargs):
        posted.append(url)
        return FakeResponse({"added": 1, "updated": 0, "pending": 0, "errors": 0, "maybe": 0, "skippedCity": 0, "discardedSvo": 0})

    stats = run_parser(
        dry_run=False,
        limit=2,
        http_get=http_get,
        http_post=http_post,
        sleep=lambda _s: None,
        rejected_path=tmp_path / "rejected.jsonl",
    )
    assert any("/api/parser/upload" in url for url in posted)
    assert not any("archive-missing" in url for url in posted)
    assert "limit" in (stats.get("note") or "").lower() or "--limit" in (stats.get("note") or "")


def test_timeout_at_fallback_size_retries_then_succeeds():
    page = fixture_page()
    hits = {"n": 0}

    def http_get(url, **kwargs):
        hits["n"] += 1
        if hits["n"] == 1:
            raise requests.Timeout("Read timed out.")
        return FakeResponse(page)

    stats = run_parser(dry_run=True, limit=3, http_get=http_get, sleep=lambda _s: None)
    assert hits["n"] >= 2
    assert stats["run_ok"] is True
    assert stats["fetched"] >= 1


def test_timeout_falls_back_to_small_page():
    page = fixture_page()
    limits: list[int] = []

    def http_get(url, **kwargs):
        params = kwargs.get("params") or {}
        limits.append(int(params.get("limit") or 0))
        if limits[-1] > 5:
            raise requests.Timeout("Read timed out.")
        if int(params.get("offset") or 0) > 0:
            return FakeResponse({"meta": {"total": 5}, "results": {"vacancies": []}})
        return FakeResponse(page)

    stats = run_parser(dry_run=True, http_get=http_get, sleep=lambda _s: None)
    assert any(item > 5 for item in limits)
    assert 5 in limits
    assert stats["run_ok"] is True
    assert stats["fetched"] == 5


def test_timeout_after_full_page_uploads_partial(tmp_path, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "a" * 32)
    monkeypatch.setenv("SITE_URL", "http://127.0.0.1:3999")
    page = fixture_page()
    payload = load_sources()
    payload["defaults"]["limit"] = 5
    posted: list[str] = []
    hits = {"n": 0}

    def http_get(url, **kwargs):
        hits["n"] += 1
        if hits["n"] > 1:
            raise requests.Timeout("Read timed out.")
        return FakeResponse(page)

    def http_post(url, **kwargs):
        posted.append(url)
        return FakeResponse(
            {
                "added": 1,
                "updated": 0,
                "pending": 0,
                "errors": 0,
                "maybe": 0,
                "skippedCity": 0,
                "discardedSvo": 0,
            }
        )

    stats = run_parser(
        dry_run=False,
        config=payload,
        http_get=http_get,
        http_post=http_post,
        sleep=lambda _s: None,
        rejected_path=tmp_path / "rejected.jsonl",
    )
    assert stats["fetched"] >= 1
    assert stats["run_ok"] is False
    assert any("/api/parser/upload" in url for url in posted)
    assert not any("archive-missing" in url for url in posted)
    assert "неполный" in (stats.get("note") or "").lower()


def test_http_5xx_does_not_archive():
    posted: list[str] = []

    def http_get(url, **kwargs):
        return FakeResponse({"error": "boom"}, status=503)

    def http_post(url, **kwargs):
        posted.append(url)
        raise AssertionError("при 5xx нельзя снимать вакансии")

    stats = run_parser(dry_run=False, http_get=http_get, http_post=http_post, sleep=lambda _s: None)
    assert stats["run_ok"] is False
    assert stats["archived"] == 0
    assert posted == []
    assert "ничего не снимаем" in (stats.get("note") or "").lower()


def test_disabled_makes_no_requests():
    calls: list[str] = []

    def http_get(url, **kwargs):
        calls.append(url)
        raise AssertionError("выключатель должен остановить запросы")

    import parser_trudvsem as mod

    orig = mod.source_trudvsem_enabled
    try:
        mod.source_trudvsem_enabled = lambda: False
        stats = run_parser(dry_run=True, http_get=http_get, sleep=lambda _s: None)
    finally:
        mod.source_trudvsem_enabled = orig
    assert stats["fetched"] == 0
    assert calls == []
    assert "выключен" in (stats.get("note") or "").lower()


def test_source_switch_env(monkeypatch):
    monkeypatch.setenv("SOURCE_TRUDVSEM_ENABLED", "false")
    assert source_trudvsem_enabled() is False
    monkeypatch.setenv("SOURCE_TRUDVSEM_ENABLED", "true")
    assert source_trudvsem_enabled() is True


def test_no_needs_js_and_no_html_imports():
    flags = [flag for action in build_arg_parser()._actions for flag in action.option_strings]
    assert "--needs-js" not in flags
    source = inspect.getsource(run_parser)
    assert "m-czn.ru" not in source
    assert "BeautifulSoup" not in inspect.getsource(__import__("parser_trudvsem"))
    text = Path(inspect.getfile(__import__("parser_trudvsem"))).read_text(encoding="utf-8")
    assert "playwright" not in text.casefold()
    assert "from bs4" not in text
    assert COMPLETE_PARSER == "parser_trudvsem_complete"


def test_fetch_uses_user_agent_and_region_path():
    seen: dict[str, object] = {}

    def http_get(url, **kwargs):
        seen["url"] = url
        seen["headers"] = kwargs.get("headers")
        seen["params"] = kwargs.get("params")
        return FakeResponse({"meta": {"total": 1}, "results": {"vacancies": []}})

    payload = fetch_region_page(
        api_base="https://opendata.trudvsem.ru/api/v1/vacancies",
        region_code="9300000000000",
        offset=0,
        limit=10,
        http_get=http_get,
    )
    assert payload["meta"]["total"] == 1
    assert seen["url"].endswith("/vacancies/region/9300000000000")
    headers = seen["headers"]
    assert isinstance(headers, dict)
    assert "TerriconRabota" in headers["User-Agent"]
    assert headers["Accept"] == "application/json"


def test_inn_groups_czn_and_vk_texts_need_not_match():
    rows = [
        {
            "id": "czn-1",
            "source": "TRUDVSEM",
            "employerInn": "9303012345",
            "professionSlug": "svarshchik",
            "citySlug": "gorlovka",
            "workFormat": "LOCAL",
            "completeness": 80,
            "firstSeenAt": datetime.now(timezone.utc),
        },
        {
            "id": "vk-1",
            "source": "VK",
            "employerInn": "9303012345",
            "professionSlug": "svarshchik",
            "citySlug": "gorlovka",
            "workFormat": "LOCAL",
            "completeness": 40,
            "firstSeenAt": datetime.now(timezone.utc),
        },
        {
            "id": "other",
            "source": "VK",
            "employerInn": "7707123456",
            "professionSlug": "svarshchik",
            "citySlug": "gorlovka",
            "workFormat": "LOCAL",
            "completeness": 50,
            "firstSeenAt": datetime.now(timezone.utc),
        },
    ]
    clusters = cluster_by_employer(rows)
    assert clusters == [[0, 1]]


def test_same_name_without_inn_is_pending_not_cluster():
    rows = [
        {
            "employerInn": None,
            "employerName": "Магнит",
            "professionSlug": "prodavets",
            "citySlug": "gorlovka",
            "workFormat": "LOCAL",
        },
        {
            "employerInn": None,
            "employerName": "ООО Магнит",
            "professionSlug": "prodavets",
            "citySlug": "gorlovka",
            "workFormat": "LOCAL",
        },
    ]
    assert cluster_by_employer(rows) == []
    pending = pending_name_matches(rows)
    assert len(pending) == 1
    assert pending[0]["reason"] == "same_employer_name_no_inn"


def test_two_successful_misses_archive_network_does_not():
    now = datetime.now(timezone.utc)
    previous = now - timedelta(hours=20)
    last_seen = {
        "keep": now,
        "gone": previous - timedelta(hours=5),
    }
    missing = ids_missing_two_runs(
        known_ids={"keep", "gone"},
        seen_ids={"keep"},
        last_seen=last_seen,
        previous_run_started=previous,
    )
    assert missing == ["gone"]
    assert ids_missing_two_runs(
        known_ids={"keep", "gone"},
        seen_ids={"keep"},
        last_seen=last_seen,
        previous_run_started=None,
    ) == []
    assert suspiciously_small(3000, 7951) is True
    assert suspiciously_small(5000, 7951) is False
    assert suspiciously_small(10, None) is False


def test_sources_json_has_no_html_hosts():
    text = SOURCES_PATH.read_text(encoding="utf-8")
    assert "m-czn.ru" not in text
    assert "opendata.trudvsem.ru" in text
    data = load_sources()
    assert data["defaults"]["sourceName"] == "Работа России · ЦЗН"


def test_workflow_daily_no_tesseract_no_chromium():
    text = (ROOT / ".github" / "workflows" / "parser-trudvsem.yml").read_text(encoding="utf-8")
    assert "cron: \"0 6 * * *\"" in text or "cron: '0 6 * * *'" in text
    assert "workflow_dispatch" in text
    assert "parser_trudvsem.py" in text
    assert "OCR_PROVIDER: none" in text
    assert "secrets.CRON_SECRET" in text
    assert "secrets.SITE_URL" in text
    assert "tesseract-ocr" not in text.casefold()
    assert "playwright" not in text.casefold()
    assert "chromium" not in text.casefold()
    assert "upload-artifact" in text


def test_fetch_5xx_raises_api_error():
    with pytest.raises(TrudvsemApiError, match="503"):
        fetch_region_page(
            api_base="https://opendata.trudvsem.ru/api/v1/vacancies",
            region_code="9300000000000",
            offset=0,
            limit=1,
            http_get=lambda url, **kwargs: FakeResponse("nope", status=503),
        )
