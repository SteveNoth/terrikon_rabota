"""Парсер сайтов: robots.txt, абсолютные ссылки, сломанный селектор, soup раньше Playwright."""

from __future__ import annotations

from pathlib import Path

import pytest

from parser_web import (
    CONFIG_PATH,
    FetchResult,
    RobotsCache,
    RobotsFile,
    absolute_url,
    any_site_needs_js,
    assemble_item_text,
    canon_url,
    enabled_sites,
    fetch_page,
    is_blocked_host,
    item_external_id,
    layout_warning,
    load_config,
    looks_like_empty_js,
    parse_items,
    parse_robots,
    process_web_item,
    run_parser,
    source_web_enabled,
)

ROOT = Path(__file__).resolve().parents[3]

SITE = {
    "enabled": True,
    "id": "test-plant",
    "url": "https://plant.example/jobs",
    "name": "Завод тест",
    "default_city": "gorlovka",
    "item_selector": ".job",
    "title_selector": ".title",
    "description_selector": ".text",
    "salary_selector": ".pay",
    "city_selector": ".city",
    "link_selector": "a",
    "javascript": False,
    "pause_sec": 0,
    "pagination": False,
    "next_selector": "",
    "max_pages": 2,
    "max_items": 50,
    "keep_if_contains": [],
    "skip_if_contains": [],
}

JOB_HTML = """
<html><body>
<article class="job">
  <h2 class="title"><a href="/jobs/svarshchik">Сварщик</a></h2>
  <p class="city">Горловка</p>
  <p class="pay">45 000 руб</p>
  <div class="text">Требуется сварщик на завод, оклад 45 000 руб, график 5/2. Тел. 071-123-45-67. Никитовка.</div>
</article>
</body></html>
"""

EMPTY_SPA = """
<html><body>
  <div id="root"></div>
  <script src="/app.js"></script>
  <script src="/chunk.js"></script>
  <script src="/vendor.js"></script>
  <script src="/runtime.js"></script>
</body></html>
"""

LAYOUT_HTML = "<html><body><p>Мы всегда рады новым людям</p></body></html>"

SALE_HTML = """
<html><body>
<article class="job">
  <h2 class="title"><a href="/jobs/fridge">Холодильник</a></h2>
  <p class="city">Горловка</p>
  <div class="text">Продам холодильник, самовывоз, торг уместен. 071-111-22-33</div>
</article>
</body></html>
"""


@pytest.fixture(autouse=True)
def _enable_web_source(monkeypatch):
    monkeypatch.setenv("SOURCE_WEB_ENABLED", "true")


class FakeResponse:
    def __init__(self, text: str, status: int = 200, url: str = "") -> None:
        self.text = text
        self.status_code = status
        self.url = url


def test_absolute_url_joins_relative():
    assert absolute_url("https://plant.example/jobs/", "/jobs/1") == "https://plant.example/jobs/1"
    assert absolute_url("https://plant.example/jobs", "svarshchik") == "https://plant.example/svarshchik"
    assert absolute_url("https://plant.example/jobs", "mailto:hr@plant.example") is None


def test_base_href_prevents_doubled_path():
    html = """
    <html><head><base href="https://dtedn.ru/"></head>
    <body>
    <article class="job">
      <h2 class="title"><a href="o-predpriyatii/vakansii2/slesar-1">Слесарь</a></h2>
      <p class="city">Горловка</p>
      <div class="text">Требуется слесарь на завод, оклад 40 000 руб, график 5/2. Тел. 071-123-45-67. Горловка.</div>
    </article>
    </body></html>
    """
    site = {**SITE, "url": "https://dtedn.ru/o-predpriyatii/vakansii2"}
    items = parse_items(html, site, "https://dtedn.ru/o-predpriyatii/vakansii2?department[]=4")
    assert len(items) == 1
    assert items[0]["source_url"] == "https://dtedn.ru/o-predpriyatii/vakansii2/slesar-1"


