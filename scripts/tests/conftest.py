"""Общие фикстуры тестов фильтра."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from tests.data import load_posts


@pytest.fixture(scope="session")
def fixture_source() -> dict:
    source, _posts = load_posts()
    return source


@pytest.fixture(scope="session")
def all_posts() -> list[dict]:
    _source, posts = load_posts()
    return posts
