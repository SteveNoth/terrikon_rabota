"""Каждая функция нормализатора — свой тест (раздел 11.9)."""

from __future__ import annotations

import json

from enrich import enrich_district, enrich_sphere, lookup_employer_by_phone, missing_info
from normalize import (
    build_summary_line,
    clean_title,
    completeness,
    dedupe_phrases,
    emoji_to_structure,
    fix_caps,
    fix_paragraphs,
    reload_normalize,
    split_sections,
    strip_junk,
    truncate_smart,
)
from process import process_post
from tests.normalization import check_expected, load_canonical_samples
import shared_config


SOURCE = {"name": "Работа Горловка", "default_city": "gorlovka", "externalId": "norm-src"}


def test_clean_title_srochno_svarnoy():
    title, original = clean_title("СРОЧНО!!! нужен сварной 🔥")
    assert title == "Сварщик"
    assert "СРОЧНО" in original


def test_fix_caps_keeps_dnr_and_ooo():
    text = "ТРЕБУЕТСЯ СВАРЩИК В ООО РОМАШКА. РАБОТА В ДНР. ОКЛАД 45 000 РУБ."
    out = fix_caps(text)
    assert "ООО" in out
    assert "ДНР" in out
    assert "Требуется" in out or "требуется" not in out.lower().split("ооо")[0]
    letters = [ch for ch in out if ch.isalpha()]
    caps = sum(1 for ch in letters if ch.isupper())
    assert caps / max(len(letters), 1) < 0.6
    assert "ДНР" in out and "ООО" in out


def test_emoji_to_structure_makes_list():
    text = "Требуется продавец\n✅ касса\n✅ витрина\nЗП 25000"
    out = emoji_to_structure(text)
    assert "- касса" in out
    assert "- витрина" in out
    assert "✅" not in out


def test_emoji_order_comment_exists():
    source = (shared_config.ROOT / "scripts" / "normalize.py").read_text(encoding="utf-8")
    assert "если удалить" in source.casefold() or "если вычистить" in source.casefold()
    assert "безвозвратно" in source or "не собрать" in source


def test_split_sections_four_blocks():
    text = (
        "Сварщик на завод.\n"
        "Обязанности:\nсварка швов\nчтение чертежей\n"
        "Требования:\nопыт от 1 года\n"
        "Условия:\nграфик 5/2, оклад 45 000\n"
        "Контакты:\n071-123-45-67"
    )
    sections = split_sections(text)
    assert sections.tasks
    assert sections.requirements
    assert sections.conditions
    joined = " ".join(sections.tasks + sections.requirements + sections.conditions)
    assert "071" not in joined
    assert "сварка" in " ".join(sections.tasks).casefold()


def test_strip_junk_subscribe_and_hashtags():
    text = "Оклад 45 000. Подписывайтесь на нашу группу #работа #вахта репост приветствуется"
    out = strip_junk(text)
    fold = out.casefold()
    assert "подписывайтесь" not in fold
    assert "#работа" not in out
    assert "репост" not in fold


def test_fix_paragraphs_spaces_and_breaks():
    text = "Нужен сварщик ,оклад 45000.Звонить завтра.\n\n\nвторая строка"
    out = fix_paragraphs(text)
    assert "сварщик, оклад" in out or "сварщик , оклад" not in out
    assert ". Звонить" in out or ".Звонить" not in out
    assert "\n\n\n" not in out


def test_dedupe_phrases_keeps_one():
    text = "Сварка швов.\nСварка швов.\nОклад 45 000."
    out = dedupe_phrases(text)
    assert out.casefold().count("сварка швов") == 1


def test_truncate_smart_sentence_boundary():
    sentence = "Это предложение номер {}. ".format
    text = "".join(sentence(i) for i in range(1, 400))
    assert len(text) > 3000
    cut, truncated = truncate_smart(text)
    assert truncated
    assert len(cut) <= 3100
    assert not cut.rstrip("…")[-1].isalnum() or "…" in cut


def test_build_summary_line_skips_missing():
    line = build_summary_line(
        {
            "title": "Сварщик",
            "districtName": "Никитовка",
            "salaryFrom": 45000,
            "salaryTo": 60000,
            "schedule": "2/2",
            "experienceSummary": "опыт от 1 года",
            "workFormat": "LOCAL",
        }
    )
    assert line == "Сварщик · Никитовка · 45 000–60 000 ₽ · 2/2 · опыт от 1 года"
    short = build_summary_line({"title": "Сварщик", "workFormat": "LOCAL"})
    assert short == "Сварщик"
    assert "₽" not in short


def test_completeness_breakdown_sums_to_score():
    score, breakdown = completeness(
        {
            "salaryFrom": 45000,
            "schedule": "2/2",
            "districtSlug": "nikitovka",
            "experience": "FROM_1_TO_3",
            "employmentType": "FULL",
            "contactPhone": "+79491234567",
            "description": "x" * 250,
            "descriptionSections": {"tasks": ["сварка"]},
            "employerName": "ООО Ромашка",
        }
    )
    assert 0 <= score <= 100
    assert breakdown
    present = sum(item["weight"] for item in breakdown if item["present"])
    total = sum(item["weight"] for item in breakdown)
    assert score == round(100 * present / total)
    empty, empty_break = completeness({})
    assert empty < 40
    assert any(not item["present"] for item in empty_break)


def test_enrich_district_nikitovka_market():
    slug = enrich_district("магазин возле Никитовского рынка", "gorlovka")
    assert slug == "nikitovka"


def test_enrich_sphere_from_profession():
    assert enrich_sphere("svarshchik") == "stroitelstvo"


def test_employer_by_phone_index():
    found = lookup_employer_by_phone(
        "+79491234567",
        {"+79491234567": {"name": "ООО Ромашка", "vacancyCount": 5}},
    )
    assert found is not None
    assert found["employerName"] == "ООО Ромашка"
    assert found["otherVacancies"] == 4
    assert lookup_employer_by_phone("+79490000000", {}) is None


def test_missing_info_turns_gap_into_hint():
    hints = missing_info({"workFormat": "LOCAL"})
    assert "зарплату" in hints
    assert "телефон или другой контакт" in hints


def test_samples_match_expected():
    source, posts = load_canonical_samples()
    failures = []
    for post in posts:
        records = process_post(post["text"], source=source)
        errors = check_expected(records, post["expected"])
        if errors:
            failures.append(f"{post['id']}: " + "; ".join(errors))
    assert failures == [], "\n".join(failures)


def test_json_limit_change_without_code(tmp_path, monkeypatch):
    """Порог в normalize.json меняет обрезку, код тот же."""
    original_path = shared_config.NORMALIZE_PATH
    data = json.loads(original_path.read_text(encoding="utf-8"))
    data["maxDescriptionChars"] = 80
    dest = tmp_path / "normalize.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    text = (
        "Требуется сварщик на завод. "
        + ("Сварка металлоконструкций на объекте заказчика. " * 15)
        + "Оклад 45 000 руб, график 5/2. Тел. 071-123-45-67."
    )
    monkeypatch.setattr(shared_config, "NORMALIZE_PATH", dest)
    reload_normalize()
    try:
        records = process_post(text, source=SOURCE)
        assert records
        desc = records[0].get("description") or ""
        assert "…" in desc
        assert len(desc) < 200
    finally:
        monkeypatch.setattr(shared_config, "NORMALIZE_PATH", original_path)
        reload_normalize()
    restored = process_post(text, source=SOURCE)
    desc = restored[0].get("description") or ""
    assert len(desc) > 200
    assert restored[0]["normalizerVersion"] == "1"