def test_hh_host_is_blocked():
    assert is_blocked_host("https://hh.ru/vacancy/123")
    assert is_blocked_host("https://spb.hh.ru/employer/1")
    assert is_blocked_host("https://www.avito.ru/gorlovka/vakansii")
    assert is_blocked_host("https://ok.ru/rabotavdn")
    assert is_blocked_host("https://m-czn.ru/vacancy/g-gorlovka")
    assert is_blocked_host("https://trudvsem.ru/vacancy/card/1/2")
    assert is_blocked_host("https://opendata.trudvsem.ru/api/v1/vacancies")
    assert not is_blocked_host("https://vodadonbassa.ru/job-openings/")
    assert not is_blocked_host("https://mozaika.biz/vakansy/")


def test_mozaika_robots_allows_listing_forbids_page():
    # У Мозаики Allow: /vakansy/ длиннее Disallow: */page/, поэтому в тесте
    # тот же смысл, что в конфиге: явный запрет /vakansy/page/ + pagination: false.
    parsed = parse_robots(
        "User-Agent: *\nAllow: /vakansy/\nDisallow: /vakansy/page/\nDisallow: /*?*\n",
        "https://mozaika.biz/robots.txt",
        200,
    )
    ua = "TerriconRabota/0.1"
    allowed, _ = parsed.allowed("https://mozaika.biz/vakansy/", ua)
    assert allowed is True
    denied, reason = parsed.allowed("https://mozaika.biz/vakansy/page/2/", ua)
    assert denied is False
    assert "page" in reason


def test_mozaika_card_keeps_phone_and_absolute_link():
    html = """
    <html><body>
    <div class="border-doska5">
      <div class="title-doska100"><a href="https://mozaika.biz/vakansy/vrabochie/1-gruzchik.html">Требуется грузчик</a></div>
      <div class="text-doska62">
        <div class="text">В магазин в ж/м Комсомолец требуется грузчик, график 5/2.</div>
        <div>Адрес: г. Горловка, ул. 60лет СССР</div>
        <div>Телефон: +79494678163</div>
      </div>
    </div>
    </body></html>
    """
    site = {
        **SITE,
        "url": "https://mozaika.biz/vakansy/",
        "name": "Горловская мозаика",
        "item_selector": "div.border-doska5",
        "title_selector": "div.title-doska100 a",
        "description_selector": "div.text-doska62",
        "salary_selector": "",
        "city_selector": "",
        "link_selector": "div.title-doska100 a",
        "keep_if_contains": ["Горловк", "Горловка"],
    }
    items = parse_items(html, site, site["url"])
    assert len(items) == 1
    assert items[0]["title"] == "Требуется грузчик"
    assert items[0]["source_url"].endswith("1-gruzchik.html")
    assert items[0]["source_url"] not in items[0]["text"]
    assert "Горловка" in items[0]["text"]
    assert "79494678163" in items[0]["text"]


def test_rabotadnr_card_uses_city_row_not_vip():
    html = """
    <html><body>
    <div class="vacancy_item vertical"><a href="/job/vacancy/vip.html">VIP повар</a></div>
    <div class="vacancy-item">
      <table class="tbl_vac">
        <tr><td>
          <h3 class="title"><a class="titlevac" href="/job/vacancy/188832.html">Слесарь</a></h3>
          <div class="vac_details">Работодатель <span>•</span> Горловка <span>•</span> Производство</div>
          <div class="salary-item"><span class="salary">от 40000</span></div>
        </td></tr>
      </table>
    </div>
    </body></html>
    """
    site = {
        **SITE,
        "url": "https://rabotadnr.com/job/vacancy/city/gorlovka",
        "name": "Работа ДНР, Горловка",
        "item_selector": "div.vacancy-item",
        "title_selector": "a.titlevac",
        "description_selector": "div.vac_details",
        "salary_selector": "span.salary",
        "city_selector": "div.vac_details",
        "link_selector": "a.titlevac",
        "keep_if_contains": ["Горловк", "Горловка"],
    }
    items = parse_items(html, site, site["url"])
    assert len(items) == 1
    assert items[0]["title"] == "Слесарь"
    assert "vip.html" not in items[0]["source_url"]
    assert items[0]["source_url"].endswith("/job/vacancy/188832.html")
    assert "Горловка" in items[0]["text"]
    assert "40000" in items[0]["text"]


def test_robots_disallow_is_respected():
    parsed = parse_robots(
        "User-agent: *\nDisallow: /secret\nAllow: /\n",
        "https://plant.example/robots.txt",
        200,
    )
    allowed, reason = parsed.allowed("https://plant.example/secret/jobs", "TerriconRabota/0.1")
    assert allowed is False
    assert "Disallow" in reason
    allowed_ok, _ = parsed.allowed("https://plant.example/jobs", "TerriconRabota/0.1")
    assert allowed_ok is True


