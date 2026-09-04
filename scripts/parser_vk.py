"""Парсер открытых стен ВКонтакте — первый живой источник вакансий.

Только официальный API (Закон 12 и 19). Карточку парсер не собирает:
текст и URL картинок отдаёт в process_post / run_process_post.
Токен — переменная VK_TOKEN, никогда не файл репозитория.
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

import requests

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

API_BASE = "https://api.vk.com/method"
DEFAULT_API_VERSION = "5.199"
USER_AGENT = "TerriconRabota/0.1 (parser-vk; https://github.com/SteveNoth/terrikon_rabota)"
SOURCES_PATH = _SCRIPTS / "sources_vk.json"
LOGS_DIR = ROOT / "logs"
MAX_WALL_COUNT = 100
UPLOAD_BATCH = 100
RETRY_PAUSES = (2.0, 4.0, 8.0)
DEFAULT_GAP_SEC = 1.5
MAX_IMAGE_URLS = 4

HttpPost = Callable[..., requests.Response]
Sleeper = Callable[[float], None]


class VkApiError(Exception):
    """Ответ API с error_code. Это «нельзя», если доступ закрыт — не обходим."""

    def __init__(self, code: int, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(f"VK API {code}: {message}")


def source_vk_enabled() -> bool:
    raw = (os.environ.get("SOURCE_VK_ENABLED") or "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def vk_token() -> str:
    value = (os.environ.get("VK_TOKEN") or "").strip()
    if not value:
        raise SystemExit(
            "Нет VK_TOKEN. Это пароль к официальному API ВКонтакте.\n"
            "Создай приложение и получи токен (шаги в docs/SETUP-LOG.md),\n"
            "затем вставь в .env.local строку VK_TOKEN=... и в GitHub Secrets.\n"
            "В репозиторий, в sources_vk.json и в логи токен класть нельзя."
        )
    return value


def api_version() -> str:
    return (os.environ.get("VK_API_VERSION") or DEFAULT_API_VERSION).strip() or DEFAULT_API_VERSION


def request_gap_sec() -> float:
    raw = os.environ.get("VK_REQUEST_GAP_SEC")
    if not raw:
        return DEFAULT_GAP_SEC
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_GAP_SEC
    return max(0.0, min(value, 10.0))


def site_url() -> str:
    return (
        os.environ.get("SITE_URL")
        or os.environ.get("NEXT_PUBLIC_SITE_URL")
        or "http://127.0.0.1:3000"
    ).rstrip("/")


def cron_secret() -> str:
    value = (os.environ.get("CRON_SECRET") or "").strip()
    if len(value) < 32:
        raise SystemExit(
            "CRON_SECRET пустой или короче 32 символов. Без него дверь "
            "/api/parser/upload не откроется. Сгенерируй в PowerShell:\n"
            "[BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','').ToLower()\n"
            "и вставь в .env.local, Vercel и GitHub Secrets."
        )
    return value


def redact(text: str, token: str | None = None) -> str:
    """Чтобы токен случайно не попал в консоль и jsonl."""
    value = text or ""
    secrets = [item for item in (token, os.environ.get("VK_TOKEN"), os.environ.get("CRON_SECRET")) if item]
    for secret in secrets:
        if secret and secret in value:
            value = value.replace(secret, "[redacted]")
    return value


def load_sources(path: Path | None = None) -> dict[str, Any]:
    target = path or SOURCES_PATH
    with target.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit("scripts/sources_vk.json должен быть объектом, не массивом.")
    return data


def enabled_groups(data: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    payload = data if data is not None else load_sources()
    defaults = payload.get("defaults") or {}
    default_count = int(defaults.get("count") or 30)
    default_city = str(defaults.get("default_city") or "gorlovka")
    groups: list[dict[str, Any]] = []
    for raw in payload.get("groups") or []:
        if not isinstance(raw, dict):
            continue
        if not raw.get("enabled", True):
            continue
        screen_name = _clean_screen_name(raw.get("screen_name"))
        owner_id = _parse_owner_id(raw.get("owner_id"))
        if not screen_name and owner_id is None:
            print("Пропуск группы без screen_name и owner_id:", raw.get("sourceName") or raw)
            continue
        city = str(raw.get("default_city") or default_city).strip()
        if not city:
            print("Пропуск группы без default_city:", raw.get("sourceName") or screen_name)
            continue
        count = int(raw.get("count") or default_count)
        count = max(1, min(count, MAX_WALL_COUNT))
        groups.append(
            {
                "enabled": True,
                "screen_name": screen_name,
                "owner_id": owner_id,
                "sourceName": str(raw.get("sourceName") or screen_name or f"vk{owner_id}"),
                "default_city": city,
                "count": count,
            }
        )
    return groups


def _clean_screen_name(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == "example_replace_me":
        return None
    lowered = text.lower()
    for prefix in (
        "https://m.vk.com/",
        "https://m.vk.ru/",
        "http://m.vk.com/",
        "http://m.vk.ru/",
        "https://www.vk.com/",
        "https://www.vk.ru/",
        "https://vk.com/",
        "https://vk.ru/",
        "http://vk.com/",
        "http://vk.ru/",
    ):
        if lowered.startswith(prefix):
            text = text[len(prefix) :]
            break
    text = text.split("?")[0].strip("/")
    if text.startswith("public"):
        rest = text[6:]
        if rest.isdigit():
            return None
    return text or None


def _parse_owner_id(value: Any) -> int | None:
    """Знак как в API: группа отрицательная, личная стена — положительная."""
    if value is None or value == "":
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    if number == 0:
        return None
    return number


def owner_id_from_screen(screen: str | None) -> int | None:
    """club123 / public123 → группа, id123 → пользователь. Иначе None."""
    if not screen:
        return None
    if screen.startswith("id") and screen[2:].isdigit():
        return int(screen[2:])
    if screen.startswith("club") and screen[4:].isdigit():
        return -int(screen[4:])
    if screen.startswith("public") and screen[6:].isdigit():
        return -int(screen[6:])
    return None


def wall_url(owner_id: int, post_id: int) -> str:
    return f"https://vk.com/wall{owner_id}_{post_id}"


def wall_external_id(owner_id: int, post_id: int) -> str:
    return f"{owner_id}_{post_id}"


def original_post(post: dict[str, Any]) -> dict[str, Any]:
    """Вложенный репост: оригинал — последний элемент copy_history."""
    history = post.get("copy_history")
    if isinstance(history, list) and history:
        last = history[-1]
        if isinstance(last, dict):
            return last
    return post


def extract_text(post: dict[str, Any]) -> str:
    """Текст из оригинала, затем подпись обёртки, если она другая."""
    parts: list[str] = []
    history = post.get("copy_history")
    items: list[dict[str, Any]] = []
    if isinstance(history, list):
        items.extend(item for item in reversed(history) if isinstance(item, dict))
    items.append(post)
    for item in items:
        text = (item.get("text") or "").strip()
        if text and text not in parts:
            parts.append(text)
    return "\n\n".join(parts)


def _photo_url(photo: dict[str, Any]) -> str | None:
    sizes = photo.get("sizes")
    candidates: list[tuple[int, str]] = []
    if isinstance(sizes, list):
        for size in sizes:
            if not isinstance(size, dict):
                continue
            url = size.get("url") or size.get("src")
            if not url:
                continue
            width = int(size.get("width") or 0)
            candidates.append((width, str(url)))
    if candidates:
        candidates.sort(key=lambda item: item[0])
        return candidates[-1][1]
    for key in ("orig_photo",):
        nested = photo.get(key)
        if isinstance(nested, dict) and nested.get("url"):
            return str(nested["url"])
    return None


def _collect_attachment_urls(attachments: Any, into: list[str]) -> None:
    if not isinstance(attachments, list):
        return
    for item in attachments:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind == "photo" and isinstance(item.get("photo"), dict):
            url = _photo_url(item["photo"])
            if url:
                into.append(url)
        elif kind == "doc" and isinstance(item.get("doc"), dict):
            doc = item["doc"]
            ext = str(doc.get("ext") or "").lower()
            if ext in {"jpg", "jpeg", "png", "webp", "gif"} and doc.get("url"):
                into.append(str(doc["url"]))
            preview = doc.get("preview") or {}
            photo = preview.get("photo") if isinstance(preview, dict) else None
            if isinstance(photo, dict):
                url = _photo_url(photo)
                if url:
                    into.append(url)
        elif kind == "link" and isinstance(item.get("link"), dict):
            photo = item["link"].get("photo")
            if isinstance(photo, dict):
                url = _photo_url(photo)
                if url:
                    into.append(url)
        elif kind == "wall" and isinstance(item.get("wall"), dict):
            nested = item["wall"]
            _collect_attachment_urls(nested.get("attachments"), into)
            history = nested.get("copy_history")
            if isinstance(history, list):
                for entry in history:
                    if isinstance(entry, dict):
                        _collect_attachment_urls(entry.get("attachments"), into)


def extract_image_urls(post: dict[str, Any], *, max_urls: int = MAX_IMAGE_URLS) -> list[str]:
    """URL картинок с allowlist хостов ВК. Файлы не качаем и не пишем в git."""
    raw: list[str] = []
    original = original_post(post)
    _collect_attachment_urls(original.get("attachments"), raw)
    if original is not post:
        _collect_attachment_urls(post.get("attachments"), raw)
    history = post.get("copy_history")
    if isinstance(history, list):
        for entry in history:
            if isinstance(entry, dict):
                _collect_attachment_urls(entry.get("attachments"), raw)
    seen: set[str] = set()
    allowed: list[str] = []
    for url in raw:
        if url in seen:
            continue
        seen.add(url)
        if not image_url_allowed(url):
            continue
        allowed.append(url)
        if len(allowed) >= max_urls:
            break
    return allowed


class VkClient:
    """HTTPS к api.vk.com. Токен в теле POST, не в адресной строке."""

    def __init__(
        self,
        token: str,
        *,
        version: str | None = None,
        gap_sec: float | None = None,
        http_post: HttpPost | None = None,
        sleep: Sleeper | None = None,
    ) -> None:
        self.token = token
        self.version = version or api_version()
        self.gap_sec = DEFAULT_GAP_SEC if gap_sec is None else gap_sec
        self.http_post = http_post or requests.post
        self.sleep = sleep or time.sleep
        self._last_call = 0.0

    def _pace(self) -> None:
        if self.gap_sec <= 0:
            return
        wait = (self._last_call + self.gap_sec) - time.monotonic()
        if wait > 0:
            self.sleep(wait)
        self._last_call = time.monotonic()

    def call(self, method: str, params: dict[str, Any]) -> Any:
        self._pace()
        payload = {key: value for key, value in params.items() if value is not None}
        payload["access_token"] = self.token
        payload["v"] = self.version
        url = f"{API_BASE}/{method}"
        last_error: Exception | None = None
        for attempt in range(3):
            if attempt:
                self.sleep(RETRY_PAUSES[attempt - 1])
            try:
                response = self.http_post(
                    url,
                    data=payload,
                    headers={"User-Agent": USER_AGENT},
                    timeout=30,
                )
            except requests.RequestException as exc:
                last_error = exc
                continue
            try:
                body = response.json()
            except ValueError as exc:
                last_error = exc
                continue
            error = body.get("error") if isinstance(body, dict) else None
            if isinstance(error, dict):
                code = int(error.get("error_code") or 0)
                message = str(error.get("error_msg") or "unknown")
                if code in {6, 9, 10, 29} and attempt < 2:
                    last_error = VkApiError(code, message)
                    continue
                raise VkApiError(code, message)
            if response.status_code >= 500 and attempt < 2:
                last_error = RuntimeError(f"HTTP {response.status_code}")
                continue
            if response.status_code >= 400:
                raise VkApiError(response.status_code, redact(response.text[:300], self.token))
            return body.get("response") if isinstance(body, dict) else body
        raise SystemExit(
            f"VK API {method}: не удалось за 3 попытки. "
            f"{redact(str(last_error), self.token) if last_error else ''}"
        )

    def resolve_owner_id(self, group: dict[str, Any]) -> int:
        if group.get("owner_id") is not None:
            return int(group["owner_id"])
        screen = group.get("screen_name")
        if not screen:
            raise VkApiError(100, "нет screen_name и owner_id")
        from_screen = owner_id_from_screen(screen)
        if from_screen is not None:
            return from_screen
        response = self.call("groups.getById", {"group_id": screen})
        items = response if isinstance(response, list) else (response.get("groups") if isinstance(response, dict) else None)
        if not items:
            raise VkApiError(100, f"группа {screen} не найдена")
        first = items[0]
        return -int(first["id"])

    def wall_get(self, owner_id: int, count: int, domain: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "owner_id": owner_id,
            "count": max(1, min(count, MAX_WALL_COUNT)),
            "filter": "owner",
        }
        if domain:
            params["domain"] = domain
        response = self.call("wall.get", params)
        if isinstance(response, dict):
            items = response.get("items") or []
        elif isinstance(response, list):
            items = response
        else:
            items = []
        return [item for item in items if isinstance(item, dict)]


def post_unix(post: dict[str, Any]) -> int:
    try:
        return int(post.get("date") or 0)
    except (TypeError, ValueError):
        return 0


def post_within_since(post: dict[str, Any], since_ts: int | None) -> bool:
    """Стена ВК идёт от новых к старым. None — без фильтра по времени."""
    if since_ts is None:
        return True
    return post_unix(post) >= since_ts


def skip_closed_content(post: dict[str, Any]) -> str | None:
    donut = post.get("donut")
    if isinstance(donut, dict) and donut.get("is_donut"):
        return "donut"
    if post.get("is_deleted"):
        return "deleted"
    return None


def process_vk_item(
    post: dict[str, Any],
    group: dict[str, Any],
    owner_id: int,
    *,
    fetch: Any = None,
    ocr: Any = None,
) -> dict[str, Any]:
    """Один пост → записи process_post или причина отброса. Карточку не собираем."""
    post_id = int(post.get("id") or 0)
    source_url = wall_url(owner_id, post_id)
    external_id = wall_external_id(owner_id, post_id)
    closed = skip_closed_content(post)
    base = {
        "sourceUrl": source_url,
        "externalId": external_id,
        "sourceName": group["sourceName"],
        "ownerId": owner_id,
        "postId": post_id,
        "publishedAt": _post_published_at(post),
    }
    if closed:
        return {**base, "records": [], "reject_reason": closed, "text": "", "images": []}
    text = extract_text(post)
    images = extract_image_urls(post)
    source = {
        "type": "VK",
        "source": "VK",
        "name": group["sourceName"],
        "url": source_url,
        "sourceUrl": source_url,
        "default_city": group["default_city"],
        "externalId": external_id,
    }
    run = run_process_post(text, source=source, images=images or None, fetch=fetch, ocr=ocr)
    records = []
    for item in run.records:
        item["source"] = "VK"
        item["sourceName"] = group["sourceName"]
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


def _post_published_at(post: dict[str, Any]) -> str | None:
    stamp = post.get("date")
    if not stamp:
        return None
    try:
        return datetime.fromtimestamp(int(stamp), timezone.utc).isoformat().replace("+00:00", "Z")
    except (OSError, OverflowError, ValueError):
        return None


def ensure_logs_dir() -> Path:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    return LOGS_DIR


def rejected_log_path(now: datetime | None = None) -> Path:
    day = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    return ensure_logs_dir() / f"rejected_{day}.jsonl"


def write_rejected(entry: dict[str, Any], path: Path | None = None) -> None:
    target = path or rejected_log_path()
    line = json.dumps(entry, ensure_ascii=False)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def preview_text(text: str, limit: int = 200) -> str:
    compact = " ".join((text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


def rejected_entry(result: dict[str, Any], reason: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "VK",
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


def print_record(record: dict[str, Any], index: int, total: int) -> None:
    salary_from = record.get("salaryFrom")
    salary_to = record.get("salaryTo")
    if salary_from and salary_to and salary_from != salary_to:
        salary = f"{salary_from}–{salary_to}"
    else:
        salary = salary_from or salary_to or "—"
    print(f"--- {record.get('externalId')} ({index}/{total})")
    print(f"  title: {record.get('title')}")
    print(f"  city: {record.get('citySlug') or '—'}  format: {record.get('workFormat') or '—'}")
    print(f"  salary: {salary}  phone: {record.get('contactPhone') or '—'}")
    print(f"  sourceUrl: {record.get('sourceUrl')}")
    print(
        f"  completeness: {record.get('completeness')}  trust: {record.get('trustScore')}  "
        f"moderation: {record.get('moderationStatus')}  verdict: {record.get('vacancyVerdict')}"
    )
    if record.get("splitIndex"):
        print(f"  splitIndex: {record.get('splitIndex')}  sourcePost: {record.get('sourcePostExternalId')}")
    summary = record.get("summaryLine")
    if summary:
        print(f"  summary: {summary}")


def post_batch_with_retry(
    items: list[dict[str, Any]],
    *,
    secret: str,
    parser: str = "parser_vk",
    http_post: HttpPost | None = None,
    sleep: Sleeper | None = None,
) -> dict[str, Any]:
    """Пачка на /api/parser/upload. 3 попытки с паузой 2, 4, 8 секунд."""
    url = f"{site_url()}/api/parser/upload"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Bearer {secret}",
        "User-Agent": USER_AGENT,
    }
    body = {
        "parser": parser,
        "vacancies": items,
        "startedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    poster = http_post or requests.post
    sleeper = sleep or time.sleep
    last_error: Exception | None = None
    last_status: int | None = None
    last_text = ""
    for attempt in range(3):
        if attempt:
            sleeper(RETRY_PAUSES[attempt - 1])
        try:
            response = poster(url, headers=headers, json=body, timeout=90)
        except requests.RequestException as exc:
            last_error = exc
            continue
        last_status = response.status_code
        last_text = response.text[:500]
        if response.status_code == 200:
            try:
                data = response.json()
            except ValueError:
                raise SystemExit("Сервер вернул 200, но это не JSON.") from None
            if not isinstance(data, dict):
                raise SystemExit("Сервер вернул 200, но не объект.")
            return data
        if response.status_code in {401, 403}:
            raise SystemExit(
                f"Дверь парсера закрыта (HTTP {response.status_code}). "
                "Проверь CRON_SECRET: одно и то же значение в .env.local, Vercel и GitHub Secrets."
            )
        if response.status_code in {400, 413}:
            raise SystemExit(f"Пачку не приняли (HTTP {response.status_code}): {redact(last_text)}")
        last_error = RuntimeError(f"HTTP {response.status_code}: {redact(last_text)}")
    detail = redact(str(last_error) if last_error else last_text)
    raise SystemExit(
        f"Не удалось отправить пачку за 3 попытки "
        f"(последний статус {last_status}). {detail}"
    )


def chunked(items: list[dict[str, Any]], size: int = UPLOAD_BATCH) -> list[list[dict[str, Any]]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def merge_upload_stats(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    totals = {
        "added": 0,
        "updated": 0,
        "pending": 0,
        "blocked": 0,
        "maybe": 0,
        "skippedCity": 0,
        "discardedSvo": 0,
        "errors": 0,
        "duplicates": 0,
    }
    keys = {
        "added": ("added", "добавлено"),
        "updated": ("updated", "обновлено"),
        "pending": ("pending", "наМодерации"),
        "blocked": ("blocked", "заблокировано"),
        "maybe": ("maybe",),
        "skippedCity": ("skippedCity", "пропущеноПоГороду"),
        "discardedSvo": ("discardedSvo", "отброшеноКакСВО"),
        "errors": ("errors", "ошибок"),
        "duplicates": ("duplicates", "дублей"),
    }
    skipped_items: list[Any] = []
    error_items: list[Any] = []
    for data in chunks:
        for dest, aliases in keys.items():
            for alias in aliases:
                if alias in data and data[alias] is not None:
                    totals[dest] += int(data[alias] or 0)
                    break
        skipped_items.extend(data.get("пропускиПоГороду") or data.get("skippedCityItems") or [])
        error_items.extend(data.get("ошибки") or data.get("errorItems") or [])
    totals["skippedCityItems"] = skipped_items
    totals["errorItems"] = error_items
    return totals


def write_summary(stats: dict[str, Any], path: Path | None = None) -> Path:
    target = path or (ensure_logs_dir() / "summary.md")
    lines = [
        "## Парсер ВКонтакте",
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
    print("Итог парсера ВК")
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


def run_parser(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    since_hours: float | None = None,
    client: VkClient | None = None,
    groups: list[dict[str, Any]] | None = None,
    fetch: Any = None,
    ocr: Any = None,
    http_post: HttpPost | None = None,
    sleep: Sleeper | None = None,
    rejected_path: Path | None = None,
) -> dict[str, Any]:
    if not source_vk_enabled():
        stats = {
            "fetched": 0,
            "accepted": 0,
            "maybe": 0,
            "rejected": 0,
            "rejected_svo": 0,
            "skipped_city": 0,
            "split_units": 0,
            "added": 0,
            "updated": 0,
            "pending": 0,
            "errors": 0,
            "dry_run": dry_run,
            "note": "SOURCE_VK_ENABLED=false — источник выключен, запросов к API не было.",
        }
        print(stats["note"])
        write_summary(stats)
        return stats

    group_list = groups if groups is not None else enabled_groups()
    if not group_list:
        stats = {
            "fetched": 0,
            "accepted": 0,
            "maybe": 0,
            "rejected": 0,
            "rejected_svo": 0,
            "skipped_city": 0,
            "split_units": 0,
            "added": 0,
            "updated": 0,
            "pending": 0,
            "errors": 0,
            "dry_run": dry_run,
            "note": (
                "В scripts/sources_vk.json нет включённых групп. "
                "Пришли 5–10 адресов горловских групп с вакансиями — заполним вместе."
            ),
        }
        print(stats["note"])
        write_summary(stats)
        return stats

    vk = client or VkClient(vk_token(), sleep=sleep)
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

    for group in group_list:
        if remaining is not None and remaining <= 0:
            break
        try:
            owner_id = vk.resolve_owner_id(group)
        except VkApiError as exc:
            print(f"Группа «{group['sourceName']}»: {exc}. Пропускаю (Закон 19: не обходим).")
            write_rejected(
                {
                    "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "source": "VK",
                    "sourceName": group["sourceName"],
                    "reason": "api_denied",
                    "detail": str(exc.code),
                    "preview": "",
                },
                log_path,
            )
            continue
        if since_ts is not None:
            want = MAX_WALL_COUNT
        elif remaining is None:
            want = group["count"]
        else:
            want = min(group["count"], remaining)
        try:
            posts = vk.wall_get(owner_id, want, domain=group.get("screen_name"))
        except VkApiError as exc:
            print(f"Стена «{group['sourceName']}»: {exc}. Пропускаю.")
            write_rejected(
                {
                    "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "source": "VK",
                    "sourceName": group["sourceName"],
                    "reason": "api_denied",
                    "detail": str(exc.code),
                    "preview": "",
                },
                log_path,
            )
            continue
        fresh: list[dict[str, Any]] = []
        for post in posts:
            if post_within_since(post, since_ts):
                fresh.append(post)
            else:
                skipped_old += 1
                break
        if remaining is not None:
            fresh = fresh[:remaining]
        print(f"Группа «{group['sourceName']}»: {len(fresh)} постов за окно" if since_ts else f"Группа «{group['sourceName']}»: {len(fresh)} постов")
        for post in fresh:
            fetched += 1
            if remaining is not None:
                remaining -= 1
            result = process_vk_item(post, group, owner_id, fetch=fetch, ocr=ocr)
            records = list(result["records"])
            if not records:
                reason = result.get("reject_reason") or "empty"
                if reason == "svo" or reason == "hidden_svo":
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
                        rejected_entry(result, "city_not_active", extra={"citySlug": city, "externalId": record.get("externalId")}),
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
                for index, record in enumerate(kept, start=1):
                    print_record(record, index, total)
            to_upload.extend(kept)

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
    for chunk in chunked(to_upload):
        merged.append(post_batch_with_retry(chunk, secret=secret, http_post=http_post, sleep=sleep))
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
                "source": "VK",
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
                "source": "VK",
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
        description="Парсер открытых стен ВК. Карточки собирает process_post, не этот файл."
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
        help="Только посты не старше N часов (стена от новых к старым).",
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
    window = resolve_since_hours("parser_vk", args.since_hours, site=target)
    print(f"API v={api_version()}  OCR_PROVIDER={os.environ.get('OCR_PROVIDER') or 'none'}")
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
