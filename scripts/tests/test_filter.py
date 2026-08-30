"""Фильтр is_vacancy: примеры, границы слов, порог из JSON."""

from __future__ import annotations

import json

from extract import extract_city
from filter import compiled, compile_term, fold_text, is_vacancy, reload_keywords
from tests.data import load_posts
import shared_config


def test_every_post_matches_expected():
    source, posts = load_posts()
    failures = []
    for post in posts:
        decision = is_vacancy(post["text"], source=source)
        if decision.verdict != post["expected"]:
            failures.append(
                f"{post['id']}: ждали {post['expected']}, получили {decision.verdict} "
                f"(баллы {decision.score}) {decision.reasons}"
            )
    assert failures == [], "\n".join(failures)


def test_no_real_vacancy_rejected():
    source, posts = load_posts()
    rejected = [
        post["id"]
        for post in posts
        if post["kind"] == "vacancy"
        and is_vacancy(post["text"], source=source).verdict == "reject"
    ]
    assert rejected == []


def test_no_junk_accepted():
    source, posts = load_posts()
    accepted = [
        post["id"]
        for post in posts
        if post["kind"] == "junk" and is_vacancy(post["text"], source=source).verdict == "accept"
    ]
    assert accepted == []


def test_maybe_not_lost():
    source, posts = load_posts()
    lost = [
        f"{post['id']} → {is_vacancy(post['text'], source=source).verdict}"
        for post in posts
        if post["kind"] == "maybe"
        and is_vacancy(post["text"], source=source).verdict not in {"maybe", "accept"}
    ]
    assert lost == []


def test_konkurs_is_not_kurs():
    """«конкурс» не стоп-слово «курс». Раздел 11.2 — отдельный тест."""
    pattern = compile_term(
        {"id": "kurs", "stem": "курс", "endings": ["", "ы", "ов", "а", "ами", "ах", "ом", "е"]}
    )
    assert pattern.search(fold_text("набор на курсы сварщиков"))
    assert pattern.search(fold_text("курс английского"))
    assert not pattern.search(fold_text("конкурс на лучшего сварщика"))
    assert not pattern.search(fold_text("экскурсия на завод"))

    text = (
        "Требуется сварщик на завод. Конкурсный отбор, испытательный срок. "
        "Оклад 45 000 руб, график 5/2. Телефон 071-123-45-67."
    )
    decision = is_vacancy(text)
    stop_ids = [rule.id for rule in decision.rules if rule.id.startswith("stop:kurs")]
    assert stop_ids == []
    assert decision.verdict == "accept"


def test_akciya_and_forma_boundaries():
    akciya = compile_term({"id": "akciya", "stem": "акци", "endings": ["я", "и", "ю", "ей"], "requireEnding": True})
    forma = compile_term({"id": "forma", "stem": "форм", "endings": ["а", "ы", "у", "е", "ой"]})
    assert not akciya.search(fold_text("реакция на объявление"))
    assert not akciya.search(fold_text("фракция депутатов"))
    assert akciya.search(fold_text("акция скидки 50%"))
    assert not forma.search(fold_text("информация для жителей"))
    assert forma.search(fold_text("форма выдаётся"))


def test_threshold_change_without_code(tmp_path, monkeypatch):
    """Порог в keywords.json меняет решение, код тот же."""
    original_path = shared_config.KEYWORDS_PATH
    data = json.loads(original_path.read_text(encoding="utf-8"))
    data["thresholds"]["accept"] = 10_000
    dest = tmp_path / "keywords.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    source, posts = load_posts()
    vacancy = next(post for post in posts if post["kind"] == "vacancy")

    monkeypatch.setattr(shared_config, "KEYWORDS_PATH", dest)
    reload_keywords()
    try:
        decision = is_vacancy(vacancy["text"], source=source)
        assert decision.thresholds["accept"] == 10_000
        assert decision.verdict != "accept"
    finally:
        monkeypatch.setattr(shared_config, "KEYWORDS_PATH", original_path)
        reload_keywords()

    restored = is_vacancy(vacancy["text"], source=source)
    assert restored.verdict == "accept"
    assert restored.thresholds["accept"] == 60


def test_city_from_source_without_word_gorlovka():
    text = (
        "Требуется продавец в магазин, график 2/2, зп 25 000 руб. "
        "Звонить 071-123-45-67. ТЦ Центральный."
    )
    source = {"name": "Работа Горловка", "default_city": "gorlovka"}
    folded = fold_text(text)
    assert "горловк" not in folded
    city = extract_city(text, source=source)
    assert city.city_slug == "gorlovka"
    assert city.reason == "source_default"
    assert is_vacancy(text, source=source).verdict == "accept"


def test_district_gives_owner_city():
    text = "Нужен продавец возле Никитовского рынка, зп 22 000 руб, 071-123-45-67, график 2/2"
    city = extract_city(text)
    assert city.city_slug == "gorlovka"
    assert city.district_slug == "nikitovka"
    assert city.reason in {"district", "explicit_city"}


def test_homoglyphs_become_cyrillic():
    """Латиница в «Тpeбуeтся» рядом с кириллицей не ломает маркер вакансии."""
    mixed = "Тpeбуeтся продавец, график 2/2, зп 25 000 руб, 071-123-45-67"
    assert "требуется" in fold_text(mixed)
    assert "https" == fold_text("https")
    assert is_vacancy(mixed).verdict == "accept"


def test_kurse_vuza_is_not_a_course():
    """«курсе вуза» — курс обучения в институте, не стоп-слово «курсы»."""
    kurs = next(pattern for entry, pattern in compiled()["stopWords"] if entry.get("id") == "kurs")
    assert kurs.search(fold_text("набор на курсы сварщиков"))
    assert not kurs.search(fold_text("обучение на 3-6 курсе вуза или колледжа"))
    text = (
        "Стажер по работе с клиентами. Город: Горловка. График: 5/2. "
        "Обязанности: консультирование клиентов. "
        "Требования: обучение на 3-6 курсе вуза. https://hh.ru/vacancy/1"
    )
    decision = is_vacancy(text)
    assert "stop:kurs" not in [rule.id for rule in decision.rules]
    assert decision.verdict != "reject"
