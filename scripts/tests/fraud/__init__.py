"""Загрузка примеров оценки доверия."""

from __future__ import annotations

import json
from pathlib import Path

SAMPLES = Path(__file__).resolve().parent / "samples.json"
DEFAULT_SOURCE = {"name": "Работа Горловка", "default_city": "gorlovka"}


def load_fraud_samples() -> dict:
    return json.loads(SAMPLES.read_text(encoding="utf-8"))
