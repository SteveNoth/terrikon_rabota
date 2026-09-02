"""Нарезка поста: простыни, контрольные, контракт id, правила из JSON."""

from __future__ import annotations

import json

from extract import extract_profession, extract_professions
from filter import fold_text
from split import reload_split, split_post, unit_external_id
from tests.split import load_split_samples
import shared_config


def _slugs(units) -> list[str]:
    return [unit.profession.slug for unit in units if unit.profession is not None]


def _salary_min(unit) -> int | None:
    if unit.salary is None:
        return None
    return unit.salary.min_amount


def test_samples_match_expected():
    source, posts = load_split_samples()
    failures = []
    for post in posts:
        units = split_post(post["text"], source=source)
        if len(units) != post["expectedUnits"]:
            failures.append(
                f"{post['id']}: ждали {post['expectedUnits']} единиц, получили {len(units)} "
                f"({_slugs(units)}) {units[0].reasons if units else ''}"
            )
            continue
        slugs = _slugs(units)
        expected = list(post["professions"])
        if slugs[: len(expected)] != expected and slugs != expected:
            failures.append(f"{post['id']}: профессии {slugs}, ждали {expected}")
        if post.get("needsHumanReview"):
            if not units[0].needs_human_review:
                failures.append(f"{post['id']}: ждали пометку на модерацию")
        elif any(unit.needs_human_review for unit in units):
            failures.append(f"{post['id']}: лишняя пометка на модерацию")
        salaries = post.get("salaries") or []
        for index, amount in enumerate(salaries):
            if index >= len(units):
                break
            got = _salary_min(units[index])
            if got != amount:
                failures.append(f"{post['id']} единица {index}: зарплата {got}, ждали {amount}")
        for field_name in post.get("inherited") or []:
            for unit in units:
                if field_name == "city" and "горловк" not in fold_text(unit.unit_text):
                    failures.append(f"{post['id']}: нет города в единице {unit.split_index}")
                if field_name == "housing" and "жил" not in fold_text(unit.unit_text) and "проживан" not in fold_text(unit.unit_text):
                    failures.append(f"{post['id']}: нет жилья в единице {unit.split_index}")
                if field_name == "phone" and not unit.phones:
                    failures.append(f"{post['id']}: нет телефона в единице {unit.split_index}")
    assert failures == [], "\n".join(failures)


def test_welder_and_cook_different_salaries():
    text = (
        "Нужен сварщик на завод, зарплата 80 000 руб.\n"
        "Горловка. Жильё предоставляется. Тел. 071-123-45-67\n"
        "Также требуется повар, зарплата 45 000 руб."
    )
    units = split_post(text, source={"externalId": "vk-1", "default_city": "gorlovka"})
    assert len(units) == 2
    assert units[0].profession is not None and units[0].profession.slug == "svarshchik"
    assert units[1].profession is not None and units[1].profession.slug == "povar"
    assert _salary_min(units[0]) == 80000
    assert _salary_min(units[1]) == 45000
    assert units[1].salary is None or units[1].salary.min_amount != 80000
    for unit in units:
        folded = fold_text(unit.unit_text)
        assert "горловк" in folded
        assert "жил" in folded
        assert unit.phones
        assert unit.raw_text == text


def test_driver_expeditor_stays_one():
    text = "Водитель-экспедитор, зарплата 40 000 руб, 071-123-45-67"
    units = split_post(text)
    assert len(units) == 1
    assert not units[0].needs_human_review
    hits = extract_professions(text)
    assert [hit.slug for hit in hits] == ["ekspeditor"]


def test_duty_paragraphs_not_split():
    text = (
        "Требуется сварщик на завод.\n\n"
        "Обязанности:\n\n"
        "Сварка металлоконструкций.\n\n"
        "Чтение чертежей.\n\n"
        "Работа на высоте.\n\n"
        "Соблюдение ТБ.\n\n"
        "Сдача работ мастеру.\n\n"
        "Оклад 45 000 руб. 071-123-45-67"
    )
    units = split_post(text)
    assert len(units) == 1
    assert units[0].profession is not None
    assert units[0].profession.slug == "svarshchik"


def test_max_units_cap_from_json(tmp_path, monkeypatch):
    original_path = shared_config.SPLIT_PATH
    data = json.loads(original_path.read_text(encoding="utf-8"))
    data["maxUnits"] = 2
    dest = tmp_path / "split.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    text = (
        "Вакансии:\n"
        "1. Сварщик 50 000 руб\n"
        "2. Повар 30 000 руб\n"
        "3. Водитель 40 000 руб\n"
        "4. Охранник 25 000 руб\n"
        "5. Разнорабочий 20 000 руб\n"
        "071-123-45-67"
    )
    monkeypatch.setattr(shared_config, "SPLIT_PATH", dest)
    reload_split()
    try:
        units = split_post(text)
        assert len(units) == 2
        assert len(units) <= 2
        assert units[0].needs_human_review
        assert units[0].splitter_version == data["SPLITTER_VERSION"]
    finally:
        monkeypatch.setattr(shared_config, "SPLIT_PATH", original_path)
        reload_split()
    restored = split_post(text)
    assert len(restored) == 5


