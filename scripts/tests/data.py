"""Загрузка обучающих примеров для фильтра."""

from __future__ import annotations

import json
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "posts.json"
DEFAULT_SOURCE = {"name": "Работа Горловка", "default_city": "gorlovka"}


def load_posts() -> tuple[dict, list[dict]]:
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    source = data.get("source") or DEFAULT_SOURCE
    return source, list(data["posts"])