def test_robots_wildcard_pagen():
    parsed = parse_robots(
        "User-agent: *\nDisallow: /*PAGEN\nAllow: /\n",
        "https://plant.example/robots.txt",
        200,
    )
    allowed, reason = parsed.allowed("https://plant.example/jobs?PAGEN_1=2", "TerriconRabota/0.1")
    assert allowed is False
    assert "PAGEN" in reason


def test_robots_404_means_allow():
    parsed = parse_robots("", "https://plant.example/robots.txt", 404)
    allowed, reason = parsed.allowed("https://plant.example/jobs", "TerriconRabota/0.1")
    assert allowed is True
    assert reason == "no_robots"


def test_parse_items_and_absolute_link():
    items = parse_items(JOB_HTML, SITE, "https://plant.example/jobs")
    assert len(items) == 1
    assert items[0]["title"] == "Сварщик"
    assert items[0]["source_url"] == "https://plant.example/jobs/svarshchik"
    assert "Горловка" in items[0]["text"]
    assert "45 000" in items[0]["text"]


def test_layout_warning_text():
    assert layout_warning("Завод X") == "сайт Завод X: 0 элементов, вероятно, изменилась вёрстка"


def test_broken_selector_is_not_silent_zero(tmp_path):
    def html_get(url: str) -> FetchResult:
        return FetchResult(url=url, html=LAYOUT_HTML, engine="soup", status=200)

    def robots_get(url, headers=None, timeout=None):
        return FakeResponse("User-agent: *\nAllow: /\n", 200, url)

    stats = run_parser(
        dry_run=True,
        sites=[SITE],
        robots=RobotsCache(http_get=robots_get),
        html_get=html_get,
        sleep=lambda _seconds: None,
        rejected_path=tmp_path / "rejected.jsonl",
    )
    assert stats["fetched"] == 0
    assert stats["layout_warnings"]
    assert "0 элементов" in stats["layout_warnings"][0]
    assert "Завод тест" in stats["layout_warnings"][0]
    log = (tmp_path / "rejected.jsonl").read_text(encoding="utf-8")
    assert "layout_broken" in log


def test_robots_denied_path_is_not_fetched(tmp_path):
    calls: list[str] = []

    def html_get(url: str) -> FetchResult:
        calls.append(url)
        raise AssertionError("запрещённый URL не должны открывать")

    parsed = parse_robots("User-agent: *\nDisallow: /\n", "https://plant.example/robots.txt", 200)

    class Deny(RobotsCache):
        def file_for(self, page_url: str) -> RobotsFile:
            return parsed

    stats = run_parser(
        dry_run=True,
        sites=[SITE],
        robots=Deny(http_get=lambda *a, **k: FakeResponse("", 200)),
        html_get=html_get,
        sleep=lambda _seconds: None,
        rejected_path=tmp_path / "rejected.jsonl",
    )
    assert calls == []
    assert stats["robots_blocked"] >= 1
    assert stats["fetched"] == 0


def test_soup_used_before_playwright():
    playwright_calls = {"n": 0}

    def html_get(url: str) -> FetchResult:
        return FetchResult(url=url, html=JOB_HTML, engine="soup", status=200)

    def pw_get(url: str) -> FetchResult:
        playwright_calls["n"] += 1
        return FetchResult(url=url, html=JOB_HTML, engine="playwright", status=200)

    result = fetch_page(SITE["url"], SITE, html_get=html_get, playwright_get=pw_get)
    assert result.engine == "soup"
    assert playwright_calls["n"] == 0


def test_playwright_only_when_page_empty_without_js():
    playwright_calls = {"n": 0}
    site = {**SITE, "javascript": True}

    def html_get(url: str) -> FetchResult:
        return FetchResult(url=url, html=EMPTY_SPA, engine="soup", status=200)

    def pw_get(url: str) -> FetchResult:
        playwright_calls["n"] += 1
        return FetchResult(url=url, html=JOB_HTML, engine="playwright", status=200)

    assert looks_like_empty_js(EMPTY_SPA) is True
    result = fetch_page(site["url"], site, html_get=html_get, playwright_get=pw_get)
    assert playwright_calls["n"] == 1
    assert result.engine == "playwright"


