"""OCR: когда гоняем, кэш, контракт rawText/ocrText, склейка с фильтром и 14A."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import get_args

import pytest

from extract import extract_salary
from filter import fold_text, is_vacancy
from ocr import (
    assemble_post,
    collect_analysis_text,
    decide_ocr,
    reload_ocr,
    reset_ocr_cache,
)
from ocr_provider import ocr_image, provider_name, tesseract_available
from tests.ocr import load_ocr_samples, load_live_posts
from tests.ocr.make_fixtures import (
    CAPTION_WITH_SALARY_ON_LAYOUT,
    SALARY_MOCKUP_TEXT,
    VACANCY_SELLER_TEXT,
    ensure_ocr_fixtures,
)
from vahta import WorkFormat
import shared_config

ROOT = Path(__file__).resolve().parents[3]
OCR_PY = ROOT / "scripts" / "ocr.py"
SPLIT_PY = ROOT / "scripts" / "split.py"
FILTER_PY = ROOT / "scripts" / "filter.py"
PRISMA = ROOT / "prisma" / "schema.prisma"
STORAGE = ROOT / "src" / "lib" / "adapters" / "storage.ts"

needs_tesseract = pytest.mark.skipif(
    not tesseract_available(),
    reason="нет бинаря Tesseract или языка rus",
)


@pytest.fixture(autouse=True)
def _ocr_isolation(monkeypatch):
    reset_ocr_cache()
    monkeypatch.delenv("OCR_PROVIDER", raising=False)
    yield
    reset_ocr_cache()


@pytest.fixture
def pngs() -> dict[str, Path]:
    return ensure_ocr_fixtures()


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text or "")


def test_provider_defaults_to_none():
    assert provider_name() == "none"


def test_provider_none_keeps_pipeline_and_image_post_is_short(pngs):
    result = assemble_post("", [str(pngs["vacancy_seller"].name)])
    assert result.analysis.skipped_reason == "provider_none"
    assert result.analysis.ocr_text == ""
    assert result.analysis.caption == ""
    assert result.units == []
    assert result.vacancy_verdict == "reject"
    assert is_vacancy(result.analysis.analysis_text).verdict == "reject"


def test_sale_with_photo_does_not_call_ocr(pngs, monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    calls: list[bytes] = []

    def fake_ocr(data: bytes) -> str:
        calls.append(data)
        return "этот текст не должен появиться"

    collected = collect_analysis_text(
        "продам холодильник",
        [pngs["fridge"].name],
        ocr=fake_ocr,
    )
    assert collected.skipped_reason == "caption_garbage"
    assert calls == []
    result = assemble_post(
        "продам холодильник",
        [pngs["fridge"].name],
        ocr=fake_ocr,
    )
    assert result.vacancy_verdict == "reject"
    assert result.units == []
    assert "продам" in fold_text(result.analysis.caption)
    assert result.analysis.ocr_text == ""


def test_empty_caption_image_vacancy_accepts_from_ocr(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")

    def fake_ocr(_data: bytes) -> str:
        return VACANCY_SELLER_TEXT

    result = assemble_post(
        "",
        ["https://sun9-99.userapi.com/impg/vacancy.png"],
        source={"default_city": "gorlovka", "externalId": "vk-ocr-1"},
        fetch=lambda _url: b"fake-image",
        ocr=fake_ocr,
    )
    assert result.analysis.skipped_reason is None
    assert result.vacancy_verdict == "accept"
    assert result.units
    unit = result.units[0]
    assert unit.raw_text == ""
    assert "продавец" not in (unit.raw_text or "")
    assert "28 000" in unit.ocr_text or "28000" in _digits(unit.ocr_text)
    assert unit.profession is not None
    assert unit.profession.slug == "prodavets"
    assert unit.salary is not None
    assert unit.salary.min_amount == 28000
    assert "---OCR---" not in unit.raw_text
    assert unit.ocr_text in result.analysis.analysis_text


def test_salary_only_on_layout_goes_to_field_and_stays_in_ocr(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    caption = CAPTION_WITH_SALARY_ON_LAYOUT
    assert extract_salary(caption) is None

    def fake_ocr(_data: bytes) -> str:
        return SALARY_MOCKUP_TEXT

    result = assemble_post(
        caption,
        ["https://sun9-1.userapi.com/c1/salary.png"],
        source={"default_city": "gorlovka"},
        fetch=lambda _url: b"fake-image",
        ocr=fake_ocr,
    )
    assert result.vacancy_verdict == "accept"
    unit = result.units[0]
    assert unit.raw_text == caption
    assert "45 000" not in unit.raw_text and "45000" not in _digits(unit.raw_text)
    assert "45000" in _digits(unit.ocr_text)
    assert unit.salary is not None
    assert unit.salary.min_amount == 45000
    assert extract_salary(unit.ocr_text) is not None
    assert extract_salary(unit.ocr_text).min_amount == 45000
    assert "---OCR---" in result.analysis.analysis_text
    assert caption in result.analysis.analysis_text
    assert unit.ocr_text in result.analysis.analysis_text


def test_same_url_does_not_call_engine_twice(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    url = "https://sun9-2.userapi.com/impg/same.png"
    ocr_calls: list[int] = []
    fetch_calls: list[str] = []

    def fake_fetch(ref: str) -> bytes:
        fetch_calls.append(ref)
        return b"same-bytes-for-cache"

    def fake_ocr(data: bytes) -> str:
        ocr_calls.append(len(data))
        return VACANCY_SELLER_TEXT

    first = collect_analysis_text("", [url], fetch=fake_fetch, ocr=fake_ocr)
    second = collect_analysis_text("", [url], fetch=fake_fetch, ocr=fake_ocr)
    assert first.ocr_text == second.ocr_text == VACANCY_SELLER_TEXT
    assert ocr_calls == [len(b"same-bytes-for-cache")]
    assert fetch_calls == [url]


def test_same_fixture_bytes_share_hash_cache(pngs, monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    ocr_calls: list[int] = []

    def fake_ocr(data: bytes) -> str:
        ocr_calls.append(len(data))
        return "требуется продавец, 28 000"

    collect_analysis_text("", [pngs["vacancy_seller"].name], ocr=fake_ocr)
    collect_analysis_text("", [str(pngs["vacancy_seller"])], ocr=fake_ocr)
    assert len(ocr_calls) == 1


def test_disallowed_host_does_not_crash(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    collected = collect_analysis_text(
        "",
        ["https://evil.example.com/photo.jpg"],
        ocr=lambda _data: "не должны вызвать",
    )
    assert collected.caption == ""
    assert collected.ocr_text == ""
    assert collected.skipped_reason in {"ocr_empty", None}


def test_fetch_error_keeps_caption(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")

    def boom(_ref: str) -> bytes:
        raise RuntimeError("сеть недоступна")

    collected = collect_analysis_text(
        "Требуется продавец в магазин. Горловка. График 2/2. Тел. 071-555-12-34",
        ["https://sun9-3.userapi.com/impg/x.png"],
        fetch=boom,
        ocr=lambda _data: "нет",
    )
    assert "Требуется продавец" in collected.caption
    assert collected.ocr_text == ""
    assert collected.analysis_text == collected.caption


def test_max_images_comes_from_json(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    ocr_calls: list[str] = []

    def fake_ocr(data: bytes) -> str:
        ocr_calls.append(data.decode("ascii", errors="ignore"))
        return "x"

    def fake_fetch(ref: str) -> bytes:
        return ref.encode("ascii")

    refs = [f"https://sun9-{i}.userapi.com/impg/{i}.png" for i in range(6)]
    collected = collect_analysis_text("", refs, fetch=fake_fetch, ocr=fake_ocr)
    assert len(collected.image_urls) == 4
    assert len(ocr_calls) == 4


def test_ocr_json_always_if_no_caption_without_code(tmp_path, monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    original = shared_config.OCR_PATH
    data = json.loads(original.read_text(encoding="utf-8"))
    data["alwaysIfNoCaption"] = False
    data["runIfLooksLikeVacancy"] = False
    dest = tmp_path / "ocr.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    calls: list[int] = []

    def fake_ocr(data_bytes: bytes) -> str:
        calls.append(len(data_bytes))
        return VACANCY_SELLER_TEXT

    assert decide_ocr("", ["https://sun9-1.userapi.com/a.png"]) is None
    monkeypatch.setattr(shared_config, "OCR_PATH", dest)
    reload_ocr()
    try:
        assert decide_ocr("", ["https://sun9-1.userapi.com/a.png"]) == "caption_skip"
        collect_analysis_text(
            "",
            ["https://sun9-1.userapi.com/a.png"],
            fetch=lambda _url: b"xx",
            ocr=fake_ocr,
        )
        assert calls == []
    finally:
        monkeypatch.setattr(shared_config, "OCR_PATH", original)
        reload_ocr()
    assert decide_ocr("", ["https://sun9-1.userapi.com/a.png"]) is None


def test_ocr_json_garbage_list_without_code(tmp_path, monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    sale = "продам холодильник samsung рабочий, самовывоз из горловки сегодня"
    original = shared_config.OCR_PATH
    data = json.loads(original.read_text(encoding="utf-8"))
    data["skipStopWordIds"] = []
    dest = tmp_path / "ocr.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    calls: list[int] = []

    def fake_ocr(data_bytes: bytes) -> str:
        calls.append(1)
        return "товар"

    assert decide_ocr(sale, ["fridge.png"]) == "caption_garbage"
    monkeypatch.setattr(shared_config, "OCR_PATH", dest)
    reload_ocr()
    try:
        assert decide_ocr(sale, ["fridge.png"]) == "caption_skip"
        collect_analysis_text(sale, ["fridge.png"], ocr=fake_ocr)
        assert calls == []
        data["captionAlmostEmptyChars"] = 400
        dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        reload_ocr()
        collect_analysis_text(sale, ["fridge.png"], ocr=fake_ocr)
        assert calls == [1]
    finally:
        monkeypatch.setattr(shared_config, "OCR_PATH", original)
        reload_ocr()
    assert decide_ocr(sale, ["fridge.png"]) == "caption_garbage"


def test_split_and_filter_do_not_know_ocr_provider():
    split_src = SPLIT_PY.read_text(encoding="utf-8")
    filter_src = FILTER_PY.read_text(encoding="utf-8")
    ocr_src = OCR_PY.read_text(encoding="utf-8")
    assert "ocr_provider" not in split_src
    assert "OCR_PROVIDER" not in split_src
    assert "ocr_provider" not in filter_src
    assert "OCR_PROVIDER" not in filter_src
    assert "from ocr_provider import" in ocr_src
    assert "альбом уже склеен" in ocr_src
    assert "скрытый СВО" in ocr_src


def test_schema_and_storage_have_no_image_files():
    schema = PRISMA.read_text(encoding="utf-8")
    storage = STORAGE.read_text(encoding="utf-8")
    assert "Bytes" not in schema
    assert "@db.ByteA" not in schema
    assert "imageBlob" not in schema
    assert "ocrText" in schema
    assert "imageUrls" in schema
    assert "splitIndex" in schema
    assert "sourcePostExternalId" in schema
    assert "STORAGE_DRIVER=external" in storage
    assert "не кладём картинки в свою базу" in storage
    assert set(get_args(WorkFormat)) == {"LOCAL", "VAHTA", "REMOTE"}


def test_samples_pipeline_with_mock(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    source, posts = load_ocr_samples()
    ensure_ocr_fixtures()
    failures = []
    for post in posts:
        text_by_image = {post["images"][0]: post.get("mockOcr") or ""}

        def fake_ocr(data: bytes, mapping=text_by_image) -> str:
            return next(iter(mapping.values()))

        result = assemble_post(
            post["caption"],
            post["images"],
            source=source,
            ocr=fake_ocr,
        )
        if post["expectOcr"]:
            if result.analysis.skipped_reason == "caption_garbage":
                failures.append(f"{post['id']}: зря пропустили OCR")
            if result.vacancy_verdict != post["expectedVerdict"]:
                failures.append(
                    f"{post['id']}: вердикт {result.vacancy_verdict}, ждали {post['expectedVerdict']}"
                )
            if post.get("expectSalary") and result.units:
                salary = result.units[0].salary
                got = salary.min_amount if salary else None
                if got != post["expectSalary"]:
                    failures.append(f"{post['id']}: зарплата {got}, ждали {post['expectSalary']}")
            if result.units:
                assert result.units[0].raw_text == post["caption"]
        else:
            if result.analysis.skipped_reason != "caption_garbage":
                failures.append(f"{post['id']}: OCR не должны были гонять")
            if result.vacancy_verdict != "reject":
                failures.append(f"{post['id']}: продажа должна быть reject")
    assert failures == [], "\n".join(failures)


@needs_tesseract
def test_tesseract_reads_russian_vacancy_png(pngs, monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    text = ocr_image(pngs["vacancy_seller"].read_bytes())
    folded = fold_text(text)
    digits = _digits(text)
    assert "продав" in folded
    assert "28000" in digits
    result = assemble_post("", [pngs["vacancy_seller"].name], source={"default_city": "gorlovka"})
    assert result.vacancy_verdict == "accept"
    assert result.units
    assert result.units[0].raw_text == ""
    assert result.units[0].salary is not None
    assert result.units[0].salary.min_amount == 28000
    assert "28000" in _digits(result.units[0].ocr_text)


@needs_tesseract
def test_tesseract_salary_mockup_number_in_ocr_text(pngs, monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    result = assemble_post(
        CAPTION_WITH_SALARY_ON_LAYOUT,
        [pngs["salary_mockup"].name],
        source={"default_city": "gorlovka"},
    )
    assert result.units
    unit = result.units[0]
    assert unit.raw_text == CAPTION_WITH_SALARY_ON_LAYOUT
    assert "45000" in _digits(unit.ocr_text)
    assert unit.salary is not None
    assert unit.salary.min_amount == 45000


def test_live_manifest_files_exist():
    source, posts = load_live_posts()
    assert source.get("default_city") == "gorlovka"
    kinds = {post["kind"] for post in posts}
    assert kinds == {"vacancy", "vahta", "garbage", "not_vacancy", "svo"}
    assert len(posts) >= 30
    missing = []
    for post in posts:
        path = ROOT / "scripts" / "tests" / "fixtures" / "ocr" / post["file"]
        if not path.is_file():
            missing.append(post["file"])
        assert post["caption"] == ""
        assert post["id"]
        assert post["originalName"]
    assert missing == []


@needs_tesseract
def test_live_labeled_photos_pipeline(monkeypatch):
    """Метки с рабочего стола: пустая подпись, смысл на макете."""
    monkeypatch.setenv("OCR_PROVIDER", "tesseract")
    source, posts = load_live_posts()
    results = []
    for post in posts:
        result = assemble_post(post["caption"], [post["file"]], source=source)
        assert result.analysis.caption == ""
        assert result.analysis.skipped_reason not in {"caption_garbage", "provider_none", "caption_skip"}
        for unit in result.units:
            assert unit.raw_text == ""
            assert "---OCR---" not in unit.raw_text
        results.append((post, result))

    vacancies = [(post, result) for post, result in results if post["kind"] == "vacancy"]
    vacancy_kept = [
        post["id"]
        for post, result in vacancies
        if result.vacancy_verdict in {"accept", "maybe"}
    ]
    assert len(vacancy_kept) >= 4, vacancy_kept

    bakery = next(result for post, result in vacancies if post["id"] == "vacancy-01")
    assert bakery.vacancy_verdict == "accept"
    assert bakery.units
    assert bakery.units[0].salary is not None
    assert bakery.units[0].salary.min_amount == 65000
    assert "65000" in _digits(bakery.analysis.ocr_text)

    not_vacancy = [result for post, result in results if post["kind"] == "not_vacancy"]
    assert not_vacancy
    assert all(result.vacancy_verdict == "reject" for result in not_vacancy)

    garbage_accept = [
        post["id"]
        for post, result in results
        if post["kind"] == "garbage" and result.vacancy_verdict == "accept"
    ]
    assert garbage_accept == []

    svo_reject = [
        post["id"]
        for post, result in results
        if post["kind"] == "svo" and result.svo_verdict == "reject"
    ]
    assert "svo-06" in svo_reject

    vahta_ok = [
        post["id"]
        for post, result in results
        if post["kind"] == "vahta"
        and result.units
        and result.units[0].work_format == "VAHTA"
    ]
    assert vahta_ok
