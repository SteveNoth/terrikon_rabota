"""Автодогон окна парсера и список затихших workflow."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from parser_lookback import (
    LOOKBACK_FALLBACK_HOURS,
    LOOKBACK_MAX_HOURS,
    assert_ci_site_url,
    is_local_url,
    last_started_from_health,
    lookback_hours,
    resolve_since_hours,
    stale_workflows,
)

ROOT = Path(__file__).resolve().parents[3]
NOW = datetime(2026, 9, 4, 4, 30, tzinfo=timezone.utc)


def test_local_urls():
    assert is_local_url("http://127.0.0.1:3000")
    assert is_local_url("http://localhost:3000/api/health")
    assert not is_local_url("https://terrikon-rabota.vercel.app")


def test_lookback_without_last_run_uses_week():
    assert lookback_hours("parser_vk", last_started_at=None, now=NOW) == LOOKBACK_MAX_HOURS


def test_lookback_covers_gap_plus_overlap():
    hours = lookback_hours("parser_vk", last_started_at="2026-09-02T20:07:10.414Z", now=NOW)
    # 32.38 ч простоя + 3 ч запас, не меньше минимума 6.
    assert 35 <= hours <= 36


def test_lookback_recent_run_uses_minimum():
    hours = lookback_hours("parser_vk", last_started_at="2026-09-04T03:30:00.000Z", now=NOW)
    assert hours == 6


def test_lookback_caps_at_week():
    hours = lookback_hours("parser_tg", last_started_at="2026-08-01T00:00:00.000Z", now=NOW)
    assert hours == LOOKBACK_MAX_HOURS


def test_lookback_web_minimum_is_longer():
    hours = lookback_hours("parser_web", last_started_at="2026-09-04T03:30:00.000Z", now=NOW)
    assert hours == 30


def test_explicit_since_hours_wins():
    def boom(_url: str) -> tuple[int, str]:
        raise AssertionError("явное окно не ходит в health")

    assert (
        resolve_since_hours(
            "parser_vk",
            12,
            site="https://terrikon-rabota.vercel.app",
            now=NOW,
            http_get=boom,
        )
        == 12
    )


def test_missing_health_falls_back_three_days():
    def fail(_url: str) -> tuple[int, str]:
        return 0, "down"

    assert (
        resolve_since_hours(
            "parser_vk",
            None,
            site="https://terrikon-rabota.vercel.app",
            now=NOW,
            http_get=fail,
        )
        == LOOKBACK_FALLBACK_HOURS
    )


def test_localhost_does_not_fetch_health():
    def boom(_url: str) -> tuple[int, str]:
        raise AssertionError("localhost не спрашиваем")

    assert (
        resolve_since_hours("parser_vk", None, site="http://127.0.0.1:3000", now=NOW, http_get=boom)
        == LOOKBACK_FALLBACK_HOURS
    )


def test_health_last_started_drives_window():
    payload = {
        "parsers": [
            {"parser": "parser_vk", "lastStartedAt": "2026-09-02T20:07:10.414Z", "stale": True},
        ]
    }

    def ok(_url: str) -> tuple[int, str]:
        return 200, json.dumps(payload)

    hours = resolve_since_hours(
        "parser_vk",
        None,
        site="https://terrikon-rabota.vercel.app",
        now=NOW,
        http_get=ok,
    )
    assert 35 <= hours <= 36
    assert last_started_from_health(payload, "parser_vk") == "2026-09-02T20:07:10.414Z"


def test_stale_workflows_only_stale_parsers():
    payload = {
        "parsers": [
            {"parser": "parser_vk", "stale": True},
            {"parser": "parser_tg", "stale": True},
            {"parser": "parser_web", "stale": False},
            {"parser": "parser_trudvsem", "stale": True},
        ]
    }
    assert stale_workflows(payload) == [
        "parser-vk.yml",
        "parser-tg.yml",
        "parser-trudvsem.yml",
    ]


def test_ci_site_url_rejects_localhost(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    try:
        assert_ci_site_url("http://127.0.0.1:3000")
        raise AssertionError("ожидали SystemExit")
    except SystemExit as exc:
        assert "SITE_URL" in str(exc)


def test_ci_site_url_allows_production(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    assert_ci_site_url("https://terrikon-rabota.vercel.app")


def test_local_machine_may_use_localhost(monkeypatch):
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    assert_ci_site_url("http://127.0.0.1:3000")


def test_watch_workflow_dispatches_stale_parsers():
    text = (ROOT / ".github" / "workflows" / "parser-watch.yml").read_text(encoding="utf-8")
    assert "cron: \"20 * * * *\"" in text
    assert "cron: \"25 8 * * *\"" in text
    assert "actions: write" in text
    assert "parser-watch.sh" in text
    assert "GH_TOKEN" in text or "github.token" in text


def test_vercel_daily_watch_cron():
    text = (ROOT / "vercel.json").read_text(encoding="utf-8")
    assert "/api/ops/watch" in text
    assert "30 8 * * *" in text
