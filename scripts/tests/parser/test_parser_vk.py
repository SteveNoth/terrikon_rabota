"""Парсер ВК: репосты, allowlist картинок, process_post, dry-run, токен не в репо."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from parser_vk import (
    SOURCES_PATH,
    VkApiError,
    VkClient,
    _clean_screen_name,
    _parse_owner_id,
    enabled_groups,
    extract_image_urls,
    extract_text,
    load_sources,
    original_post,
    owner_id_from_screen,
    post_batch_with_retry,
    process_vk_item,
    redact,
    run_parser,
    source_vk_enabled,
    wall_external_id,
    wall_url,
)

ROOT = Path(__file__).resolve().parents[3]
GROUP = {
    "enabled": True,
    "screen_name": "test_jobs",
    "owner_id": -123,
    "sourceName": "Работа тест",
    "default_city": "gorlovka",
    "count": 30,
}

SHEET_TEXT = (
    "Работа в Горловке. Жильё предоставляется. Тел. 071-321-45-67\n"
    "🔥 Сварщик, зп 80 000 руб\n"
    "🔥 Повар, зп 45 000 руб"
)

SALE_TEXT = "Продам холодильник, самовывоз, торг уместен. 071-111-22-33"
SVO_TEXT = "Набор на СВО. Служба по контракту, денежное довольствие 200 000 руб. Тел. 071-123-45-67."
JOB_TEXT = "Требуется сварщик на завод, оклад 45 000 руб, график 5/2. Тел. 071-123-45-67. Никитовка."


@pytest.fixture(autouse=True)
def _enable_vk_source(monkeypatch):
    monkeypatch.setenv("SOURCE_VK_ENABLED", "true")


def _post(text: str, *, post_id: int = 456, extras: dict | None = None) -> dict:
    item = {
        "id": post_id,
        "owner_id": -123,
        "date": 1756500000,
        "text": text,
        "attachments": [],
    }
    if extras:
        item.update(extras)
    return item


class FakeResponse:
    def __init__(self, payload: dict, status: int = 200) -> None:
        self._payload = payload
        self.status_code = status
        self.text = json.dumps(payload)

    def json(self) -> dict:
        return self._payload


def test_wall_url_and_external_id():
    assert wall_url(-123, 456) == "https://vk.com/wall-123_456"
    assert wall_external_id(-123, 456) == "-123_456"
    assert wall_url(795897198, 6864) == "https://vk.com/wall795897198_6864"
    assert wall_external_id(795897198, 6864) == "795897198_6864"


def test_parse_owner_id_keeps_sign():
    assert _parse_owner_id(-136489529) == -136489529
    assert _parse_owner_id(795897198) == 795897198
    assert _parse_owner_id("795897198") == 795897198
    assert _parse_owner_id(0) is None
    assert _parse_owner_id("") is None


def test_owner_id_from_screen():
    assert owner_id_from_screen("id795897198") == 795897198
    assert owner_id_from_screen("club218218419") == -218218419
    assert owner_id_from_screen("public123") == -123
    assert owner_id_from_screen("rabotadpr") is None
    assert owner_id_from_screen("ideas") is None


def test_clean_screen_name_user_and_mobile_url():
    assert _clean_screen_name("https://vk.ru/id795897198") == "id795897198"
    assert _clean_screen_name("https://m.vk.ru/id795897198") == "id795897198"
    assert _clean_screen_name("https://vk.com/rabotadpr") == "rabotadpr"


def test_user_wall_stays_positive_in_enabled_groups():
    groups = enabled_groups(
        {
            "defaults": {"count": 30, "default_city": "gorlovka"},
            "groups": [
                {
                    "enabled": True,
                    "screen_name": "id795897198",
                    "owner_id": 795897198,
                    "sourceName": "Иван Приходько",
                    "default_city": "gorlovka",
                    "count": 30,
                }
            ],
        }
    )
    assert len(groups) == 1
    assert groups[0]["owner_id"] == 795897198
    assert groups[0]["screen_name"] == "id795897198"


def test_resolve_owner_id_user_screen_does_not_call_groups_api():
    class Probe(VkClient):
        def call(self, method, params):
            raise AssertionError(f"нельзя звать {method} для id-экрана")

    client = Probe("token")
    assert client.resolve_owner_id({"screen_name": "id795897198"}) == 795897198
    assert client.resolve_owner_id({"owner_id": 795897198, "screen_name": "id795897198"}) == 795897198


def test_repost_text_from_original():
    post = _post(
        "Смотрите вакансию",
        extras={
            "copy_history": [
                {"text": "репост посредника", "attachments": []},
                {"text": JOB_TEXT, "attachments": []},
            ]
        },
    )
    assert original_post(post)["text"] == JOB_TEXT
    text = extract_text(post)
    assert JOB_TEXT in text
    assert text.startswith(JOB_TEXT)


def test_images_allowlist_keeps_vk_drops_foreign():
    post = _post(
        "",
        extras={
            "attachments": [
                {
                    "type": "photo",
                    "photo": {
                        "sizes": [
                            {"type": "s", "width": 75, "height": 75, "url": "https://sun9-1.userapi.com/small.jpg"},
                            {"type": "z", "width": 800, "height": 600, "url": "https://sun9-1.userapi.com/big.jpg"},
                        ]
                    },
                },
                {
                    "type": "photo",
                    "photo": {
                        "sizes": [{"type": "x", "width": 200, "url": "https://evil.example.com/steal.jpg"}]
                    },
                },
            ]
        },
    )
    urls = extract_image_urls(post)
    assert urls == ["https://sun9-1.userapi.com/big.jpg"]


def test_images_from_nested_repost():
    post = _post(
        "",
        extras={
            "copy_history": [
                {
                    "text": JOB_TEXT,
                    "attachments": [
                        {
                            "type": "photo",
                            "photo": {
                                "sizes": [
                                    {"width": 100, "url": "https://vk.com/images/job.jpg"},
                                ]
                            },
                        }
                    ],
                }
            ]
        },
    )
    assert extract_image_urls(post) == ["https://vk.com/images/job.jpg"]


def test_sources_have_gorlovka_default_and_no_placeholder():
    data = load_sources()
    groups = enabled_groups(data)
    assert groups
    assert all(item["default_city"] == "gorlovka" for item in groups)
    assert all(item.get("screen_name") != "example_replace_me" for item in groups)
    raw = data.get("groups") or []
    assert raw
    assert all(item.get("default_city") == "gorlovka" for item in raw if isinstance(item, dict))
    prikhodko = next(item for item in groups if item.get("screen_name") == "id795897198")
    assert prikhodko["owner_id"] == 795897198
    assert prikhodko["owner_id"] > 0


def test_two_jobs_one_post_suffix_and_same_origin():
    result = process_vk_item(_post(SHEET_TEXT, post_id=777), GROUP, -123)
    records = result["records"]
    assert len(records) == 2
    assert records[0]["externalId"] == "-123_777"
    assert records[1]["externalId"] == "-123_777#2"
    assert records[0]["sourcePostExternalId"] == records[1]["sourcePostExternalId"] == "-123_777"
    assert records[0]["sourceUrl"] == records[1]["sourceUrl"] == "https://vk.com/wall-123_777"
    assert records[0]["rawText"] == records[1]["rawText"] == SHEET_TEXT
    assert records[0].get("completeness") is not None
    assert records[0].get("title")
    slugs = {item.get("professionSlug") for item in records}
    assert "svarshchik" in slugs
    assert "povar" in slugs


def test_garbage_goes_to_reject_not_records():
    result = process_vk_item(_post(SALE_TEXT), GROUP, -123)
    assert result["records"] == []
    assert result["reject_reason"] == "filter"


def test_svo_reject_reason():
    result = process_vk_item(_post(SVO_TEXT), GROUP, -123)
    assert result["records"] == []
    assert result["reject_reason"] == "svo"


def test_empty_caption_passes_image_urls(monkeypatch):
    captured: dict = {}

    def fake_run(text, source=None, images=None, **kwargs):
        captured["text"] = text
        captured["images"] = images
        from process import ProcessRun

        return ProcessRun(records=[], reject_reason="filter")

    monkeypatch.setattr("parser_vk.run_process_post", fake_run)
    post = _post(
        "",
        extras={
            "attachments": [
                {
                    "type": "photo",
                    "photo": {"sizes": [{"width": 400, "url": "https://userapi.com/vacancy.jpg"}]},
                }
            ]
        },
    )
    process_vk_item(post, GROUP, -123)
    assert captured["text"] == ""
    assert captured["images"] == ["https://userapi.com/vacancy.jpg"]


def test_redact_hides_token():
    assert "secret-token" not in redact("token=secret-token", "secret-token")
    assert "[redacted]" in redact("token=secret-token", "secret-token")


def test_source_switch(monkeypatch):
    monkeypatch.setenv("SOURCE_VK_ENABLED", "false")
    assert source_vk_enabled() is False
    stats = run_parser(dry_run=True, groups=[{**GROUP, "enabled": True}])
    assert stats["fetched"] == 0
    assert "SOURCE_VK_ENABLED" in (stats.get("note") or "")


def test_dry_run_does_not_upload(monkeypatch, tmp_path):
    posts = [_post(JOB_TEXT, post_id=10)]
    calls = {"upload": 0, "vk": 0}

    class StubClient:
        def resolve_owner_id(self, group):
            return -123

        def wall_get(self, owner_id, count, domain=None):
            calls["vk"] += 1
            return posts[:count]

    def boom(*args, **kwargs):
        calls["upload"] += 1
        raise AssertionError("dry-run не должен вызывать upload")

    monkeypatch.setattr("parser_vk.post_batch_with_retry", boom)
    stats = run_parser(
        dry_run=True,
        limit=5,
        client=StubClient(),
        groups=[GROUP],
        rejected_path=tmp_path / "rejected.jsonl",
    )
    assert calls["vk"] == 1
    assert calls["upload"] == 0
    assert stats["dry_run"] is True
    assert stats["accepted"] >= 1
    assert stats["added"] == 0


def test_limit_five_posts():
    posts = [_post(JOB_TEXT, post_id=i) for i in range(1, 12)]

    class StubClient:
        def resolve_owner_id(self, group):
            return -123

        def wall_get(self, owner_id, count, domain=None):
            assert count == 5
            return posts[:count]

    stats = run_parser(dry_run=True, limit=5, client=StubClient(), groups=[GROUP])
    assert stats["fetched"] == 5


def test_since_hours_keeps_only_fresh_posts():
    now = int(time.time())
    posts = [
        _post(JOB_TEXT, post_id=1, extras={"date": now - 60}),
        _post(SALE_TEXT, post_id=2, extras={"date": now - 7200}),
    ]

    class StubClient:
        def resolve_owner_id(self, group):
            return -123

        def wall_get(self, owner_id, count, domain=None):
            assert count == 100
            return posts

    stats = run_parser(dry_run=True, since_hours=1, client=StubClient(), groups=[GROUP])
    assert stats["fetched"] == 1
    assert stats["skipped_old"] == 1


def test_upload_retries_then_clear_error():
    attempts = {"n": 0}

    def flaky(url, headers=None, json=None, timeout=None):
        attempts["n"] += 1
        return FakeResponse({"error": "upstream"}, status=502)

    with pytest.raises(SystemExit, match="3 попытки"):
        post_batch_with_retry(
            [{"rawText": "x", "externalId": "1", "title": "Сварщик", "source": "VK"}],
            secret="a" * 32,
            http_post=flaky,
            sleep=lambda _seconds: None,
        )
    assert attempts["n"] == 3


def test_upload_401_does_not_retry():
    attempts = {"n": 0}

    def denied(url, headers=None, json=None, timeout=None):
        attempts["n"] += 1
        return FakeResponse({"error": "Unauthorized"}, status=401)

    with pytest.raises(SystemExit, match="CRON_SECRET"):
        post_batch_with_retry(
            [{"rawText": "x", "externalId": "1", "title": "Сварщик", "source": "VK"}],
            secret="b" * 32,
            http_post=denied,
            sleep=lambda _seconds: None,
        )
    assert attempts["n"] == 1


def test_vk_client_sends_token_in_body_not_url():
    seen = {}

    def capture(url, data=None, headers=None, timeout=None):
        seen["url"] = url
        seen["data"] = dict(data)
        return FakeResponse({"response": {"items": []}})

    client = VkClient("not-a-real-token", gap_sec=0, http_post=capture, sleep=lambda _s: None)
    client.wall_get(-1, 5)
    assert "not-a-real-token" not in seen["url"]
    assert seen["data"]["access_token"] == "not-a-real-token"
    assert seen["data"]["v"]
    assert seen["data"]["filter"] == "owner"


def test_vk_closed_wall_is_not_bypassed():
    def forbidden(url, data=None, headers=None, timeout=None):
        return FakeResponse({"error": {"error_code": 15, "error_msg": "Access denied"}})

    client = VkClient("token", gap_sec=0, http_post=forbidden, sleep=lambda _s: None)
    with pytest.raises(VkApiError) as caught:
        client.wall_get(-999, 10)
    assert caught.value.code == 15


def test_parser_has_no_own_cleanup_rules():
    source = (ROOT / "scripts" / "parser_vk.py").read_text(encoding="utf-8")
    assert "from process import run_process_post" in source
    assert "def clean_title" not in source
    assert "def strip_junk" not in source
    assert "def is_vacancy" not in source


def test_no_vk_token_value_in_repo():
    skip_dirs = {".git", ".venv", "node_modules", ".next", "__pycache__", "logs"}
    skip_suffix = {".pyc", ".png", ".jpg", ".jpeg", ".webp", ".gif"}
    hits: list[str] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in skip_dirs for part in path.parts):
            continue
        if path.name.startswith(".env") and path.name != ".env.example":
            continue
        if path.suffix.lower() in skip_suffix:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("VK_TOKEN="):
                value = stripped.split("=", 1)[1].strip().strip("'\"")
                if value:
                    hits.append(f"{path}:{line_no}")
            if "vk1." in line.lower() and "example" not in line.lower():
                hits.append(f"{path}:{line_no}:vk1")
    assert hits == [], hits
    example = (ROOT / ".env.example").read_text(encoding="utf-8")
    assert "VK_TOKEN=" in example


def test_workflow_has_cron_tesseract_and_secrets():
    text = (ROOT / ".github" / "workflows" / "parser-vk.yml").read_text(encoding="utf-8")
    assert "cron: \"0 */3 * * *\"" in text or "cron: '0 */3 * * *'" in text
    assert "cron: \"10 5 * * *\"" in text or "cron: '10 5 * * *'" in text
    assert "concurrency:" in text
    assert "workflow_dispatch" in text
    assert "tesseract-ocr-rus" in text
    assert "OCR_PROVIDER: tesseract" in text
    assert "secrets.VK_TOKEN" in text
    assert "secrets.CRON_SECRET" in text
    assert "secrets.SITE_URL" in text
    assert "upload-artifact" in text
    assert "cache: pip" in text


def test_sources_path_is_scripts():
    assert SOURCES_PATH.name == "sources_vk.json"
    assert SOURCES_PATH.parent.name == "scripts"
