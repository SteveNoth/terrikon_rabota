"""Подключение к Postgres для ночных скриптов (regroup / reprocess / send_test).

Сайт ходит через пул (порт 6543). Скрипты — через DIRECT_URL (сессия):
длинный разговор, много запросов, без обрыва пула.

Не собираем DSN-строку: urlparse в Python 3.14 ломает пароль с [ ].
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, unquote

from parser_env import load_env

load_env()


def _conn_kwargs() -> dict[str, Any]:
    raw = (os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL") or "").strip()
    if not raw:
        raise SystemExit("Нет DIRECT_URL / DATABASE_URL. Возьми строки из .env.local.")
    rest = raw.split("://", 1)[-1]
    if "@" not in rest:
        raise SystemExit("DIRECT_URL без хоста. Проверь строку в .env.local.")
    userinfo, hostpart = rest.rsplit("@", 1)
    if ":" not in userinfo:
        raise SystemExit("DIRECT_URL без пароля. Проверь строку в .env.local.")
    user, password = userinfo.split(":", 1)
    user = unquote(user)
    password = unquote(password)

    if "/" in hostpart:
        hostport, path_query = hostpart.split("/", 1)
    else:
        hostport, path_query = hostpart, "postgres"

    query: dict[str, str] = {}
    if "?" in path_query:
        dbname, qstr = path_query.split("?", 1)
        query = dict(parse_qsl(qstr, keep_blank_values=True))
    else:
        dbname = path_query
    dbname = unquote(dbname) or "postgres"

    if hostport.startswith("[") and "]" in hostport:
        close = hostport.index("]")
        host = hostport[1:close]
        tail = hostport[close + 1 :]
        port = int(tail[1:]) if tail.startswith(":") and tail[1:].isdigit() else 5432
    elif ":" in hostport and hostport.rsplit(":", 1)[-1].isdigit():
        host, port_s = hostport.rsplit(":", 1)
        port = int(port_s)
    else:
        host, port = hostport, 5432

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "dbname": dbname,
        "sslmode": query.get("sslmode") or "require",
        "connect_timeout": 20,
    }


def _overlay_working_db_urls() -> bool:
    """Если .env.local с битым паролем перекрыл .env — вернуть рабочие URL."""
    path = Path(__file__).resolve().parent.parent / ".env"
    if not path.is_file():
        return False
    changed = False
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key not in {"DATABASE_URL", "DIRECT_URL"}:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if value and os.environ.get(key) != value:
            os.environ[key] = value
            changed = True
    return changed


def connect():
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Нужен пакет psycopg. В папке проекта: .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt"
        ) from exc
    try:
        return psycopg.connect(**_conn_kwargs(), row_factory=dict_row)
    except Exception as exc:
        if "password authentication failed" not in str(exc):
            raise
        if not _overlay_working_db_urls():
            raise
        return psycopg.connect(**_conn_kwargs(), row_factory=dict_row)


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
