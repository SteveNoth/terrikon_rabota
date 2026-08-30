"""Загрузка примеров отсева СВО."""

from __future__ import annotations

import json
from pathlib import Path

SAMPLES = Path(__file__).resolve().parent / "samples.json"
DEFAULT_SOURCE = {"name": "Работа Горловка", "default_city": "gorlovka"}


def load_svo_samples() -> tuple[dict, dict, list[dict]]:
    data = json.loads(SAMPLES.read_text(encoding="utf-8"))
    source = data.get("source") or DEFAULT_SOURCE
    market = data.get("market") or {}
    return source, market, list(data["posts"])