def test_doubtful_one_unit_and_review():
    text = "Нужен сварщик и повар на базу отдыха, зарплата 40 000 руб, телефон 071-123-45-67"
    units = split_post(text)
    assert len(units) == 1
    assert units[0].needs_human_review
    assert "doubtful" in units[0].reasons


def test_same_text_same_units():
    text = (
        "Нужен сварщик, зарплата 80 000 руб. Горловка, 071-123-45-67.\n"
        "Также требуется повар, зарплата 45 000 руб."
    )
    first = [unit.as_dict() for unit in split_post(text, source={"externalId": "p1"})]
    second = [unit.as_dict() for unit in split_post(text, source={"externalId": "p1"})]
    assert first == second


def test_identity_contract():
    """Этап 15: первая единица без суффикса, дети #2/#3, rawText полный."""
    source = {"externalId": "vk-555", "default_city": "gorlovka"}
    single = split_post("Продавец, зп 25 000 руб, 071-123-45-67", source=source)
    assert len(single) == 1
    assert single[0].external_id == "vk-555"
    assert single[0].source_post_external_id == "vk-555"
    assert single[0].split_index == 0
    assert unit_external_id("vk-555", 0, 1) == "vk-555"

    text = (
        "Нужен сварщик, зарплата 80 000 руб.\n"
        "Также требуется повар, зарплата 45 000 руб.\n"
        "Также требуется охранник, зарплата 25 000 руб."
    )
    units = split_post(text, source=source)
    assert len(units) == 3
    assert [unit.external_id for unit in units] == ["vk-555", "vk-555#2", "vk-555#3"]
    assert [unit.split_index for unit in units] == [0, 1, 2]
    assert all(unit.source_post_external_id == "vk-555" for unit in units)
    assert all(unit.raw_text == text for unit in units)
    assert units[0].unit_text != units[1].unit_text
    slugs = _slugs(units)
    assert len(set(slugs)) == 3


def test_extract_profession_still_one_best():
    hit = extract_profession("нужен сварщик и повар на завод")
    assert hit is not None
    assert hit.slug == "svarshchik"
    hits = extract_professions("нужен сварщик и повар на завод")
    assert [item.slug for item in hits] == ["svarshchik", "povar"]


def test_two_phones_stay_with_own_unit():
    text = (
        "ООО Металл ищет сварщика, зарплата 45 000 руб, тел. 071-111-11-11\n"
        "От другого работодателя: повар в столовую, зарплата 30 000 руб, тел. 071-222-22-22"
    )
    units = split_post(text)
    assert len(units) == 2
    first_phones = {item.normalized for item in units[0].phones}
    second_phones = {item.normalized for item in units[1].phones}
    assert any(item.endswith("1111111") for item in first_phones)
    assert any(item.endswith("2222222") for item in second_phones)
    assert _salary_min(units[0]) == 45000
    assert _salary_min(units[1]) == 30000
    assert "45 000" not in units[1].unit_text or _salary_min(units[1]) != 45000
    folded_second = fold_text(units[1].unit_text)
    assert "45 000" not in units[1].unit_text and "45000" not in folded_second.replace(" ", "")


def test_marker_change_in_json_changes_split(tmp_path, monkeypatch):
    original_path = shared_config.SPLIT_PATH
    data = json.loads(original_path.read_text(encoding="utf-8"))
    data["roleMarkers"] = [
        item for item in data["roleMarkers"] if not str(item.get("id", "")).startswith("takzhe")
    ]
    data["roleMarkers"] = [
        item for item in data["roleMarkers"] if not str(item.get("id", "")).endswith("_role")
    ]
    dest = tmp_path / "split.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    text = (
        "Нужен сварщик, зарплата 80 000 руб. Горловка, 071-123-45-67.\n"
        "Также требуется повар, зарплата 45 000 руб."
    )
    monkeypatch.setattr(shared_config, "SPLIT_PATH", dest)
    reload_split()
    try:
        units = split_post(text)
        assert len(units) == 1
    finally:
        monkeypatch.setattr(shared_config, "SPLIT_PATH", original_path)
        reload_split()
    restored = split_post(text)
    assert len(restored) == 2
