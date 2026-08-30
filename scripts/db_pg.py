"""Подключение к Postgres для ночных скриптов (regroup / reprocess / send_test).

Сайт ходит через пул (порт 6543). Скрипты — через DIRECT_URL (сессия):
длинный разговор, много запросов, без обрыва пула.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from parser_env import load_env

load_env()


def _dsn() -> str:
    raw = (os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL") or "").strip()
    if not raw:
        raise SystemExit("Нет DIRECT_URL / DATABASE_URL. Возьми строки из .env.local.")
    parsed = urlparse(raw)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("pgbouncer", None)
    query.pop("connection_limit", None)
    query.pop("connect_timeout", None)
    if "sslmode" not in query:
        query["sslmode"] = "require"
    return urlunparse(parsed._replace(query=urlencode(query)))


def connect():
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Нужен пакет psycopg. В папке проекта: .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt"
        ) from exc
    return psycopg.connect(_dsn(), row_factory=dict_row)


def fetch_all(sql: str, params: tuple[Any, ...] | dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return list(cur.fetchall())


def execute(sql: str, params: tuple[Any, ...] | dict[str, Any] | None = None) -> int:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            count = cur.rowcount
        conn.commit()
        return count
