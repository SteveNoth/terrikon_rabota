"""План переобработки единиц и сохранённый OCR без повторного скачивания."""

from __future__ import annotations

from process import process_post
from reprocess import plan_units


def test_plan_units_zero_new_would_remove_all():
    """plan_units(1, 0) снимает единственную единицу. reprocess это не вызывает: пустой process_post пропускаем."""
    matched, added, removed = plan_units(1, 0)
    assert matched == 0
    assert added == []
    assert removed == [0]


def test_reprocess_skips_empty_process_post():
    from pathlib import Path

    text = (Path(__file__).resolve().parents[2] / "reprocess.py").read_text(encoding="utf-8")
    assert "if not records:" in text
    assert "решение модерации важнее" in text



def test_plan_units_more_after_split():
    matched, added, removed = plan_units(1, 3)
    assert matched == 1
    assert added == [1, 2]
    assert removed == []


def test_plan_units_fewer_after_split():
    matched, added, removed = plan_units(3, 1)
    assert matched == 1
    assert added == []
    assert removed == [1, 2]


def test_saved_ocr_text_does_not_need_images():
    caption = ""
    ocr = "Требуется продавец консультант, зарплата 28000 руб, график 2/2, телефон 071 123-45-01."
    records = process_post(caption, source={"default_city": "gorlovka", "name": "тест"}, ocr_text=ocr)
    assert records
    assert records[0]["rawText"] == ""
    assert "продав" in (records[0].get("title") or "").lower() or records[0].get("professionSlug") == "prodavets"


def test_no_autopublish_in_parser_and_repo():
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    forbidden = (
        "publishAfter",
        "autoPublish",
        "expirePending",
        "approveAfter",
        "опубликовать через 24",
        "AUTO_OK after",
    )
    hits: list[str] = []
    for folder in (root / "src",):
        for path in folder.rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".js", ".mjs"}:
                continue
            text = path.read_text(encoding="utf-8")
            for needle in forbidden:
                if needle in text:
                    hits.append(f"{path}: {needle}")
    assert hits == []
