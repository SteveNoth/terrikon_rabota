"""Парсер публичных каналов Telegram — второй живой источник вакансий.

Client API через Telethon (Закон 12 и 19). Карточку парсер не собирает:
текст и URL картинок отдаёт в process_post / run_process_post.
Альбом (несколько сообщений с одним grouped_id) склеивается в один пост
до process_post — это куски одного объявления, не нарезка из 14A.
Сессия — переменная TG_SESSION, никогда не файл репозитория.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

_SCRIPTS = Path(__file__).resolve().parent
ROOT = _SCRIPTS.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from ocr import image_url_allowed
from parser_env import load_env
from parser_lookback import assert_ci_site_url, resolve_since_hours
from process import run_process_post
from shared_config import active_cities

load_env()

from parser_vk import (
    chunked,
    cron_secret,
    ensure_logs_dir,
    merge_upload_stats,
    post_batch_with_retry,
    preview_text,
    print_record,
    rejected_log_path,
    site_url,
    write_rejected,
)

USER_AGENT = "TerriconRabota/0.1 (parser-tg; https://github.com/SteveNoth/terrikon_rabota)"
SOURCES_PATH = _SCRIPTS / "sources_tg.json"
LOGS_DIR = ROOT / "logs"
MAX_HISTORY = 100
UPLOAD_BATCH = 100
DEFAULT_GAP_SEC = 2.0
MAX_IMAGE_URLS = 4
MAX_FLOOD_WAIT_SEC = 900
FLOOD_RETRIES = 8
ALBUM_TAIL_EXTRA = 20

Sleeper = Callable[[float], None]


class TgFloodWait(Exception):
    """«Слишком часто». Ждём seconds и продолжаем, а не падаем."""

    def __init__(self, seconds: int) -> None:
        self.seconds = max(0, int(seconds))
        super().__init__(f"FloodWait {self.seconds}s")


class TgAccessError(Exception):
    """Канал закрыт или недоступен. Это «нельзя», если доступ закрыт — не обходим."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def source_tg_enabled() -> bool:
    raw = (os.environ.get("SOURCE_TG_ENABLED") or "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def tg_api_id() -> int:
    raw = (os.environ.get("TG_API_ID") or "").strip()
    if not raw:
        raise SystemExit(
            "Нет TG_API_ID. Это номер приложения с https://my.telegram.org\n"
            "(API development tools). Шаги: docs/SETUP-LOG.md, раздел «Этап 17».\n"
            "В репозиторий и в sources_tg.json его класть нельзя."
        )
    try:
        return int(raw)
    except ValueError:
        raise SystemExit("TG_API_ID должен быть числом с my.telegram.org.") from None


def tg_api_hash() -> str:
    value = (os.environ.get("TG_API_HASH") or "").strip()
    if not value:
        raise SystemExit(
            "Нет TG_API_HASH. Это ключ приложения с https://my.telegram.org.\n"
            "Шаги: docs/SETUP-LOG.md, раздел «Этап 17»."
        )
    return value


def tg_session() -> str:
    value = (os.environ.get("TG_SESSION") or "").strip().strip("'\"")
    if not value:
        raise SystemExit(
            "Нет TG_SESSION. Это строка сессии (StringSession), не файл *.session.\n"
            "Создай один раз локально: python scripts/make_tg_session.py\n"
            "и положи строку в .env.local и GitHub Secrets.\n"
            "Файл сессии в репозиторий класть нельзя — это полноценный вход в аккаунт."
        )
    return value


def channel_gap_sec() -> float:
    raw = os.environ.get("TG_CHANNEL_GAP_SEC")
    if not raw:
        return DEFAULT_GAP_SEC
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_GAP_SEC
    return max(0.0, min(value, 15.0))


def redact(text: str) -> str:
    """Чтобы сессия и ключи случайно не попали в консоль и jsonl."""
    value = text or ""
    secrets = [
        item
        for item in (
            os.environ.get("TG_SESSION"),
            os.environ.get("TG_API_HASH"),
            os.environ.get("CRON_SECRET"),
            os.environ.get("VK_TOKEN"),
        )
        if item
    ]
    for secret in secrets:
        token = str(secret).strip().strip("'\"")
        if token and token in value:
            value = value.replace(token, "[redacted]")
    return value


def flood_seconds(exc: BaseException) -> int | None:
    """Сколько ждать. None — это не FloodWait."""
    if isinstance(exc, TgFloodWait):
        return exc.seconds
    name = type(exc).__name__
    seconds = getattr(exc, "seconds", None)
    if seconds is None:
        return None
    try:
        wait = int(seconds)
    except (TypeError, ValueError):
        return None
    if name in {"FloodWaitError", "FloodTestError", "TgFloodWait"}:
        return max(0, wait)
    if getattr(exc, "code", None) == 420:
        return max(0, wait)
    return None


def wait_flood(seconds: int, sleep: Sleeper) -> None:
    wait = max(1, int(seconds) + 1)
    if wait > MAX_FLOOD_WAIT_SEC:
        print(
            f"FloodWait {seconds}с — жду {MAX_FLOOD_WAIT_SEC}с (потолок), затем продолжаю."
        )
        sleep(MAX_FLOOD_WAIT_SEC)
        return
    print(f"FloodWait: слишком часто, жду {wait}с и продолжаю.")
    sleep(wait)


def call_with_flood_wait(fn: Callable[[], Any], sleep: Sleeper) -> Any:
    """Повторяет вызов после FloodWait. Не роняет прогон из‑за «слишком часто»."""
    last: BaseException | None = None
    for attempt in range(FLOOD_RETRIES):
        try:
            return fn()
        except Exception as exc:
            seconds = flood_seconds(exc)
            if seconds is None:
                raise
            last = exc
            wait_flood(seconds, sleep)
            if attempt == FLOOD_RETRIES - 1:
                break
    raise SystemExit(
        f"FloodWait слишком много раз подряд. {redact(str(last) if last else '')}"
    )


def load_sources(path: Path | None = None) -> dict[str, Any]:
    target = path or SOURCES_PATH
    with target.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit("scripts/sources_tg.json должен быть объектом, не массивом.")
    return data


def enabled_channels(data: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    payload = data if data is not None else load_sources()
    defaults = payload.get("defaults") or {}
    default_count = int(defaults.get("count") or 30)
    default_city = str(defaults.get("default_city") or "gorlovka")
    channels: list[dict[str, Any]] = []
    for raw in payload.get("channels") or []:
        if not isinstance(raw, dict):
            continue
        if not raw.get("enabled", True):
            continue
        username = clean_username(raw.get("username"))
        if not username:
            print("Пропуск канала без username:", raw.get("sourceName") or raw)
            continue
        city = str(raw.get("default_city") or default_city).strip()
        if not city:
            print("Пропуск канала без default_city:", raw.get("sourceName") or username)
            continue
        count = int(raw.get("count") or default_count)
        count = max(1, min(count, MAX_HISTORY))
        channels.append(
            {
                "enabled": True,
                "username": username,
                "sourceName": str(raw.get("sourceName") or username),
                "default_city": city,
                "count": count,
            }
        )
    return channels


def clean_username(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == "example_replace_me":
        return None
    text = text.replace("https://t.me/s/", "").replace("http://t.me/s/", "")
    text = text.replace("https://telegram.me/s/", "")
    text = text.replace("https://t.me/", "").replace("http://t.me/", "")
    text = text.replace("https://telegram.me/", "").replace("http://telegram.me/", "")
    text = text.split("?")[0].strip().strip("/")
    if text.startswith("@"):
        text = text[1:]
    text = text.split("/")[0].strip()
    if not text or text.lower() in {"s", "joinchat", "c", "example_replace_me"}:
        return None
    return text


def message_url(username: str, message_id: int) -> str:
    return f"https://t.me/{username}/{int(message_id)}"


def message_external_id(username: str, message_id: int) -> str:
    return f"{username}/{int(message_id)}"


def attachment_url(username: str, message_id: int, index: int = 0) -> str:
    """Стабильный ключ вложения на allowlist-хосте. Байты отдаёт fetch парсера."""
    return f"https://cdn4.telegram-cdn.org/file/{username}/{int(message_id)}/{int(index)}.jpg"


def message_unix(item: dict[str, Any]) -> int:
    date = item.get("date")
    if date is None:
        return 0
    if isinstance(date, datetime):
        return int(date.timestamp())
    if isinstance(date, (int, float)):
        return int(date)
    if isinstance(date, str):
        text = date.strip()
        if not text:
            return 0
        try:
            if text.endswith("Z"):
                text = text[:-1] + "+00:00"
            return int(datetime.fromisoformat(text).timestamp())
        except ValueError:
            return 0
    return 0


def published_at(item: dict[str, Any]) -> str | None:
    stamp = message_unix(item)
    if not stamp:
        return None
    try:
        return datetime.fromtimestamp(stamp, timezone.utc).isoformat().replace("+00:00", "Z")
    except (OSError, OverflowError, ValueError):
        return None


def dedupe_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Один id сообщения — один раз за прогон."""
    seen: set[int] = set()
    out: list[dict[str, Any]] = []
    for item in messages:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        try:
            mid = int(item["id"])
        except (TypeError, ValueError):
            continue
        if mid in seen:
            continue
        seen.add(mid)
        out.append(item)
    return out


def merge_albums(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Склеить сообщения с одним grouped_id в один пост. До process_post.

    Это не нарезка 14A: альбом — фрагменты одного объявления. Уже склеенный
    пост process_post может разрезать на несколько вакансий, если в нём
    несколько должностей.
    """
    ordered = sorted(dedupe_messages(messages), key=lambda item: int(item["id"]))
    posts: list[dict[str, Any]] = []
    buckets: dict[int, list[dict[str, Any]]] = {}
    for item in ordered:
        raw_gid = item.get("grouped_id")
        if raw_gid in {None, "", 0, "0"}:
            posts.append(_post_from_parts([item]))
            continue
        gid = int(raw_gid)
        if gid not in buckets:
            buckets[gid] = []
            posts.append({"_bucket": gid})
        buckets[gid].append(item)
    result: list[dict[str, Any]] = []
    for item in posts:
        if "_bucket" in item:
            result.append(_post_from_parts(buckets[int(item["_bucket"])]))
        else:
            result.append(item)
    return result


def _post_from_parts(parts: list[dict[str, Any]]) -> dict[str, Any]:
    parts = sorted(parts, key=lambda item: int(item["id"]))
    canonical = parts[0]
    texts: list[str] = []
    images: list[str] = []
    ids: list[int] = []
    username = str(canonical.get("username") or "")
    for part in parts:
        ids.append(int(part["id"]))
        if part.get("username"):
            username = str(part["username"])
        text = (part.get("text") or "").strip()
        if text:
            texts.append(text)
        for url in part.get("images") or []:
            if url and url not in images:
                images.append(str(url))
    images = [url for url in images if image_url_allowed(url)][:MAX_IMAGE_URLS]
    return {
        "id": int(canonical["id"]),
        "ids": ids,
        "grouped_id": canonical.get("grouped_id"),
        "text": "\n\n".join(texts),
        "images": images,
        "date": canonical.get("date"),
        "username": username,
    }


def process_tg_post(
    post: dict[str, Any],
    channel: dict[str, Any],
    *,
    fetch: Any = None,
    ocr: Any = None,
) -> dict[str, Any]:
    """Один (уже склеенный) пост → записи process_post. Карточку не собираем."""
    username = str(post.get("username") or channel["username"])
    post_id = int(post.get("id") or 0)
    source_url = message_url(username, post_id)
    external_id = message_external_id(username, post_id)
    base = {
        "sourceUrl": source_url,
        "externalId": external_id,
        "sourceName": channel["sourceName"],
        "username": username,
        "postId": post_id,
        "publishedAt": published_at(post),
    }
    text = post.get("text") or ""
    images = list(post.get("images") or [])[:MAX_IMAGE_URLS]
    source = {
        "type": "TELEGRAM",
        "source": "TELEGRAM",
        "name": channel["sourceName"],
        "url": source_url,
        "sourceUrl": source_url,
        "default_city": channel["default_city"],
        "externalId": external_id,
    }
    run = run_process_post(text, source=source, images=images or None, fetch=fetch, ocr=ocr)
    records = []
    for item in run.records:
        item["source"] = "TELEGRAM"
        item["sourceName"] = channel["sourceName"]
        item["sourceUrl"] = source_url
        if not item.get("sourcePostExternalId"):
            item["sourcePostExternalId"] = external_id
        if not item.get("externalId"):
            item["externalId"] = external_id
        if base["publishedAt"] and not item.get("publishedAt"):
            item["publishedAt"] = base["publishedAt"]
        records.append(item)
    return {
        **base,
        "records": records,
        "reject_reason": run.reject_reason,
        "vacancy_verdict": run.vacancy_verdict,
        "svo_verdict": run.svo_verdict,
        "filter_score": run.filter_score,
        "filter_reasons": list(run.filter_reasons),
        "ocr_text": run.ocr_text,
        "text": text,
        "images": images,
    }


def rejected_entry(result: dict[str, Any], reason: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "TELEGRAM",
        "sourceName": result.get("sourceName"),
        "sourceUrl": result.get("sourceUrl"),
        "externalId": result.get("externalId"),
        "reason": reason,
        "vacancyVerdict": result.get("vacancy_verdict"),
        "svoVerdict": result.get("svo_verdict"),
        "filterScore": result.get("filter_score"),
        "filterReasons": result.get("filter_reasons") or [],
        "preview": preview_text(result.get("text") or result.get("ocr_text") or ""),
    }
    if extra:
        payload.update(extra)
    return payload


def write_summary(stats: dict[str, Any], path: Path | None = None) -> Path:
    target = path or (ensure_logs_dir() / "summary.md")
    lines = [
        "## Парсер Telegram",
        "",
        f"- собрано постов: **{stats.get('fetched', 0)}**",
        f"- принято конвейером (единиц): **{stats.get('accepted', 0)}**",
        f"- спорных (maybe): **{stats.get('maybe', 0)}**",
        f"- отброшено: **{stats.get('rejected', 0)}** (из них СВО: **{stats.get('rejected_svo', 0)}**)",
        f"- пропущено по городу: **{stats.get('skipped_city', 0)}**",
        f"- единиц из разрезанных постов: **{stats.get('split_units', 0)}**",
        f"- старше окна (--since-hours): **{stats.get('skipped_old', 0)}**",
        f"- добавлено в базу: **{stats.get('added', 0)}**",
        f"- обновлено: **{stats.get('updated', 0)}**",
        f"- на модерации: **{stats.get('pending', 0)}**",
        f"- ошибок пачки: **{stats.get('errors', 0)}**",
        "",
    ]
    if stats.get("dry_run"):
        lines.append("_Режим --dry-run: на сайт ничего не отправляли._")
        lines.append("")
    if stats.get("note"):
        lines.append(str(stats["note"]))
        lines.append("")
    target.write_text("\n".join(lines), encoding="utf-8")
    return target


def print_summary(stats: dict[str, Any]) -> None:
    print()
    print("Итог парсера Telegram")
    print(f"  собрано постов:              {stats.get('fetched', 0)}")
    print(f"  принято (единиц):            {stats.get('accepted', 0)}")
    print(f"  спорных (maybe):             {stats.get('maybe', 0)}")
    print(f"  отброшено:                   {stats.get('rejected', 0)} (СВО: {stats.get('rejected_svo', 0)})")
    print(f"  пропущено по городу:         {stats.get('skipped_city', 0)}")
    print(f"  единиц из разрезанных постов:{stats.get('split_units', 0)}")
    print(f"  старше окна:                 {stats.get('skipped_old', 0)}")
    print(f"  добавлено в базу:            {stats.get('added', 0)}")
    print(f"  обновлено:                   {stats.get('updated', 0)}")
    print(f"  на модерации:                {stats.get('pending', 0)}")
    print(f"  ошибок пачки:                {stats.get('errors', 0)}")


def empty_stats(*, dry_run: bool, note: str) -> dict[str, Any]:
    return {
        "fetched": 0,
        "accepted": 0,
        "maybe": 0,
        "rejected": 0,
        "rejected_svo": 0,
        "skipped_city": 0,
        "split_units": 0,
        "skipped_old": 0,
        "added": 0,
        "updated": 0,
        "pending": 0,
        "errors": 0,
        "dry_run": dry_run,
        "note": note,
    }


class ChannelReader:
    """Читает канал и отдаёт сырые сообщения (ещё не альбомы). Для тестов — заглушка."""

    def messages(self, username: str, limit: int) -> list[dict[str, Any]]:
        raise NotImplementedError

    def fetch_image(self, url: str) -> bytes:
        raise FileNotFoundError(url)


class TelethonReader(ChannelReader):
    """Обёртка Telethon: FloodWait ловим здесь, HTML t.me не открываем."""

    ACCESS_ERROR_NAMES = {
        "ChannelPrivateError",
        "ChannelInvalidError",
        "UsernameInvalidError",
        "UsernameNotOccupiedError",
        "UsernameNotOccupied",
        "ChatAdminRequiredError",
        "UserBannedInChannelError",
        "PeerIdInvalidError",
    }

    def __init__(
        self,
        client: Any,
        *,
        sleep: Sleeper,
        download_media: bool = True,
    ) -> None:
        self.client = client
        self.sleep = sleep
        self.download_media = download_media
        self.media: dict[str, bytes] = {}

    def fetch_image(self, url: str) -> bytes:
        data = self.media.get(url)
        if data:
            return data
        raise FileNotFoundError(url)

    def messages(self, username: str, limit: int) -> list[dict[str, Any]]:
        def _load() -> list[Any]:
            return list(self.client.iter_messages(username, limit=max(1, min(limit, MAX_HISTORY))))

        try:
            raw = call_with_flood_wait(_load, self.sleep)
        except Exception as exc:
            if type(exc).__name__ in self.ACCESS_ERROR_NAMES:
                raise TgAccessError(str(exc)) from exc
            raise
        raw = self._complete_album_tail(username, raw)
        converted: list[dict[str, Any]] = []
        for msg in raw:
            item = self._to_dict(username, msg)
            if item:
                converted.append(item)
        return converted

    def _complete_album_tail(self, username: str, raw: list[Any]) -> list[Any]:
        if not raw:
            return raw
        oldest = raw[-1]
        gid = getattr(oldest, "grouped_id", None)
        if not gid:
            return raw
        oldest_id = int(getattr(oldest, "id", 0) or 0)
        if oldest_id <= 0:
            return raw

        def _extra() -> list[Any]:
            chunk: list[Any] = []
            for msg in self.client.iter_messages(username, limit=ALBUM_TAIL_EXTRA, offset_id=oldest_id):
                chunk.append(msg)
                if getattr(msg, "grouped_id", None) != gid:
                    break
            return chunk

        try:
            extra = call_with_flood_wait(_extra, self.sleep)
        except Exception as exc:
            if flood_seconds(exc) is not None:
                raise
            print(f"канал @{username}: не добрал хвост альбома ({redact(str(exc))})")
            return raw
        more = [msg for msg in extra if getattr(msg, "grouped_id", None) == gid]
        return list(raw) + more

    def _to_dict(self, username: str, msg: Any) -> dict[str, Any] | None:
        if getattr(msg, "action", None) is not None:
            return None
        mid = getattr(msg, "id", None)
        if mid is None:
            return None
        text = (getattr(msg, "message", None) or getattr(msg, "raw_text", None) or "") or ""
        images: list[str] = []
        if self._has_image(msg):
            url = attachment_url(username, int(mid), 0)
            images.append(url)
            if self.download_media:
                data = self._download(msg)
                if data:
                    self.media[url] = data
        return {
            "id": int(mid),
            "grouped_id": getattr(msg, "grouped_id", None),
            "text": text,
            "images": images,
            "date": getattr(msg, "date", None),
            "username": username,
        }

    def _has_image(self, msg: Any) -> bool:
        if getattr(msg, "photo", None):
            return True
        file = getattr(msg, "file", None)
        mime = (getattr(file, "mime_type", None) or "") if file is not None else ""
        if str(mime).lower().startswith("image/"):
            return True
        ext = (getattr(file, "ext", None) or "") if file is not None else ""
        return str(ext).lower() in {"jpg", "jpeg", "png", "webp", "gif"}

    def _download(self, msg: Any) -> bytes | None:
        def _go() -> Any:
            return self.client.download_media(msg, file=bytes)

        try:
            data = call_with_flood_wait(_go, self.sleep)
        except Exception as exc:
            if flood_seconds(exc) is not None:
                raise
            print(f"вложение {getattr(msg, 'id', '?')}: {redact(str(exc))}")
            return None
        return data if isinstance(data, bytes) and data else None


def create_telegram_client(*, session: str, api_id: int, api_hash: str, use_ipv6: bool) -> Any:
    from telethon.sessions import StringSession
    from telethon.sync import TelegramClient

    return TelegramClient(
        StringSession(session),
        api_id,
        api_hash,
        flood_sleep_threshold=0,
        timeout=15,
        connection_retries=2,
        retry_delay=1,
        use_ipv6=use_ipv6,
    )


def connect_telethon(*, sleep: Sleeper | None = None) -> Any:
    try:
        from telethon.sessions import StringSession  # noqa: F401
        from telethon.sync import TelegramClient  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            "Нет пакета telethon. Из корня проекта:\n"
            "  python -m pip install -r requirements.txt"
        ) from exc
    sleeper = sleep or time.sleep
    session = tg_session()
    api_id = tg_api_id()
    api_hash = tg_api_hash()
    last_error: BaseException | None = None
    for use_ipv6 in (False, True):
        label = "IPv6" if use_ipv6 else "IPv4"
        client = create_telegram_client(
            session=session,
            api_id=api_id,
            api_hash=api_hash,
            use_ipv6=use_ipv6,
        )
        try:
            call_with_flood_wait(client.connect, sleeper)
            if not client.is_user_authorized():
                client.disconnect()
                raise SystemExit(
                    "Строка TG_SESSION недействительна или вход не завершён.\n"
                    "Создай заново: python scripts/make_tg_session.py"
                )
            if use_ipv6:
                print("Telegram: соединение по IPv6 (по IPv4 датацентр не ответил).")
            return client
        except SystemExit:
            raise
        except Exception as exc:
            last_error = exc
            print(f"Telegram: вход по {label} не удался ({type(exc).__name__}).")
            try:
                client.disconnect()
            except Exception:
                pass
    raise SystemExit(
        "Не удалось подключиться к Telegram. "
        f"{redact(str(last_error) if last_error else '')}\n"
        "Провайдер мог закрыть IPv4 до датацентров Telegram. Проверь VPN или сеть."
    )


def run_parser(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    since_hours: float | None = None,
    reader: ChannelReader | None = None,
    channels: list[dict[str, Any]] | None = None,
    fetch: Any = None,
    ocr: Any = None,
    http_post: Any = None,
    sleep: Sleeper | None = None,
    rejected_path: Path | None = None,
    gap_sec: float | None = None,
) -> dict[str, Any]:
    sleeper = sleep or time.sleep
    pause = DEFAULT_GAP_SEC if gap_sec is None else gap_sec

    if not source_tg_enabled():
        stats = empty_stats(
            dry_run=dry_run,
            note="SOURCE_TG_ENABLED=false — источник выключен, запросов к Telegram не было.",
        )
        print(stats["note"])
        write_summary(stats)
        return stats

    channel_list = channels if channels is not None else enabled_channels()
    if not channel_list:
        stats = empty_stats(
            dry_run=dry_run,
            note=(
                "В scripts/sources_tg.json нет включённых каналов. "
                "Пришли username горловских каналов с вакансиями — заполним вместе."
            ),
        )
        print(stats["note"])
        write_summary(stats)
        return stats

    own_client: Any = None
    channel_reader = reader
    if channel_reader is None:
        own_client = connect_telethon(sleep=sleeper)
        ocr_on = (os.environ.get("OCR_PROVIDER") or "none").strip().lower() not in {
            "",
            "none",
            "off",
            "0",
        }
        channel_reader = TelethonReader(own_client, sleep=sleeper, download_media=ocr_on)

    remaining = limit
    to_upload: list[dict[str, Any]] = []
    maybe_records: list[dict[str, Any]] = []
    fetched = 0
    rejected = 0
    rejected_svo = 0
    skipped_city = 0
    split_units = 0
    skipped_old = 0
    log_path = rejected_path or rejected_log_path()
    active = set(active_cities())
    since_ts = None
    if since_hours is not None and since_hours > 0:
        since_ts = int(time.time() - float(since_hours) * 3600)
    image_fetch = fetch
    if image_fetch is None and hasattr(channel_reader, "fetch_image"):
        image_fetch = channel_reader.fetch_image

    try:
        for index, channel in enumerate(channel_list):
            if remaining is not None and remaining <= 0:
                break
            if index and pause > 0:
                sleeper(pause)
            if since_ts is not None:
                want = MAX_HISTORY
            elif remaining is None:
                want = channel["count"]
            else:
                want = min(channel["count"], remaining)
            try:
                raw_messages = call_with_flood_wait(
                    lambda ch=channel, n=want: channel_reader.messages(ch["username"], n),
                    sleeper,
                )
            except TgAccessError as exc:
                print(
                    f"Канал «{channel['sourceName']}»: {exc}. Пропускаю (Закон 19: не обходим)."
                )
                write_rejected(
                    {
                        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "source": "TELEGRAM",
                        "sourceName": channel["sourceName"],
                        "reason": "api_denied",
                        "detail": str(exc),
                        "preview": "",
                    },
                    log_path,
                )
                continue
            except Exception as exc:
                if type(exc).__name__ in TelethonReader.ACCESS_ERROR_NAMES:
                    print(
                        f"Канал «{channel['sourceName']}»: {exc}. Пропускаю (Закон 19: не обходим)."
                    )
                    write_rejected(
                        {
                            "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                            "source": "TELEGRAM",
                            "sourceName": channel["sourceName"],
                            "reason": "api_denied",
                            "detail": str(exc),
                            "preview": "",
                        },
                        log_path,
                    )
                    continue
                raise
            tagged: list[dict[str, Any]] = []
            for item in raw_messages:
                if not isinstance(item, dict):
                    continue
                row = dict(item)
                row["username"] = channel["username"]
                tagged.append(row)
            posts = merge_albums(tagged)
            fresh: list[dict[str, Any]] = []
            for post in posts:
                if since_ts is None or message_unix(post) >= since_ts:
                    fresh.append(post)
                else:
                    skipped_old += 1
            if remaining is not None:
                fresh = fresh[:remaining]
            label = (
                f"Канал «{channel['sourceName']}»: {len(fresh)} постов за окно"
                if since_ts
                else f"Канал «{channel['sourceName']}»: {len(fresh)} постов"
            )
            print(label)
            for post in fresh:
                fetched += 1
                if remaining is not None:
                    remaining -= 1
                result = process_tg_post(post, channel, fetch=image_fetch, ocr=ocr)
                records = list(result["records"])
                if not records:
                    reason = result.get("reject_reason") or "empty"
                    if reason in {"svo", "hidden_svo"}:
                        rejected_svo += 1
                    rejected += 1
                    write_rejected(rejected_entry(result, reason), log_path)
                    continue
                kept: list[dict[str, Any]] = []
                for record in records:
                    city = record.get("citySlug")
                    if city and city not in active:
                        skipped_city += 1
                        write_rejected(
                            rejected_entry(
                                result,
                                "city_not_active",
                                extra={"citySlug": city, "externalId": record.get("externalId")},
                            ),
                            log_path,
                        )
                        continue
                    if record.get("vacancyVerdict") == "maybe":
                        maybe_records.append(record)
                    kept.append(record)
                if len(kept) > 1:
                    split_units += len(kept)
                if dry_run:
                    total = len(kept)
                    for rec_index, record in enumerate(kept, start=1):
                        print_record(record, rec_index, total)
                to_upload.extend(kept)
    finally:
        if own_client is not None:
            try:
                own_client.disconnect()
            except Exception:
                pass

    accepted = len(to_upload)
    maybe_count = len(maybe_records)
    stats: dict[str, Any] = {
        "fetched": fetched,
        "accepted": accepted,
        "maybe": maybe_count,
        "rejected": rejected,
        "rejected_svo": rejected_svo,
        "skipped_city": skipped_city,
        "split_units": split_units,
        "skipped_old": skipped_old,
        "added": 0,
        "updated": 0,
        "pending": 0,
        "errors": 0,
        "dry_run": dry_run,
    }

    if dry_run:
        stats["note"] = "dry-run: пачку на сайт не отправляли."
        print_summary(stats)
        write_summary(stats)
        return stats

    if not to_upload:
        stats["note"] = "Нечего отправлять: конвейер не принял ни одной единицы."
        print_summary(stats)
        write_summary(stats)
        return stats

    secret = cron_secret()
    merged: list[dict[str, Any]] = []
    for batch in chunked(to_upload, UPLOAD_BATCH):
        merged.append(
            post_batch_with_retry(
                batch,
                secret=secret,
                parser="parser_tg",
                http_post=http_post,
                sleep=sleeper,
            )
        )
    upload = merge_upload_stats(merged)
    stats["added"] = upload["added"]
    stats["updated"] = upload["updated"]
    stats["pending"] = upload["pending"]
    stats["errors"] = upload["errors"]
    stats["maybe"] = upload["maybe"] or maybe_count
    stats["skipped_city"] += upload["skippedCity"]
    stats["rejected_svo"] += upload["discardedSvo"]
    for item in upload.get("skippedCityItems") or []:
        write_rejected(
            {
                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": "TELEGRAM",
                "reason": "city_not_active",
                "externalId": item.get("externalId") if isinstance(item, dict) else None,
                "preview": item.get("reason") if isinstance(item, dict) else str(item),
            },
            log_path,
        )
    for item in upload.get("errorItems") or []:
        write_rejected(
            {
                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": "TELEGRAM",
                "reason": "upload_error",
                "externalId": item.get("externalId") if isinstance(item, dict) else None,
                "preview": item.get("reason") if isinstance(item, dict) else str(item),
            },
            log_path,
        )
    print_summary(stats)
    write_summary(stats)
    return stats


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Парсер публичных каналов Telegram. Карточки собирает process_post, не этот файл."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Ничего не отправлять на сайт, только показать разобранные поля.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Сколько постов обработать всего (для проверки, например 5).",
    )
    parser.add_argument(
        "--since-hours",
        type=float,
        default=None,
        help="Только посты не старше N часов.",
    )
    parser.add_argument(
        "--site-url",
        default=None,
        help="Куда слать пачку, например https://terrikon-rabota.vercel.app. Иначе SITE_URL из .env.local.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    limit = args.limit if args.limit is None or args.limit > 0 else None
    if args.site_url:
        os.environ["SITE_URL"] = str(args.site_url).rstrip("/")
    target = site_url()
    if not args.dry_run:
        assert_ci_site_url(target)
    window = resolve_since_hours("parser_tg", args.since_hours, site=target)
    print(f"OCR_PROVIDER={os.environ.get('OCR_PROVIDER') or 'none'}")
    print(f"Режим: {'dry-run' if args.dry_run else 'отправка'}  SITE_URL={target if not args.dry_run else '—'}")
    print(f"Окно: последние {window:g} ч")
    try:
        run_parser(dry_run=args.dry_run, limit=limit, since_hours=window)
    except SystemExit as exc:
        write_summary(
            {
                "fetched": 0,
                "accepted": 0,
                "maybe": 0,
                "rejected": 0,
                "rejected_svo": 0,
                "skipped_city": 0,
                "split_units": 0,
                "skipped_old": 0,
                "added": 0,
                "updated": 0,
                "pending": 0,
                "errors": 0,
                "dry_run": args.dry_run,
                "note": str(exc),
            }
        )
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
