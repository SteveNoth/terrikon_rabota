"""Парсер сайтов предприятий — класс COMPANY_SITE (Закон 12 и 19).

Сначала requests + BeautifulSoup. Playwright — только если страница без JS
пустая и в конфиге javascript=true (браузер дорогой по минутам Actions).
Карточку парсер не собирает: текст отдаёт в process_post.
robots.txt читаем до обхода и не ходим по запрещённым путям.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import requests

_SCRIPTS = Path(__file__).resolve().parent
ROOT = _SCRIPTS.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from parser_env import load_env
from parser_lookback import assert_ci_site_url
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

try:
    from bs4 import BeautifulSoup
    from bs4.element import Tag
except ImportError:  # pragma: no cover - зависимость в requirements.txt
    BeautifulSoup = None  # type: ignore[misc, assignment]
    Tag = Any  # type: ignore[misc, assignment]

try:
    import soupsieve as sv
except ImportError:  # pragma: no cover
    sv = None

CONFIG_PATH = _SCRIPTS / "config_web.json"
LOGS_DIR = ROOT / "logs"
UPLOAD_BATCH = 100
RETRY_PAUSES = (2.0, 4.0, 8.0)
DEFAULT_PAUSE = 2.0
PAUSE_MIN = 1.0
PAUSE_MAX = 3.0
MAX_PAGES_CAP = 20
MAX_ITEMS_CAP = 200
FETCH_TIMEOUT = 30
BLOCKED_HOST_SUFFIXES = (
    "hh.ru",
    "hhcdn.ru",
    "avito.ru",
    "youla.ru",
    "ok.ru",
    "odnoklassniki.ru",
    "m-czn.ru",
    "trudvsem.ru",
)
AUTH_PATH_MARKERS = (
    "/login",
    "/signin",
    "/wp-admin",
    "/administrator/",
    "/manager/",
    "/auth/",
)
CONTACT_SKIP_MARKERS = (
    "обращаться",
    "подробной информацией",
    "понедельник",
    "вторник",
    "среда",
    "четверг",
    "пятница",
    "выходной",
)

HttpGet = Callable[..., requests.Response]
Sleeper = Callable[[float], None]
HtmlGetter = Callable[[str], "FetchResult"]


class RobotsDenied(Exception):
    """Путь запрещён robots.txt. Это «нельзя», не задача на обход."""

    def __init__(self, url: str, rule: str) -> None:
        self.url = url
        self.rule = rule
        super().__init__(f"robots.txt запрещает {url} ({rule})")


class LayoutBroken(Exception):
    """Селектор ничего не нашёл на живой странице — вероятно, сменилась вёрстка."""

    def __init__(self, site_name: str, url: str) -> None:
        self.site_name = site_name
        self.url = url
        super().__init__(f"сайт {site_name}: 0 элементов, вероятно, изменилась вёрстка")


def source_web_enabled() -> bool:
    raw = (os.environ.get("SOURCE_WEB_ENABLED") or "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def user_agent() -> str:
    site = (
        os.environ.get("NEXT_PUBLIC_SITE_URL")
        or os.environ.get("SITE_URL")
        or "https://terrikon-rabota.vercel.app"
    ).rstrip("/")
    return (
        f"TerriconRabota/0.1 (parser-web; +{site}; "
        "https://github.com/SteveNoth/terrikon_rabota)"
    )


def need_bs4() -> None:
    if BeautifulSoup is None:
        raise SystemExit(
            "Нет beautifulsoup4. Из корня проекта: "
            ".\\.venv\\Scripts\\pip.exe install -r requirements.txt"
        )


def redact(text: str) -> str:
    value = text or ""
    secret = (os.environ.get("CRON_SECRET") or "").strip()
    if secret and secret in value:
        value = value.replace(secret, "[redacted]")
    return value


def canon_url(url: str) -> str:
    parsed = urlparse(url.strip())
    scheme = (parsed.scheme or "https").lower()
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"
    query = urlencode(sorted(parse_qsl(parsed.query, keep_blank_values=True)))
    return urlunparse((scheme, netloc, path, "", query, ""))


def absolute_url(base: str, href: str | None) -> str | None:
    if not href:
        return None
    raw = str(href).strip()
    if not raw or raw.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
        return None
    return urljoin(base, raw)


def host_of(url: str) -> str:
    return urlparse(url).netloc.lower()


def same_host(left: str, right: str) -> bool:
    a, b = host_of(left), host_of(right)
    if not a or not b:
        return False
    return a == b or a.endswith("." + b) or b.endswith("." + a)


def is_blocked_host(url: str) -> bool:
    host = host_of(url)
    return any(host == suffix or host.endswith("." + suffix) for suffix in BLOCKED_HOST_SUFFIXES)


def looks_auth_url(url: str) -> bool:
    path = (urlparse(url).path or "").lower()
    return any(marker in path for marker in AUTH_PATH_MARKERS)


def _wildcard_to_regex(pattern: str) -> re.Pattern[str]:
    """Google/Yandex: * — любая последовательность, $ — конец. Иначе буквально."""
    body = pattern.strip()
    anchored_end = body.endswith("$")
    if anchored_end:
        body = body[:-1]
    parts = [re.escape(chunk) for chunk in body.split("*")]
    regex = ".*".join(parts)
    if not regex.startswith("/"):
        regex = ".*" + regex
    if anchored_end:
        regex += "$"
    return re.compile(regex, re.I)


@dataclass
class RobotsGroup:
    agents: list[str]
    delay: float | None = None
    rules: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class RobotsFile:
    url: str
    status: int
    groups: list[RobotsGroup]
    fetch_ok: bool
    raw: str = ""

    def allowed(self, url: str, ua: str) -> tuple[bool, str]:
        if not self.fetch_ok:
            return False, "robots_unreadable"
        if self.status in {404, 410}:
            return True, "no_robots"
        if self.status >= 400:
            return False, f"robots_http_{self.status}"
        group = self._group_for(ua)
        if group is None:
            return True, "no_matching_group"
        parsed = urlparse(url)
        target = parsed.path or "/"
        if parsed.query:
            target += "?" + parsed.query
        best: tuple[int, str, str] | None = None
        for kind, pattern in group.rules:
            if not pattern:
                continue
            if _wildcard_to_regex(pattern).search(target):
                length = len(pattern)
                if best is None or length > best[0]:
                    best = (length, kind, pattern)
                elif length == best[0] and kind == "allow" and best[1] == "disallow":
                    best = (length, kind, pattern)
        if best is None:
            return True, "no_rule"
        if best[1] == "disallow":
            return False, f"Disallow: {best[2]}"
        return True, f"Allow: {best[2]}"

    def crawl_delay(self, ua: str) -> float | None:
        group = self._group_for(ua)
        return None if group is None else group.delay

    def _group_for(self, ua: str) -> RobotsGroup | None:
        needle = ua.lower()
        star: RobotsGroup | None = None
        for group in self.groups:
            for agent in group.agents:
                token = agent.lower().strip()
                if token == "*":
                    star = group
                elif token and token in needle:
                    return group
        return star


def parse_robots(text: str, url: str, status: int) -> RobotsFile:
    groups: list[RobotsGroup] = []
    current: RobotsGroup | None = None
    awaiting_agents = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()
        if key == "user-agent":
            agent = value or "*"
            if current is None or not awaiting_agents:
                current = RobotsGroup(agents=[agent])
                groups.append(current)
                awaiting_agents = True
            else:
                current.agents.append(agent)
            continue
        awaiting_agents = False
        if current is None:
            current = RobotsGroup(agents=["*"])
            groups.append(current)
        if key == "disallow":
            current.rules.append(("disallow", value))
        elif key == "allow":
            current.rules.append(("allow", value))
        elif key == "crawl-delay":
            try:
                current.delay = max(0.0, float(value.replace(",", ".")))
            except ValueError:
                pass
    fetch_ok = True
    if status not in {404, 410} and status >= 400:
        fetch_ok = True
    return RobotsFile(url=url, status=status, groups=groups, fetch_ok=fetch_ok, raw=text)


class RobotsCache:
    """Один robots.txt на хост за запуск. Не обходим 4xx — это «нельзя»."""

    def __init__(self, http_get: HttpGet | None = None) -> None:
        self.http_get = http_get or requests.get
        self._files: dict[str, RobotsFile] = {}

    def file_for(self, page_url: str) -> RobotsFile:
        host = host_of(page_url)
        if host in self._files:
            return self._files[host]
        robots_url = urljoin(f"{urlparse(page_url).scheme}://{host}", "/robots.txt")
        try:
            response = self.http_get(
                robots_url,
                headers={"User-Agent": user_agent(), "Accept": "text/plain,*/*"},
                timeout=FETCH_TIMEOUT,
            )
            status = int(response.status_code)
            body = response.text or ""
        except requests.RequestException as exc:
            parsed = RobotsFile(
                url=robots_url,
                status=0,
                groups=[],
                fetch_ok=False,
                raw=str(exc),
            )
            self._files[host] = parsed
            return parsed
        if status in {404, 410}:
            parsed = RobotsFile(url=robots_url, status=status, groups=[], fetch_ok=True, raw=body)
        elif status >= 400:
            parsed = RobotsFile(url=robots_url, status=status, groups=[], fetch_ok=True, raw=body)
        else:
            if "user-agent" not in body.lower() and "disallow" not in body.lower():
                parsed = RobotsFile(url=robots_url, status=404, groups=[], fetch_ok=True, raw=body)
            else:
                parsed = parse_robots(body, robots_url, status)
        self._files[host] = parsed
        return parsed

    def check(self, url: str) -> tuple[bool, str, float | None]:
        robots = self.file_for(url)
        allowed, reason = robots.allowed(url, user_agent())
        return allowed, reason, robots.crawl_delay(user_agent())


@dataclass
class FetchResult:
    url: str
    html: str
    engine: str
    status: int = 200


def looks_like_empty_js(html: str) -> bool:
    """Страница есть, а текста нет — типичный корень SPA. Не путать со сломанным селектором."""
    need_bs4()
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = " ".join((soup.get_text(" ", strip=True) or "").split())
    if len(text) >= 120:
        return False
    soup_full = BeautifulSoup(html, "html.parser")
    scripts = soup_full.find_all("script")
    root = soup_full.select_one("#root, #app, [data-reactroot], [data-react-helmet]")
    return bool(root) or len(scripts) >= 4


def visible_text(node: Any) -> str:
    if node is None:
        return ""
    if isinstance(node, str):
        return " ".join(node.replace("\xa0", " ").split())
    text = node.get_text(" ", strip=True) if hasattr(node, "get_text") else str(node)
    return " ".join((text or "").replace("\xa0", " ").split())


def node_matches(node: Any, selector: str) -> bool:
    if not selector or node is None or sv is None:
        return False
    try:
        return bool(sv.match(selector, node))
    except Exception:
        return False


def select_node(item: Any, selector: str) -> Any:
    if item is None:
        return None
    if not selector:
        return item
    if node_matches(item, selector):
        return item
    hit = item.select_one(selector) if hasattr(item, "select_one") else None
    if hit is not None:
        return hit
    for parent in getattr(item, "parents", []):
        if parent is None or getattr(parent, "name", None) is None:
            break
        if node_matches(parent, selector):
            return parent
        hit = parent.select_one(selector) if hasattr(parent, "select_one") else None
        if hit is not None:
            return hit
    return None


def select_text(item: Any, selector: str) -> str:
    node = select_node(item, selector) if selector else item
    return visible_text(node)


def select_href(item: Any, selector: str, base: str) -> str | None:
    if not selector:
        return None
    node = select_node(item, selector)
    if node is None:
        return None
    href = node.get("href") if hasattr(node, "get") else None
    if not href and node.name == "link":
        href = node.get("href")
    if not href and hasattr(node, "find"):
        nested = node.find("a", href=True)
        if nested is not None:
            href = nested.get("href")
    return absolute_url(base, href)


def is_noise_line(text: str, extra: list[str] | None = None) -> bool:
    compact = (text or "").strip()
    if len(compact) < 3:
        return True
    low = compact.lower()
    markers = list(CONTACT_SKIP_MARKERS)
    if extra:
        markers.extend(item.lower() for item in extra)
    if any(marker in low for marker in markers):
        if "з/п" in low or "разряд" in low or "требуется" in low:
            return False
        return True
    return False


def keep_item(text: str, needles: list[str]) -> bool:
    if not needles:
        return True
    haystack = text.casefold()
    return any(needle.casefold() in haystack for needle in needles)


def load_config(path: Path | None = None) -> dict[str, Any]:
    target = path or CONFIG_PATH
    with target.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, list):
        return {"defaults": {}, "sites": data}
    if not isinstance(data, dict):
        raise SystemExit("scripts/config_web.json должен быть объектом или массивом сайтов.")
    return data


def enabled_sites(data: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    payload = data if data is not None else load_config()
    defaults = payload.get("defaults") or {}
    default_city = str(defaults.get("default_city") or "gorlovka")
    default_pause = defaults.get("pause_sec", DEFAULT_PAUSE)
    default_js = bool(defaults.get("javascript") or False)
    default_pages = int(defaults.get("max_pages") or 5)
    sites: list[dict[str, Any]] = []
    for raw in payload.get("sites") or []:
        if not isinstance(raw, dict):
            continue
        if not raw.get("enabled", True):
            continue
        url = str(raw.get("url") or "").strip()
        name = str(raw.get("name") or "").strip()
        if not url or not name:
            print("Пропуск сайта без url или name:", raw)
            continue
        if not urlparse(url).scheme:
            print(f"Пропуск сайта «{name}»: url без http/https.")
            continue
        city = str(raw.get("default_city") or default_city).strip() or default_city
        pause = raw.get("pause_sec", default_pause)
        sites.append(
            {
                "enabled": True,
                "id": str(raw.get("id") or "").strip(),
                "url": url,
                "name": name,
                "default_city": city,
                "item_selector": str(raw.get("item_selector") or "").strip(),
                "title_selector": str(raw.get("title_selector") or "").strip(),
                "description_selector": str(raw.get("description_selector") or "").strip(),
                "salary_selector": str(raw.get("salary_selector") or "").strip(),
                "city_selector": str(raw.get("city_selector") or "").strip(),
                "link_selector": str(raw.get("link_selector") or "").strip(),
                "javascript": bool(raw.get("javascript") if "javascript" in raw else default_js),
                "pause_sec": pause,
                "pagination": bool(raw.get("pagination") or False),
                "next_selector": str(raw.get("next_selector") or "").strip(),
                "max_pages": max(1, min(int(raw.get("max_pages") or default_pages), MAX_PAGES_CAP)),
                "max_items": max(1, min(int(raw.get("max_items") or defaults.get("max_items") or 80), MAX_ITEMS_CAP)),
                "keep_if_contains": [str(item) for item in (raw.get("keep_if_contains") or []) if str(item).strip()],
                "skip_if_contains": [str(item) for item in (raw.get("skip_if_contains") or []) if str(item).strip()],
            }
        )
    return sites


def any_site_needs_js(path: Path | None = None) -> bool:
    return any(site.get("javascript") for site in enabled_sites(load_config(path)))


def pause_seconds(value: Any, crawl_delay: float | None = None) -> float:
    override = (os.environ.get("WEB_PAUSE_SEC") or "").strip()
    if override:
        try:
            value = float(override)
        except ValueError:
            pass
    low, high = PAUSE_MIN, PAUSE_MAX
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        try:
            low, high = float(value[0]), float(value[1])
        except (TypeError, ValueError):
            low, high = PAUSE_MIN, PAUSE_MAX
    elif value is not None and value != "":
        try:
            number = float(value)
            low = high = number
        except (TypeError, ValueError):
            pass
    low = max(0.0, min(low, 15.0))
    high = max(low, min(high, 15.0))
    pause = random.uniform(low, high) if high > low else low
    if crawl_delay:
        pause = max(pause, float(crawl_delay))
    return pause


def layout_warning(site_name: str) -> str:
    return f"сайт {site_name}: 0 элементов, вероятно, изменилась вёрстка"


def assemble_item_text(
    *,
    site_name: str,
    title: str,
    description: str,
    salary: str,
    city: str,
    source_url: str,
) -> str:
    parts = [
        f"Вакансия. {site_name}.",
        f"Требуется: {title}" if title else "",
        f"Город / филиал: {city}" if city else "",
        f"Зарплата: {salary}" if salary and salary not in {title, description} else "",
        description if description and description != title else "",
    ]
    seen: set[str] = set()
    lines: list[str] = []
    for part in parts:
        text = (part or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        lines.append(text)
    return "\n".join(lines)


GENERIC_LISTING_TAILS = {
    "job-openings",
    "jobs",
    "vacancies",
    "vacancy",
    "vakansii",
    "vakansii2",
    "career",
    "careers",
}


def item_external_id(site: dict[str, Any], source_url: str, title: str, extra: str = "") -> str:
    parsed = urlparse(source_url)
    tail = (parsed.path or "/").rstrip("/").split("/")[-1]
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", tail).strip("-")
    listing = slug.lower() in GENERIC_LISTING_TAILS or canon_url(source_url).split("?")[0] == canon_url(site["url"]).split("?")[0]
    if slug and not listing and len(slug) > 12:
        return f"web:{host_of(site['url'])}:{slug}"[:120]
    seed = f"{canon_url(source_url)}|{title}|{extra}"
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
    return f"web:{host_of(site['url'])}:{digest}"


def _scope_has_selector(node: Any, selector: str) -> bool:
    if not selector or node is None:
        return False
    if node_matches(node, selector):
        return True
    return bool(hasattr(node, "select_one") and node.select_one(selector))


def scope_contact_text(item: Any, city_selector: str) -> str:
    """Телефон часто в соседнем абзаце той же карточки/аккордеона — забираем в текст."""
    scope = item
    if city_selector:
        if _scope_has_selector(item, city_selector):
            scope = item
        else:
            for parent in getattr(item, "parents", []):
                name = getattr(parent, "name", None)
                if name in {None, "[document]", "html", "body"}:
                    break
                if _scope_has_selector(parent, city_selector):
                    scope = parent
                    break
    lines: list[str] = []
    nodes = scope.select("p") if hasattr(scope, "select") else []
    for node in nodes:
        text = visible_text(node)
        low = text.lower()
        if any(token in low for token in ("обращаться", "телефон", "тел.", "+7", "071", "949")):
            if text and text not in lines:
                lines.append(text)
    return "\n".join(lines)


def page_base_url(soup: Any, page_url: str) -> str:
    """Учитываем <base href>, иначе относительная ссылка ломается (dtedn.ru)."""
    tag = soup.find("base", href=True) if soup is not None else None
    if tag is not None:
        href = str(tag.get("href") or "").strip()
        if href:
            return urljoin(page_url, href)
    parsed = urlparse(page_url)
    path = parsed.path or "/"
    if not path.endswith("/"):
        path = path.rsplit("/", 1)[0] + "/"
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def parse_items(html: str, site: dict[str, Any], page_url: str) -> list[dict[str, Any]]:
    need_bs4()
    soup = BeautifulSoup(html, "html.parser")
    selector = site["item_selector"]
    if not selector:
        return []
    base = page_base_url(soup, page_url)
    nodes = soup.select(selector)
    items: list[dict[str, Any]] = []
    for node in nodes:
        title = select_text(node, site["title_selector"]) if site["title_selector"] else visible_text(node)
        description = (
            select_text(node, site["description_selector"]) if site["description_selector"] else visible_text(node)
        )
        salary = select_text(node, site["salary_selector"]) if site["salary_selector"] else ""
        city = select_text(node, site["city_selector"]) if site["city_selector"] else ""
        href = select_href(node, site["link_selector"], base) if site["link_selector"] else None
        if href and (is_blocked_host(href) or looks_auth_url(href)):
            href = None
        if href and not same_host(href, site["url"]):
            href = None
        source_url = href or page_url
        contacts = scope_contact_text(node, site["city_selector"])
        blob = " ".join(part for part in (title, city, description, salary, contacts) if part)
        if is_noise_line(title or visible_text(node), site.get("skip_if_contains")):
            continue
        if not keep_item(blob, site.get("keep_if_contains") or []):
            continue
        if not title:
            title = visible_text(node)[:180]
        text = assemble_item_text(
            site_name=site["name"],
            title=title,
            description=description,
            salary=salary,
            city=city,
            source_url=source_url,
        )
        if contacts and contacts not in text:
            text = f"{text}\n{contacts}"
        items.append(
            {
                "title": title,
                "description": description,
                "salary": salary,
                "city": city,
                "source_url": source_url,
                "text": text,
            }
        )
    return items


def find_next_url(html: str, page_url: str, site: dict[str, Any], seen: set[str]) -> str | None:
    if not site.get("pagination"):
        return None
    need_bs4()
    soup = BeautifulSoup(html, "html.parser")
    base = page_base_url(soup, page_url)
    candidates: list[str] = []
    selector = site.get("next_selector") or ""
    if selector:
        for node in soup.select(selector):
            href = node.get("href") if hasattr(node, "get") else None
            abs_url = absolute_url(base, href)
            if abs_url:
                candidates.append(abs_url)
    link = soup.find("link", rel=lambda value: bool(value) and "next" in str(value).lower())
    if link is not None:
        abs_url = absolute_url(base, link.get("href"))
        if abs_url:
            candidates.insert(0, abs_url)
    current = canon_url(page_url)
    for cand in candidates:
        if not same_host(cand, site["url"]):
            continue
        if is_blocked_host(cand) or looks_auth_url(cand):
            continue
        key = canon_url(cand)
        if key == current or key in seen:
            continue
        return cand
    return None


def fetch_http(url: str, *, http_get: HttpGet | None = None) -> FetchResult:
    getter = http_get or requests.get
    response = getter(
        url,
        headers={
            "User-Agent": user_agent(),
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru,en;q=0.8",
        },
        timeout=FETCH_TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"HTTP {response.status_code} для {url}")
    return FetchResult(url=str(response.url or url), html=response.text or "", engine="soup", status=response.status_code)


def fetch_playwright(url: str) -> FetchResult:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit(
            "Сайт отдаёт пустую страницу без JavaScript, нужен Playwright.\n"
            "Пакет: pip install playwright\n"
            "Браузер (дорого, ~150 МБ и 1–3 минуты): python -m playwright install chromium\n"
            "В GitHub Actions браузер ставится только если в config_web.json javascript=true."
        ) from exc
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(user_agent=user_agent())
            page.goto(url, wait_until="domcontentloaded", timeout=FETCH_TIMEOUT * 1000)
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            html = page.content()
            final = page.url
        finally:
            browser.close()
    return FetchResult(url=final or url, html=html, engine="playwright", status=200)


def selector_hits(html: str, selector: str) -> int:
    if not selector:
        return 0
    need_bs4()
    return len(BeautifulSoup(html, "html.parser").select(selector))


def fetch_page(
    url: str,
    site: dict[str, Any],
    *,
    http_get: HttpGet | None = None,
    html_get: HtmlGetter | None = None,
    playwright_get: HtmlGetter | None = None,
) -> FetchResult:
    """Soup первым. Playwright — только если селектор пуст и страница похожа на SPA."""
    if html_get is not None:
        first = html_get(url)
    else:
        first = fetch_http(url, http_get=http_get)
    hits = selector_hits(first.html, site["item_selector"])
    if hits:
        return first
    empty_js = looks_like_empty_js(first.html)
    should_js = bool(site.get("javascript")) or empty_js
    if not should_js:
        return first
    if playwright_get is not None:
        return playwright_get(url)
    if html_get is not None:
        return first
    return fetch_playwright(url)


def process_web_item(
    item: dict[str, Any],
    site: dict[str, Any],
    *,
    fetch: Any = None,
    ocr: Any = None,
) -> dict[str, Any]:
    source_url = item["source_url"]
    external_id = item_external_id(site, source_url, item.get("title") or "", item.get("text") or "")
    source = {
        "type": "WEBSITE",
        "source": "WEBSITE",
        "name": site["name"],
        "url": source_url,
        "sourceUrl": source_url,
        "default_city": site["default_city"],
        "externalId": external_id,
    }
    run = run_process_post(item["text"], source=source, images=None, fetch=fetch, ocr=ocr)
    records = []
    for record in run.records:
        record["source"] = "WEBSITE"
        record["sourceName"] = site["name"]
        record["sourceUrl"] = source_url
        if not record.get("sourcePostExternalId"):
            record["sourcePostExternalId"] = external_id
        if not record.get("externalId"):
            record["externalId"] = external_id
        records.append(record)
    return {
        "sourceUrl": source_url,
        "externalId": external_id,
        "sourceName": site["name"],
        "records": records,
        "reject_reason": run.reject_reason,
        "vacancy_verdict": run.vacancy_verdict,
        "svo_verdict": run.svo_verdict,
        "filter_score": run.filter_score,
        "filter_reasons": list(run.filter_reasons),
        "text": item["text"],
    }


def rejected_entry(result: dict[str, Any], reason: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "WEBSITE",
        "sourceName": result.get("sourceName"),
        "sourceUrl": result.get("sourceUrl"),
        "externalId": result.get("externalId"),
        "reason": reason,
        "vacancyVerdict": result.get("vacancy_verdict"),
        "svoVerdict": result.get("svo_verdict"),
        "filterScore": result.get("filter_score"),
        "filterReasons": result.get("filter_reasons") or [],
        "preview": preview_text(result.get("text") or ""),
    }
    if extra:
        payload.update(extra)
    return payload


def write_summary(stats: dict[str, Any], path: Path | None = None) -> Path:
    target = path or (ensure_logs_dir() / "summary.md")
    lines = [
        "## Парсер сайтов предприятий",
        "",
        f"- страниц: **{stats.get('pages', 0)}** (soup: {stats.get('engine_soup', 0)}, playwright: {stats.get('engine_playwright', 0)})",
        f"- собрано объявлений: **{stats.get('fetched', 0)}**",
        f"- принято конвейером (единиц): **{stats.get('accepted', 0)}**",
        f"- спорных (maybe): **{stats.get('maybe', 0)}**",
        f"- отброшено: **{stats.get('rejected', 0)}** (из них СВО: **{stats.get('rejected_svo', 0)})**",
        f"- пропущено по городу: **{stats.get('skipped_city', 0)}**",
        f"- запрещено robots.txt: **{stats.get('robots_blocked', 0)}**",
        f"- единиц из разрезанных постов: **{stats.get('split_units', 0)}**",
        f"- добавлено в базу: **{stats.get('added', 0)}**",
        f"- обновлено: **{stats.get('updated', 0)}**",
        f"- на модерации: **{stats.get('pending', 0)}**",
        f"- ошибок пачки: **{stats.get('errors', 0)}**",
        "",
    ]
    warnings = list(stats.get("layout_warnings") or [])
    if warnings:
        lines.append("### Вёрстка")
        lines.append("")
        for warning in warnings:
            lines.append(f"- **{warning}**")
        lines.append("")
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
    print("Итог парсера сайтов")
    print(f"  страниц:                     {stats.get('pages', 0)} (soup {stats.get('engine_soup', 0)} / pw {stats.get('engine_playwright', 0)})")
    print(f"  собрано объявлений:          {stats.get('fetched', 0)}")
    print(f"  принято (единиц):            {stats.get('accepted', 0)}")
    print(f"  спорных (maybe):             {stats.get('maybe', 0)}")
    print(f"  отброшено:                   {stats.get('rejected', 0)} (СВО: {stats.get('rejected_svo', 0)})")
    print(f"  пропущено по городу:         {stats.get('skipped_city', 0)}")
    print(f"  запрещено robots.txt:        {stats.get('robots_blocked', 0)}")
    print(f"  единиц из разрезанных постов:{stats.get('split_units', 0)}")
    print(f"  добавлено в базу:            {stats.get('added', 0)}")
    print(f"  обновлено:                   {stats.get('updated', 0)}")
    print(f"  на модерации:                {stats.get('pending', 0)}")
    print(f"  ошибок пачки:                {stats.get('errors', 0)}")
    for warning in stats.get("layout_warnings") or []:
        print(f"  ВНИМАНИЕ: {warning}")


def empty_stats(*, dry_run: bool, note: str) -> dict[str, Any]:
    return {
        "pages": 0,
        "fetched": 0,
        "accepted": 0,
        "maybe": 0,
        "rejected": 0,
        "rejected_svo": 0,
        "skipped_city": 0,
        "robots_blocked": 0,
        "split_units": 0,
        "engine_soup": 0,
        "engine_playwright": 0,
        "layout_warnings": [],
        "added": 0,
        "updated": 0,
        "pending": 0,
        "errors": 0,
        "dry_run": dry_run,
        "note": note,
    }


def run_parser(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    sites: list[dict[str, Any]] | None = None,
    robots: RobotsCache | None = None,
    http_get: HttpGet | None = None,
    html_get: HtmlGetter | None = None,
    playwright_get: HtmlGetter | None = None,
    fetch: Any = None,
    ocr: Any = None,
    sleep: Sleeper | None = None,
    rejected_path: Path | None = None,
) -> dict[str, Any]:
    sleeper = sleep or time.sleep
    if not source_web_enabled():
        stats = empty_stats(
            dry_run=dry_run,
            note="SOURCE_WEB_ENABLED=false — источник выключен, запросов к сайтам не было.",
        )
        print(stats["note"])
        write_summary(stats)
        return stats

    site_list = sites if sites is not None else enabled_sites()
    if not site_list:
        stats = empty_stats(
            dry_run=dry_run,
            note=(
                "В scripts/config_web.json нет включённых сайтов. "
                "Пришли адреса страниц вакансий горловских/донбасских предприятий — заполним селекторы вместе."
            ),
        )
        print(stats["note"])
        write_summary(stats)
        return stats

    checker = robots or RobotsCache(http_get=http_get)
    remaining = limit
    to_upload: list[dict[str, Any]] = []
    maybe_records: list[dict[str, Any]] = []
    fetched = 0
    rejected = 0
    rejected_svo = 0
    skipped_city = 0
    split_units = 0
    pages = 0
    robots_blocked = 0
    engine_soup = 0
    engine_playwright = 0
    layout_warnings: list[str] = []
    log_path = rejected_path or rejected_log_path()
    active = set(active_cities())

    for site in site_list:
        if remaining is not None and remaining <= 0:
            break
        print(f"Сайт «{site['name']}»: {site['url']}")
        allowed, reason, delay = checker.check(site["url"])
        if not allowed:
            robots_blocked += 1
            print(f"  robots.txt: не обходим ({reason}). Закон 12.")
            write_rejected(
                {
                    "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "source": "WEBSITE",
                    "sourceName": site["name"],
                    "sourceUrl": site["url"],
                    "reason": "robots_denied",
                    "detail": reason,
                    "preview": "",
                },
                log_path,
            )
            continue
        seen_pages: set[str] = set()
        queue = [site["url"]]
        site_items = 0
        site_pages = 0
        while queue:
            if remaining is not None and remaining <= 0:
                break
            if site_pages >= int(site["max_pages"]):
                break
            page_url = queue.pop(0)
            key = canon_url(page_url)
            if key in seen_pages:
                continue
            allowed, reason, delay = checker.check(page_url)
            if not allowed:
                robots_blocked += 1
                print(f"  пропуск {page_url}: {reason}")
                write_rejected(
                    {
                        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "source": "WEBSITE",
                        "sourceName": site["name"],
                        "sourceUrl": page_url,
                        "reason": "robots_denied",
                        "detail": reason,
                        "preview": "",
                    },
                    log_path,
                )
                seen_pages.add(key)
                continue
            if pages or site_pages:
                sleeper(pause_seconds(site.get("pause_sec"), delay))
            try:
                fetched_page = fetch_page(
                    page_url,
                    site,
                    http_get=http_get,
                    html_get=html_get,
                    playwright_get=playwright_get,
                )
            except SystemExit:
                raise
            except Exception as exc:
                print(f"  не удалось открыть {page_url}: {redact(str(exc))}")
                write_rejected(
                    {
                        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "source": "WEBSITE",
                        "sourceName": site["name"],
                        "sourceUrl": page_url,
                        "reason": "fetch_error",
                        "preview": redact(str(exc))[:200],
                    },
                    log_path,
                )
                seen_pages.add(key)
                continue
            seen_pages.add(canon_url(fetched_page.url))
            seen_pages.add(key)
            pages += 1
            site_pages += 1
            if fetched_page.engine == "playwright":
                engine_playwright += 1
            else:
                engine_soup += 1
            items = parse_items(fetched_page.html, site, fetched_page.url)
            if site_pages == 1 and selector_hits(fetched_page.html, site["item_selector"]) == 0:
                warning = layout_warning(site["name"])
                layout_warnings.append(warning)
                print(f"  ВНИМАНИЕ: {warning}")
                write_rejected(
                    {
                        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "source": "WEBSITE",
                        "sourceName": site["name"],
                        "sourceUrl": fetched_page.url,
                        "reason": "layout_broken",
                        "preview": warning,
                    },
                    log_path,
                )
            if remaining is not None:
                items = items[:remaining]
            cap_left = int(site["max_items"]) - site_items
            if cap_left <= 0:
                break
            items = items[:cap_left]
            print(f"  {fetched_page.engine}: {len(items)} объявлений с {fetched_page.url}")
            for item in items:
                fetched += 1
                site_items += 1
                if remaining is not None:
                    remaining -= 1
                result = process_web_item(item, site, fetch=fetch, ocr=ocr)
                records = list(result["records"])
                if not records:
                    reason_code = result.get("reject_reason") or "empty"
                    if reason_code in {"svo", "hidden_svo"}:
                        rejected_svo += 1
                    rejected += 1
                    write_rejected(rejected_entry(result, reason_code), log_path)
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
                    for index, record in enumerate(kept, start=1):
                        print_record(record, index, total)
                to_upload.extend(kept)
            next_url = find_next_url(fetched_page.html, fetched_page.url, site, seen_pages)
            if next_url:
                queue.append(next_url)

    accepted = len(to_upload)
    stats: dict[str, Any] = {
        "pages": pages,
        "fetched": fetched,
        "accepted": accepted,
        "maybe": len(maybe_records),
        "rejected": rejected,
        "rejected_svo": rejected_svo,
        "skipped_city": skipped_city,
        "robots_blocked": robots_blocked,
        "split_units": split_units,
        "engine_soup": engine_soup,
        "engine_playwright": engine_playwright,
        "layout_warnings": layout_warnings,
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
        merged.append(
            post_batch_with_retry(
                chunk,
                secret=secret,
                parser="parser_web",
                http_post=None,
                sleep=sleeper,
            )
        )
    upload = merge_upload_stats(merged)
    stats["added"] = upload["added"]
    stats["updated"] = upload["updated"]
    stats["pending"] = upload["pending"]
    stats["errors"] = upload["errors"]
    stats["maybe"] = upload["maybe"] or stats["maybe"]
    stats["skipped_city"] += upload["skippedCity"]
    stats["rejected_svo"] += upload["discardedSvo"]
    print_summary(stats)
    write_summary(stats)
    return stats


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Парсер сайтов предприятий. Карточки собирает process_post, не этот файл."
    )
    parser.add_argument("--dry-run", action="store_true", help="Ничего не отправлять на сайт.")
    parser.add_argument("--limit", type=int, default=None, help="Сколько объявлений обработать всего.")
    parser.add_argument("--site-url", default=None, help="Куда слать пачку. Иначе SITE_URL из .env.local.")
    parser.add_argument(
        "--needs-js",
        action="store_true",
        help="Печатает true/false: нужен ли браузер Playwright по текущему config_web.json.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    if args.needs_js:
        print("true" if any_site_needs_js() else "false")
        return 0
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass
    need_bs4()
    limit = args.limit if args.limit is None or args.limit > 0 else None
    if args.site_url:
        os.environ["SITE_URL"] = str(args.site_url).rstrip("/")
    target = site_url()
    if not args.dry_run:
        assert_ci_site_url(target)
    print(f"User-Agent: {user_agent()}")
    print(f"Режим: {'dry-run' if args.dry_run else 'отправка'}  SITE_URL={target if not args.dry_run else '—'}")
    try:
        run_parser(dry_run=args.dry_run, limit=limit)
    except SystemExit as exc:
        write_summary(empty_stats(dry_run=args.dry_run, note=str(exc)))
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