def test_process_web_item_uses_process_post():
    items = parse_items(JOB_HTML, SITE, SITE["url"])
    result = process_web_item(items[0], SITE)
    assert result["records"]
    record = result["records"][0]
    assert record["source"] == "WEBSITE"
    assert record["sourceName"] == "Завод тест"
    assert record["citySlug"] == "gorlovka"
    assert "сварщик" in (record.get("title") or "").lower() or record.get("professionSlug") == "svarshchik"


def test_sale_post_is_rejected_by_shared_filter():
    items = parse_items(SALE_HTML, SITE, SITE["url"])
    result = process_web_item(items[0], SITE)
    assert result["records"] == []
    assert result["reject_reason"]


def test_source_switch(monkeypatch):
    monkeypatch.setenv("SOURCE_WEB_ENABLED", "false")
    assert source_web_enabled() is False
    stats = run_parser(dry_run=True, sites=[SITE], sleep=lambda _s: None)
    assert stats["fetched"] == 0
    assert "SOURCE_WEB_ENABLED" in (stats.get("note") or "")


def test_parser_has_no_own_cleanup_rules():
    source = (ROOT / "scripts" / "parser_web.py").read_text(encoding="utf-8")
    assert "from process import run_process_post" in source
    assert "def clean_title" not in source
    assert "def strip_junk" not in source
    assert "def is_vacancy" not in source


def test_config_has_two_real_sites_and_required_fields():
    data = load_config()
    sites = enabled_sites(data)
    assert len(sites) >= 2
    required = {
        "url",
        "name",
        "default_city",
        "item_selector",
        "title_selector",
        "description_selector",
        "salary_selector",
        "city_selector",
        "link_selector",
        "javascript",
        "pause_sec",
        "pagination",
    }
    hosts = {item["url"] for item in sites}
    assert any("vodadonbassa.ru" in url for url in hosts)
    assert any("dtedn.ru" in url for url in hosts)
    assert any("mozaika.biz" in url for url in hosts)
    assert any("rabotadnr.com" in url for url in hosts)
    assert not any("avito.ru" in url for url in hosts)
    assert not any("ok.ru" in url for url in hosts)
    assert not any("m-czn.ru" in url for url in hosts)
    for site in sites:
        assert required <= set(site)
        assert site["item_selector"]
        assert site["javascript"] is False
        if "mozaika.biz" in site["url"]:
            assert site["pagination"] is False
            assert site["max_pages"] == 1


def test_needs_js_false_for_current_config():
    assert any_site_needs_js() is False


def test_workflow_cron_and_conditional_playwright():
    text = (ROOT / ".github" / "workflows" / "parser-web.yml").read_text(encoding="utf-8")
    assert "cron: \"0 5 * * *\"" in text or "cron: '0 5 * * *'" in text
    assert "workflow_dispatch" in text
    assert "parser_web.py --needs-js" in text
    assert "playwright install" in text
    assert "if: steps.js.outputs.needed == 'true'" in text
    assert "tesseract-ocr" not in text
    assert "OCR_PROVIDER: none" in text
    assert "secrets.CRON_SECRET" in text
    assert "cache: pip" in text
    assert "150" in text or "минуты" in text


def test_config_path_is_scripts():
    assert CONFIG_PATH.name == "config_web.json"
    assert CONFIG_PATH.parent.name == "scripts"


def test_pagination_stops_at_max_pages(tmp_path):
    pages = {
        "https://plant.example/jobs": JOB_HTML + '<a class="next" href="/jobs?page=2">далее</a>',
        "https://plant.example/jobs?page=2": JOB_HTML.replace("svarshchik", "svarshchik-2").replace(
            "Сварщик", "Повар"
        )
        + '<a class="next" href="/jobs?page=3">далее</a>',
        "https://plant.example/jobs?page=3": JOB_HTML.replace("svarshchik", "svarshchik-3"),
    }

    site = {**SITE, "pagination": True, "next_selector": "a.next", "max_pages": 2}

    def html_get(url: str) -> FetchResult:
        html = None
        for key, value in pages.items():
            if canon_url(key) == canon_url(url):
                html = value
                break
        assert html is not None, url
        return FetchResult(url=url, html=html, engine="soup", status=200)

    def robots_get(url, headers=None, timeout=None):
        return FakeResponse("", 404, url)

    stats = run_parser(
        dry_run=True,
        sites=[site],
        robots=RobotsCache(http_get=robots_get),
        html_get=html_get,
        sleep=lambda _seconds: None,
        rejected_path=tmp_path / "rejected.jsonl",
    )
    assert stats["pages"] == 2
    assert stats["fetched"] == 2


