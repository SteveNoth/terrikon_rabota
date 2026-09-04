"""Окно парсера по последнему запуску и список затихших workflow.

GitHub часто пропускает частые cron. Если парсер всё же стартанул,
он сам смотрит /api/health и читает посты за весь простой, а не только
за последний час. Сторож по тому же health запускает затихшие workflow.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.parse import urlparse

PARSER_WORKFLOWS: dict[str, str] = {
    "parser_vk": "parser-vk.yml",
    "parser_tg": "parser-tg.yml",
    "parser_web": "parser-web.yml",
    "parser_trudvsem": "parser-trudvsem.yml",
}

LOOKBACK_MIN_HOURS: dict[str, float] = {
    "parser_vk": 6,
    "parser_tg": 6,
    "parser_web": 30,
    "parser_trudvsem": 30,
}
LOOKBACK_MAX_HOURS = 168.0
LOOKBACK_OVERLAP_HOURS = 3.0
LOOKBACK_FALLBACK_HOURS = 72.0
HEALTH_TIMEOUT_SEC = 20

HttpGet = Callable[[str], tuple[int, str]]


def is_local_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def assert_ci_site_url(url: str) -> None:
    """В GitHub Actions пачка на localhost — это молчаливый провал парсинга."""
    import os

    if os.environ.get("GITHUB_ACTIONS") != "true":
        return
    if not url or is_local_url(url):
        raise SystemExit(
            "SITE_URL в GitHub Secrets должен быть адресом живого сайта "
            "(https://terrikon-rabota.vercel.app), не пустым и не localhost. "
            "Иначе Actions «зелёные», а на сайте парсинг не происходит."
        )


def lookback_hours(
    parser: str,
    *,
    last_started_at: str | None,
    now: datetime | None = None,
) -> float:
    minimum = LOOKBACK_MIN_HOURS.get(parser, LOOKBACK_FALLBACK_HOURS)
    if not last_started_at:
        return LOOKBACK_MAX_HOURS
    try:
        stamp = datetime.fromisoformat(last_started_at.replace("Z", "+00:00"))
    except ValueError:
        return LOOKBACK_FALLBACK_HOURS
    moment = now or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    elapsed = (moment - stamp).total_seconds() / 3600.0
    if elapsed < 0:
        elapsed = 0.0
    return max(minimum, min(LOOKBACK_MAX_HOURS, elapsed + LOOKBACK_OVERLAP_HOURS))


def last_started_from_health(payload: dict[str, Any], parser: str) -> str | None:
    for item in payload.get("parsers") or []:
        if not isinstance(item, dict):
            continue
        if item.get("parser") == parser:
            value = item.get("lastStartedAt")
            if isinstance(value, str) and value.strip():
                return value.strip()
            return None
    return None


def stale_workflows(payload: dict[str, Any]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for item in payload.get("parsers") or []:
        if not isinstance(item, dict) or not item.get("stale"):
            continue
        workflow = PARSER_WORKFLOWS.get(str(item.get("parser") or ""))
        if workflow and workflow not in seen:
            seen.add(workflow)
            names.append(workflow)
    return names


def default_http_get(url: str) -> tuple[int, str]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "TerriconRabota/0.1 (parser-lookback)", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=HEALTH_TIMEOUT_SEC) as response:
            body = response.read().decode("utf-8", errors="replace")
            return int(getattr(response, "status", 200) or 200), body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        return int(exc.code or 0), body
    except Exception as exc:
        return 0, str(exc)


def fetch_health(site: str, http_get: HttpGet | None = None) -> dict[str, Any] | None:
    base = (site or "").strip().rstrip("/")
    if not base or is_local_url(base):
        return None
    getter = http_get or default_http_get
    status, body = getter(f"{base}/api/health")
    if status not in {200, 503}:
        return None
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def resolve_since_hours(
    parser: str,
    explicit: float | None,
    *,
    site: str,
    now: datetime | None = None,
    http_get: HttpGet | None = None,
) -> float:
    if explicit is not None and explicit > 0:
        return float(explicit)
    health = fetch_health(site, http_get=http_get)
    if health is None:
        return LOOKBACK_FALLBACK_HOURS
    last = last_started_from_health(health, parser)
    return lookback_hours(parser, last_started_at=last, now=now)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Окно догона и затихшие workflow парсеров.")
    parser.add_argument(
        "--stale-workflows",
        action="store_true",
        help="Читает JSON /api/health со stdin, печатает имена yml затихших парсеров.",
    )
    args = parser.parse_args(argv)
    if args.stale_workflows:
        try:
            payload = json.load(sys.stdin)
        except json.JSONDecodeError:
            return 0
        if not isinstance(payload, dict):
            return 0
        for name in stale_workflows(payload):
            print(name)
        return 0
    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
