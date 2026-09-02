"""Вахта: две ловушки и разделение города набора / места работы."""

from __future__ import annotations

from extract import extract_city, extract_schedule
from vahta import (
    describe_vahta,
    detect_employer_kind,
    detect_work_format,
    extract_rotation,
    extract_vahta_conditions,
    extract_work_location,
)

GORLOVKA = {"name": "Работа Горловка", "default_city": "gorlovka"}


def test_shift_2_2_is_local_not_vahta():
    """2/2 не делает вакансию вахтой и остаётся в поле «график»."""
    text = "Продавец, график 2/2, ТЦ Центральный"
    assert detect_work_format(text) == "LOCAL"
    assert extract_schedule(text) == "2/2"
    assert extract_rotation(text) is None


def test_rotation_60_30_is_not_schedule():
    """60/30 — ротация, не график смен."""
    text = "Сварщики на Ямал, 60/30, проживание и питание"
    assert detect_work_format(text) == "VAHTA"
    rotation = extract_rotation(text)
    assert rotation is not None
    assert rotation.pattern == "60/30"
    assert rotation.vahta_days == 60
    assert extract_schedule(text) is None


def test_yamal_vahta_two_places():
    text = "Сварщики на Ямал, 60/30, проживание и питание"
    location = extract_work_location(text)
    assert location.work_destination_slug == "yanao"
    assert location.work_location_text == "ЯНАО"
    assert location.work_city_slug is None
    city = extract_city(text, source=GORLOVKA, work_format="VAHTA")
    assert city.city_slug == "gorlovka"
    assert city.reason == "source_default"
    # Это два разных поля: набор и место работы.
    assert city.city_slug != location.work_destination_slug


def test_vahta_inside_our_geography():
    """Вахта бывает в Мариуполе. Нельзя решать формат по «чужому» городу."""
    text = "Вахта на восстановление Мариуполя с проживанием"
    assert detect_work_format(text) == "VAHTA"
    location = extract_work_location(text)
    assert location.work_city_slug == "mariupol"
    city = extract_city(text, source=GORLOVKA, work_format="VAHTA")
    assert city.city_slug == "gorlovka"
    assert city.city_slug != location.work_city_slug


def test_external_destination_alone_is_not_vahta():
    """Ямал без слов вахты и без 60/30 — не повод ставить VAHTA."""
    text = "Продавец в магазин, Москва, график 2/2, зп 40 000 руб"
    assert detect_work_format(text) == "LOCAL"


def test_vahter_is_not_vahta():
    """Вахтёр — охранник, не вахтовый метод."""
    text = "Требуется вахтёр в магазин, график 2/2, зп 25 000 руб, 071-123-45-67"
    assert detect_work_format(text) == "LOCAL"
    assert extract_schedule(text) == "2/2"


def test_conditions_and_agency():
    text = (
        "Вахта, проживание предоставляется, питание оплачивается, "
        "проезд оплачиваем, подсменные. Кадровое агентство."
    )
    conditions = extract_vahta_conditions(text)
    assert conditions.housing
    assert conditions.meals
    assert conditions.travel
    assert conditions.advance
    assert detect_employer_kind(text) == "AGENCY"
    assert detect_employer_kind("напрямую от работодателя, без посредников") == "DIRECT"


def test_describe_keeps_two_geo_fields():
    text = "Сварщики на Ямал, 60/30, проживание и питание"
    row = describe_vahta(text, source=GORLOVKA)
    assert row["workFormat"] == "VAHTA"
    assert row["citySlug"] == "gorlovka"
    assert row["workLocationText"] == "ЯНАО"
    assert "workCitySlug" not in row


def test_real_norilsk_and_inner_schedule():
    """Живой пост: Норильск 45/45, и 60/30 рядом с внутренним 6/1."""
    norilsk = (
        "Приглашает на работу вахтовым методом (город Норильск). "
        "Сроки вахты 45/45, 60/30, 90/30. Проживание и питание."
    )
    assert detect_work_format(norilsk) == "VAHTA"
    location = extract_work_location(norilsk)
    assert location.work_destination_slug == "norilsk"
    rotation = extract_rotation(norilsk)
    assert rotation is not None
    assert rotation.pattern == "45/45"

    mixed = (
        "РАБОТА ВАХТОВЫМ МЕТОДОМ. Северо-Енисейск (Красноярский край). "
        "Слесарь по ремонту автомобилей - 180 000. График: 60/30. "
        "Внутренний график: 6/1 c 8:00 до 19:00."
    )
    assert detect_work_format(mixed) == "VAHTA"
    assert extract_rotation(mixed).pattern == "60/30"
    assert extract_schedule(mixed) == "6/1"
    dest = extract_work_location(mixed)
    assert dest.work_destination_slug == "krasnoyarsk"
