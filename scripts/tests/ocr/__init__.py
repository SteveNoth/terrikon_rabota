"""Примеры для отчёта OCR: синтетика и живые макеты из «ПОСТЫ ФОТО»."""

from __future__ import annotations

import json
from pathlib import Path

SAMPLES = Path(__file__).resolve().parent / "samples.json"
LIVE = Path(__file__).resolve().parent / "live.json"
DEFAULT_SOURCE = {"name": "Работа Горловка", "default_city": "gorlovka", "externalId": "ocr-test"}


def load_ocr_samples() -> tuple[dict, list[dict]]:
    data = json.loads(SAMPLES.read_text(encoding="utf-8"))
    source = data.get("source") or DEFAULT_SOURCE
    return source, list(data["posts"])


def load_live_posts() -> tuple[dict, list[dict]]:
    data = json.loads(LIVE.read_text(encoding="utf-8"))
    source = data.get("source") or DEFAULT_SOURCE
    return source, list(data["posts"])
