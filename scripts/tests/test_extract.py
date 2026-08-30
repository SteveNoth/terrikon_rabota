"""Зарплата и телефон: отдельные обязательные тесты."""

from __future__ import annotations

from extract import content_hash, extract_contacts, extract_phone, extract_profession, extract_professions, extract_salary, extract_schedule


def test_salary_range_is_not_a_phone():
    """«30 000 - 45 000» — деньги, не телефон."""
    text = "Продавец, зп 30 000 - 45 000 руб, график 2/2"
    assert extract_phone(text) == []
    salary = extract_salary(text)
    assert salary is not None
    assert salary.min_amount == 30000
    assert salary.max_amount == 45000


def test_salary_forms():
    samples = [
        ("от 45000 руб", 45000, None, "month"),
        ("45 000 – 60 000 руб", 45000, 60000, "month"),
        ("45-60 тыс", 45000, 60000, "month"),
        ("до 70000 руб", None, 70000, "month"),
        ("1500 руб/смена", 1500, 1500, "shift"),
        ("оклад 30000 + премия", 30000, 30000, "month"),
        ("з/п 40 000", 40000, 40000, "month"),
        ("оплата 5.000 ₽", 5000, 5000, "month"),
        ("зарплата от 80 до 100тыс", 80000, 100000, "month"),
        ("100 000  110 000 ₽", 100000, 110000, "month"),
    ]
    for text, min_amount, max_amount, period in samples:
        salary = extract_salary(text)
        assert salary is not None, text
        assert salary.min_amount == min_amount, text
        assert salary.max_amount == max_amount, text
        assert salary.period == period, text
        if "премия" in text:
            assert salary.has_bonus


def test_phone_digits_are_not_salary():
    salary = extract_salary("оклад 35 000 руб. Тел. 071-202-30-40")
    assert salary is not None
    assert salary.min_amount == 35000
    assert salary.max_amount == 35000
    assert extract_salary("Нужны люди. Телефон +7 949 123-00-11") is None


def test_schedule_and_time_are_not_salary():
    assert extract_salary("график 2/2, смена 8-17") is None
    assert extract_salary("работа с 9-18 без выходных") is None
    assert extract_schedule("график 2/2") == "2/2"


def test_dnr_phones_normalize():
    samples = [
        ("071-123-45-67", "+79491234567", "dpr071"),
        ("+79491234567", "+79491234567", "dpr7949"),
        ("+7 (949) 123-45-67", "+79491234567", "dpr7949"),
        ("8 949 123 45 67", "+79491234567", "dpr7949"),
        ("072-111-22-33", "+79591112233", "lpr072"),
    ]
    for text, normalized, kind in samples:
        phones = extract_phone(f"звонить {text}")
        assert len(phones) == 1, text
        assert phones[0].normalized == normalized, text
        assert phones[0].kind == kind, text


def test_two_phones_on_two_lines():
    phones = extract_phone("79490788074\n79042499651")
    assert {item.normalized for item in phones} >= {"+79490788074", "+79042499651"}


def test_profession_synonyms():
    hit = extract_profession("нужен сварной на завод")
    assert hit is not None
    assert hit.slug == "svarshchik"
    assert hit.name == "Сварщик"

    hit = extract_profession("вод. кат. с на камаз")
    assert hit is not None
    assert hit.slug == "voditel-c"


def test_extract_professions_all_hits_not_nested_compound():
    hits = extract_professions("нужен сварщик и повар")
    assert [item.slug for item in hits] == ["svarshchik", "povar"]
    compound = extract_professions("водитель-экспедитор на газель")
    assert [item.slug for item in compound] == ["ekspeditor"]
    best = extract_profession("нужен сварщик и повар")
    assert best is not None
    assert best.slug == "svarshchik"


def test_contacts_username_and_link():
    contacts = extract_contacts("писать @brigadir_71 и https://t.me/rabota_g")
    assert "@brigadir_71" in contacts.usernames
    assert any("t.me/rabota_g" in item for item in contacts.links)


def test_content_hash_stable():
    text = "Требуется сварщик, 071-123-45-67"
    first = content_hash(text, "+79491234567")
    second = content_hash(text, "+79491234567")
    assert first == second
    assert len(first) == 40
    changed = content_hash(text + " ещё", "+79491234567")
    assert changed != first
