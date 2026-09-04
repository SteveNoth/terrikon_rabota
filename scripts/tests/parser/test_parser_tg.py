"""Парсер Telegram: альбомы, process_post, FloodWait, сессия не в репо."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from parser_tg import (
    SOURCES_PATH,
    ChannelReader,
    TgFloodWait,
    attachment_url,
    call_with_flood_wait,
    clean_username,
    enabled_channels,
    flood_seconds,
    load_sources,
    merge_albums,
    message_external_id,
    message_url,
    process_tg_post,
    redact,
    run_parser,
    source_tg_enabled,
)

ROOT = Path(__file__).resolve().parents[3]
CHANNEL = {
    "enabled": True,
    "username": "gorlovka_jobs",
    "sourceName": "Работа Горловка тест",
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
JOB_TEXT_GUARD = "Требуется охранник на завод, оклад 35 000 руб, график 5/2. Тел. 071-765-43-21. Горловка."


@pytest.fixture(autouse=True)
def _enable_tg_source(monkeypatch):
    monkeypatch.setenv("SOURCE_TG_ENABLED", "true")


def _msg(
    text: str,
    *,
    msg_id: int = 10,
    grouped_id: int | None = None,
    extras: dict | None = None,
) -> dict:
    item = {
        "id": msg_id,
        "grouped_id": grouped_id,
        "text": text,
        "images": [],
        "date": 1756500000,
        "username": CHANNEL["username"],
    }
    if extras:
        item.update(extras)
    return item


class StubReader(ChannelReader):
    def __init__(self, posts: list[dict], *, flood_first: int | None = None) -> None:
        self.posts = posts
        self.calls = 0
        self.flood_first = flood_first
        self.media: dict[str, bytes] = {}

    def messages(self, username: str, limit: int) -> list[dict]:
        self.calls += 1
        if self.flood_first is not None and self.calls == 1:
            raise TgFloodWait(self.flood_first)
        return [dict(item) for item in self.posts[:limit]]

    def fetch_image(self, url: str) -> bytes:
        if url in self.media:
            return self.media[url]
        raise FileNotFoundError(url)


def test_message_url_and_external_id():
    assert message_url("gorlovka_jobs", 123) == "https://t.me/gorlovka_jobs/123"
    assert message_external_id("gorlovka_jobs", 123) == "gorlovka_jobs/123"
    assert attachment_url("gorlovka_jobs", 123, 0).startswith("https://cdn4.telegram-cdn.org/")


def test_clean_username_strips_links_and_at():
    assert clean_username("@WorkGorlovka") == "WorkGorlovka"
    assert clean_username("https://t.me/s/work_gorlovka") == "work_gorlovka"
    assert clean_username("https://t.me/work_gorlovka/99") == "work_gorlovka"
    assert clean_username("example_replace_me") is None
    assert clean_username("") is None


def test_sources_have_gorlovka_channels_and_no_placeholder():
    data = load_sources()
    channels = enabled_channels(data)
    assert channels
    assert all(item["default_city"] == "gorlovka" for item in channels)
    usernames = {item["username"] for item in channels}
    assert "rabotagorlovka" in usernames
    assert "rabota_gorlovkaw" in usernames
    assert "example_replace_me" not in usernames


def test_empty_channel_list_does_not_need_session(monkeypatch):
    monkeypatch.delenv("TG_SESSION", raising=False)
    monkeypatch.delenv("TG_API_ID", raising=False)
    monkeypatch.delenv("TG_API_HASH", raising=False)
    stats = run_parser(dry_run=True, channels=[], gap_sec=0, sleep=lambda _s: None)
    assert stats["fetched"] == 0
    assert "каналов" in (stats.get("note") or "")


def test_album_of_three_messages_becomes_one_post():
    parts = [
        _msg("Требуется сварщик в Горловке", msg_id=21, grouped_id=900),
        _msg("", msg_id=22, grouped_id=900, extras={"images": ["https://cdn4.telegram-cdn.org/file/a.jpg"]}),
        _msg("оклад 45 000 руб, тел. 071-123-45-67", msg_id=23, grouped_id=900),
    ]
    posts = merge_albums(list(reversed(parts)))
    assert len(posts) == 1
    post = posts[0]
    assert post["id"] == 21
    assert post["ids"] == [21, 22, 23]
    assert "сварщик" in post["text"]
    assert "45 000" in post["text"]
    assert post["images"] == ["https://cdn4.telegram-cdn.org/file/a.jpg"]


def test_album_one_job_one_vacancy():
    parts = [
        _msg(JOB_TEXT, msg_id=31, grouped_id=501),
        _msg("", msg_id=32, grouped_id=501, extras={"images": ["https://cdn4.telegram-cdn.org/file/p1.jpg"]}),
        _msg("", msg_id=33, grouped_id=501, extras={"images": ["https://cdn4.telegram-cdn.org/file/p2.jpg"]}),
    ]
    post = merge_albums(parts)[0]
    result = process_tg_post(post, CHANNEL)
    assert len(result["records"]) == 1
    record = result["records"][0]
    assert record["externalId"] == "gorlovka_jobs/31"
    assert record["sourceUrl"] == "https://t.me/gorlovka_jobs/31"
    assert record["source"] == "TELEGRAM"
    assert record["rawText"] == post["text"]
    assert "svarshchik" in (record.get("professionSlug") or "")


def test_album_two_jobs_two_units_after_process_post():
    parts = [
        _msg(SHEET_TEXT, msg_id=41, grouped_id=777),
        _msg("", msg_id=42, grouped_id=777),
        _msg("", msg_id=43, grouped_id=777),
    ]
    post = merge_albums(parts)[0]
    result = process_tg_post(post, CHANNEL)
    records = result["records"]
    assert len(records) == 2
    assert records[0]["externalId"] == "gorlovka_jobs/41"
    assert records[1]["externalId"] == "gorlovka_jobs/41#2"
    assert records[0]["sourcePostExternalId"] == records[1]["sourcePostExternalId"] == "gorlovka_jobs/41"
    assert records[0]["sourceUrl"] == records[1]["sourceUrl"] == "https://t.me/gorlovka_jobs/41"
    assert records[0]["rawText"] == records[1]["rawText"] == SHEET_TEXT
    slugs = {item.get("professionSlug") for item in records}
    assert "svarshchik" in slugs
    assert "povar" in slugs


def test_merge_does_not_glue_different_albums():
    messages = [
        _msg(JOB_TEXT, msg_id=1, grouped_id=1),
        _msg("", msg_id=2, grouped_id=1),
        _msg(JOB_TEXT_GUARD, msg_id=3, grouped_id=2),
        _msg("", msg_id=4, grouped_id=2),
        _msg(SALE_TEXT, msg_id=5),
    ]
    posts = merge_albums(messages)
    assert len(posts) == 3
    assert posts[0]["id"] == 1
    assert posts[1]["id"] == 3
    assert posts[2]["id"] == 5
    assert posts[0]["ids"] == [1, 2]
    assert posts[1]["ids"] == [3, 4]


def test_dedupe_same_message_id():
    messages = [_msg(JOB_TEXT, msg_id=8), _msg(JOB_TEXT, msg_id=8)]
    posts = merge_albums(messages)
    assert len(posts) == 1


def test_garbage_goes_to_reject_not_records():
    result = process_tg_post(_msg(SALE_TEXT), CHANNEL)
    assert result["records"] == []
    assert result["reject_reason"] == "filter"


def test_svo_reject_reason():
    result = process_tg_post(_msg(SVO_TEXT), CHANNEL)
    assert result["records"] == []
    assert result["reject_reason"] == "svo"


def test_empty_caption_passes_image_urls(monkeypatch):
    captured: dict = {}

    def fake_run(text, source=None, images=None, **kwargs):
        captured["text"] = text
        captured["images"] = images
        from process import ProcessRun

        return ProcessRun(records=[], reject_reason="filter")

    monkeypatch.setattr("parser_tg.run_process_post", fake_run)
    post = _msg(
        "",
        extras={"images": ["https://cdn4.telegram-cdn.org/file/vacancy.jpg"]},
    )
    process_tg_post(post, CHANNEL)
    assert captured["text"] == ""
    assert captured["images"] == ["https://cdn4.telegram-cdn.org/file/vacancy.jpg"]


def test_foreign_image_host_dropped_on_merge():
    posts = merge_albums(
        [
            _msg(
                JOB_TEXT,
                extras={
                    "images": [
                        "https://evil.example.com/steal.jpg",
                        "https://cdn4.telegram-cdn.org/file/ok.jpg",
                    ]
                },
            )
        ]
    )
    assert posts[0]["images"] == ["https://cdn4.telegram-cdn.org/file/ok.jpg"]


def test_redact_hides_session(monkeypatch):
    monkeypatch.setenv("TG_SESSION", "super-secret-session-string")
    monkeypatch.setenv("TG_API_HASH", "hash-secret")
    assert "super-secret-session-string" not in redact("session=super-secret-session-string")
    assert "[redacted]" in redact("session=super-secret-session-string")
    assert "hash-secret" not in redact("hash-secret")


def test_source_switch(monkeypatch):
    monkeypatch.setenv("SOURCE_TG_ENABLED", "false")
    assert source_tg_enabled() is False
    stats = run_parser(dry_run=True, channels=[{**CHANNEL, "enabled": True}])
    assert stats["fetched"] == 0
    assert "SOURCE_TG_ENABLED" in (stats.get("note") or "")


def test_dry_run_does_not_upload(monkeypatch, tmp_path):
    calls = {"upload": 0}

    def boom(*args, **kwargs):
        calls["upload"] += 1
        raise AssertionError("dry-run не должен вызывать upload")

    monkeypatch.setattr("parser_tg.post_batch_with_retry", boom)
    stats = run_parser(
        dry_run=True,
        limit=5,
        reader=StubReader([_msg(JOB_TEXT, msg_id=10)]),
        channels=[CHANNEL],
        rejected_path=tmp_path / "rejected.jsonl",
        gap_sec=0,
        sleep=lambda _s: None,
    )
    assert calls["upload"] == 0
    assert stats["dry_run"] is True
    assert stats["accepted"] >= 1
    assert stats["added"] == 0


def test_limit_five_posts():
    posts = [_msg(JOB_TEXT, msg_id=i) for i in range(1, 12)]
    reader = StubReader(list(reversed(posts)))
    stats = run_parser(
        dry_run=True,
        limit=5,
        reader=reader,
        channels=[CHANNEL],
        gap_sec=0,
        sleep=lambda _s: None,
    )
    assert stats["fetched"] == 5


def test_since_hours_keeps_only_fresh_posts():
    now = int(time.time())
    posts = [
        _msg(JOB_TEXT, msg_id=1, extras={"date": now - 60}),
        _msg(SALE_TEXT, msg_id=2, extras={"date": now - 7200}),
    ]
    stats = run_parser(
        dry_run=True,
        since_hours=1,
        reader=StubReader(posts),
        channels=[CHANNEL],
        gap_sec=0,
        sleep=lambda _s: None,
    )
    assert stats["fetched"] == 1
    assert stats["skipped_old"] == 1


def test_flood_wait_sleeps_and_continues(tmp_path):
    sleeps: list[float] = []
    reader = StubReader([_msg(JOB_TEXT, msg_id=10)], flood_first=4)
    stats = run_parser(
        dry_run=True,
        reader=reader,
        channels=[CHANNEL],
        rejected_path=tmp_path / "rejected.jsonl",
        gap_sec=0,
        sleep=sleeps.append,
    )
    assert reader.calls == 2
    assert any(item >= 4 for item in sleeps)
    assert stats["accepted"] >= 1
    assert stats["fetched"] >= 1


def test_call_with_flood_wait_retries_then_succeeds():
    sleeps: list[float] = []
    state = {"n": 0}

    def flaky():
        state["n"] += 1
        if state["n"] == 1:
            raise TgFloodWait(2)
        return "ok"

    assert call_with_flood_wait(flaky, sleeps.append) == "ok"
    assert state["n"] == 2
    assert sleeps == [3]


def test_flood_seconds_from_telethon_shaped_error():
    class FloodWaitError(Exception):
        def __init__(self, seconds: int) -> None:
            self.seconds = seconds
            self.code = 420

    assert flood_seconds(FloodWaitError(15)) == 15
    assert flood_seconds(RuntimeError("no")) is None


def test_parser_has_no_own_cleanup_rules():
    source = (ROOT / "scripts" / "parser_tg.py").read_text(encoding="utf-8")
    assert "from process import run_process_post" in source
    assert "def clean_title" not in source
    assert "def strip_junk" not in source
    assert "def is_vacancy" not in source
    assert "merge_albums" in source


def test_no_session_value_in_repo():
    skip_dirs = {".git", ".venv", "node_modules", ".next", "__pycache__", "logs"}
    skip_suffix = {".pyc", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".session"}
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
            if stripped.startswith("TG_SESSION="):
                value = stripped.split("=", 1)[1].strip().strip("'\"")
                if value and "вставь" not in value.lower() and "<" not in value:
                    hits.append(f"{path}:{line_no}")
            if stripped.startswith("TG_API_HASH="):
                value = stripped.split("=", 1)[1].strip().strip("'\"")
                if value:
                    hits.append(f"{path}:{line_no}:hash")
    assert hits == [], hits
    example = (ROOT / ".env.example").read_text(encoding="utf-8")
    assert "TG_SESSION=" in example
    assert "TG_API_ID=" in example
    assert "TG_API_HASH=" in example
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "*.session" in gitignore


def test_workflow_has_cron_tesseract_and_secrets():
    text = (ROOT / ".github" / "workflows" / "parser-tg.yml").read_text(encoding="utf-8")
    assert "cron: \"30 1,4,7,10,13,16,19,22 * * *\"" in text
    assert "cron: \"40 5 * * *\"" in text
    assert "concurrency:" in text
    assert "workflow_dispatch" in text
    assert "tesseract-ocr-rus" in text
    assert "OCR_PROVIDER: tesseract" in text
    assert "secrets.TG_SESSION" in text
    assert "secrets.TG_API_ID" in text
    assert "secrets.TG_API_HASH" in text
    assert "secrets.CRON_SECRET" in text
    assert "secrets.SITE_URL" in text
    assert "upload-artifact" in text
    assert "cache: pip" in text
    assert "python scripts/parser_tg.py" in text


def test_make_session_script_exists_and_uses_string_session():
    text = (ROOT / "scripts" / "make_tg_session.py").read_text(encoding="utf-8")
    assert "StringSession" in text
    assert "my.telegram.org" in text
    assert "*.session" in text
    assert "GitHub Secrets" in text


def test_sources_path_is_scripts():
    assert SOURCES_PATH.name == "sources_tg.json"
    assert SOURCES_PATH.parent.name == "scripts"


def test_run_parser_album_counts_as_one_fetched(tmp_path):
    parts = [
        _msg(JOB_TEXT, msg_id=51, grouped_id=300),
        _msg("", msg_id=52, grouped_id=300),
        _msg("", msg_id=53, grouped_id=300),
    ]
    stats = run_parser(
        dry_run=True,
        reader=StubReader(parts),
        channels=[CHANNEL],
        rejected_path=tmp_path / "rejected.jsonl",
        gap_sec=0,
        sleep=lambda _s: None,
    )
    assert stats["fetched"] == 1
    assert stats["accepted"] >= 1