def test_assemble_mentions_employer():
    text = assemble_item_text(
        site_name="Вода Донбасса",
        title="Слесарь",
        description="з/п 40 000",
        salary="40 000",
        city="Горловка",
        source_url="https://vodadonbassa.ru/job-openings/",
    )
    assert "Вода Донбасса" in text
    assert "Слесарь" in text
    assert "Горловка" in text


DTEDN_CARD_HTML = """
<html><head><base href="https://dtedn.ru/"></head><body>
<div class="card-job">
  <div>
    <h3><a class="card-job_job" href="o-predpriyatii/vakansii2/slesar-1164">Слесарь 5 разряда</a></h3>
    <h4 class="card-job_department">Горловкатеплосеть</h4>
    <div>
      <p><span>Адрес:</span> ДНР, 284627 г. Горловка ул.Кирова,12</p>
      <p><a href="tel:+7 (949) 332-59-52"><span>Телефон:<span>+7 (949) 332-59-52</span></span></a></p>
    </div>
  </div>
</div>
</body></html>
"""

DTEDN_SITE = {
    **SITE,
    "url": "https://dtedn.ru/o-predpriyatii/vakansii2?department[]=4",
    "name": "Донбасстеплоэнерго",
    "item_selector": ".card-job",
    "title_selector": ".card-job_job",
    "description_selector": ".card-job_department",
    "salary_selector": "",
    "city_selector": ".card-job_department",
    "link_selector": "a.card-job_job",
}


def test_postal_code_in_address_is_not_job_text():
    items = parse_items(DTEDN_CARD_HTML, DTEDN_SITE, DTEDN_SITE["url"])
    assert len(items) == 1
    text = items[0]["text"]
    assert "Слесарь 5 разряда" in text
    assert "Горловкатеплосеть" in text
    assert "332-59-52" in text
    assert "284627" not in text
    assert items[0]["source_url"].endswith("/slesar-1164")
    record = process_web_item(items[0], DTEDN_SITE)["records"][0]
    assert record.get("salaryFrom") != 284627
    assert record.get("citySlug") == "gorlovka"


def test_contact_text_stays_inside_one_card():
    html = """
    <html><body><div class="list">
    <article class="job">
      <h2 class="title"><a href="/jobs/a">Сварщик</a></h2>
      <p class="city">Горловка</p>
      <p class="pay">45 000 руб</p>
      <div class="text">Требуется сварщик на завод, оклад 45 000 руб, график 5/2. Никитовка.</div>
      <p>Обращаться: 071-111-11-11</p>
    </article>
    <article class="job">
      <h2 class="title"><a href="/jobs/b">Повар</a></h2>
      <p class="city">Горловка</p>
      <p class="pay">40 000 руб</p>
      <div class="text">Требуется повар на завод, оклад 40 000 руб, график 5/2. Калиновка.</div>
      <p>Обращаться: 071-222-22-22</p>
    </article>
    </div></body></html>
    """
    site = {**SITE, "city_selector": ".job", "skip_if_contains": ["обращаться"]}
    items = parse_items(html, site, SITE["url"])
    assert len(items) == 2
    assert "071-111-11-11" in items[0]["text"]
    assert "071-222-22-22" not in items[0]["text"]
    assert "071-222-22-22" in items[1]["text"]
    assert "071-111-11-11" not in items[1]["text"]


def test_listing_items_get_distinct_external_ids():
    site = {**SITE, "url": "https://vodadonbassa.ru/job-openings/"}
    listing = "https://vodadonbassa.ru/job-openings/"
    first = item_external_id(site, listing, "Машинист насосных установок", "от 30562")
    second = item_external_id(site, listing, "Кассир", "33235")
    assert first != second
    assert first.startswith("web:vodadonbassa.ru:")
