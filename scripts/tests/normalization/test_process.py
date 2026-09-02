"""process_post: список единиц, rawText, отброс мусора и СВО, устойчивость."""

from __future__ import annotations

import json
from pathlib import Path

from extract import extract_phone
from process import process_post
from tests.split import load_split_samples
from tests.data import load_posts


SOURCE = {
    "name": "Работа Горловка",
    "default_city": "gorlovka",
    "externalId": "vk-123",
}

ROOT = Path(__file__).resolve().parents[3]
PROCESS_PY = ROOT / "scripts" / "process.py"
VIEW_TS = ROOT / "src" / "lib" / "vacancy" / "view.ts"


def test_process_post_returns_list_of_one_for_ordinary():
    text = (
        "Требуется сварщик на завод, оклад 45 000 руб, график 5/2. "
        "Тел. 071-123-45-67."
    )
    records = process_post(text, source=SOURCE)
    assert isinstance(records, list)
    assert len(records) == 1
    assert records[0]["splitIndex"] == 0
    assert records[0]["externalId"] == "vk-123"
    assert "trustScore" in records[0]
    assert "signature" in records[0]
    assert "moderationStatus" in records[0]
    assert "trustFlags" in records[0]


def test_sheet_from_14a_returns_several():
    source, posts = load_split_samples()
    sheet = next(post for post in posts if post["id"] == "sheet-02")
    records = process_post(sheet["text"], source=source)
    assert len(records) == sheet["expectedUnits"]
    slugs = [item.get("professionSlug") for item in records]
    assert slugs[:3] == ["svarshchik", "povar", "voditel"]
    assert records[0]["splitIndex"] == 0
    assert records[1]["externalId"].endswith("#2")
    assert records[2]["externalId"].endswith("#3")
    for item in records:
        assert item["rawText"] == sheet["text"]
        assert item["sourcePostExternalId"] == source.get("externalId") or "vk-split-src"


def test_raw_text_matches_caption_exactly():
    caption = "СРОЧНО!!! нужен сварной 🔥\nзп 45 000 руб, 071-123-45-67  \n"
    records = process_post(caption, source=SOURCE)
    assert records
    assert records[0]["rawText"] == caption
    assert records[0]["rawText"][-1] == "\n"


def test_junk_sale_returns_empty():
    source, posts = load_posts()
    sale = next(post for post in posts if post["id"] == "j01")
    assert process_post(sale["text"], source=source) == []


def test_explicit_svo_returns_empty():
    text = "Набор на СВО. Служба по контракту, денежное довольствие 200 000 руб. Тел. 071-123-45-67."
    assert process_post(text, source=SOURCE) == []


def test_deterministic_same_text_same_result():
    text = (
        "Требуется сварщик на завод.\nОбязанности: сварка.\n"
        "Оклад 45 000 руб, график 5/2. Тел. 071-123-45-67. Никитовка."
    )
    first = process_post(text, source=SOURCE)
    second = process_post(text, source=SOURCE)
    assert json.dumps(first, ensure_ascii=False, sort_keys=True) == json.dumps(
        second, ensure_ascii=False, sort_keys=True
    )


def test_empty_fields_absent_not_guessed():
    text = "СРОЧНО!!! НУЖЕН СВАРНОЙ НА ЗАВОД, ЗП ХОРОШАЯ, ЗВОНИТЬ 071-123-45-67"
    records = process_post(text, source=SOURCE)
    assert records
    record = records[0]
    assert "salaryFrom" not in record
    assert "salaryTo" not in record
    assert "districtSlug" not in record
    assert record["title"] == "Сварщик"
    assert record["summaryLine"]
    assert isinstance(record["completeness"], int)
    assert record["completenessBreakdown"]
    assert "По договорённости" not in (record.get("summaryLine") or "")


def test_phone_not_in_description():
    text = "Требуется продавец, график 2/2, зп 25 000 руб. Звонить 071-123-45-67."
    record = process_post(text, source=SOURCE)[0]
    blob = record.get("description") or ""
    sections = record.get("descriptionSections") or {}
    hay = blob + json.dumps(sections, ensure_ascii=False)
    assert record["contactPhone"] == "+79491234567"
    assert extract_phone(hay) == []


def test_each_record_has_summary_and_completeness():
    text = "Требуется повар в столовую, график 2/2, ставка 1 500 руб/смена. 071-321-45-67"
    record = process_post(text, source=SOURCE)[0]
    assert record["summaryLine"]
    assert "Повар" in record["summaryLine"]
    assert 0 <= record["completeness"] <= 100
    ids = {item["id"] for item in record["completenessBreakdown"]}
    assert "salary" in ids
    assert "contact" in ids


def test_vahta_two_geographies():
    text = (
        "Сварщики на Ямал, 60/30, проживание и питание за счёт компании. "
        "Зарплата 180 000 руб за смену. Набор в Горловке. Тел. +79492223344"
    )
    record = process_post(text, source=SOURCE)[0]
    assert record["workFormat"] == "VAHTA"
    assert record["citySlug"] == "gorlovka"
    assert record.get("workLocationText")
    dest = record.get("workDestinationSlug")
    loc = record["workLocationText"]
    assert dest in {"yanao", "yamalo-nenets"} or "Ямал" in loc or "ЯНАО" in loc
    assert record.get("rotationPattern") == "60/30"
    assert "schedule" not in record
    assert record["citySlug"] != record.get("workCitySlug")


def test_local_schedule_not_rotation():
    text = "Продавец, график 2/2, ТЦ Центральный, зп 25 000 руб, 071-123-45-67"
    record = process_post(text, source=SOURCE)[0]
    assert record["workFormat"] == "LOCAL"
    assert record.get("schedule") == "2/2"
    assert "rotationPattern" not in record


def test_process_post_is_the_only_parser_entry():
    source = PROCESS_PY.read_text(encoding="utf-8")
    assert "def process_post(" in source
    assert "assemble_post(" in source
    view = VIEW_TS.read_text(encoding="utf-8")
    assert "originalText" in view
    assert "Показать оригинал" in view
    assert "completeness" in view
