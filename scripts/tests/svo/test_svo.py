"""Отсев СВО: явный слой, скрытый слой, смешанный пост, JSON без правки кода."""

from __future__ import annotations

import json
from pathlib import Path
from typing import get_args

from extract import extract_profession
from filter import compile_term, fold_text, is_vacancy
from svo import apply_svo_gate, explicit_svo, hidden_svo, reload_svo, unit_fields
from tests.svo import load_svo_samples
from vahta import WorkFormat, detect_work_format
import shared_config

ROOT = Path(__file__).resolve().parents[3]
SVO_PY = ROOT / "scripts" / "svo.py"
PRISMA = ROOT / "prisma" / "schema.prisma"


def _slugs(units) -> list[str]:
    return [unit.profession.slug for unit in units if unit.profession is not None]


def test_samples_match_expected():
    source, market, posts = load_svo_samples()
    failures = []
    for post in posts:
        kind = post["kind"]
        text = post["text"]
        if kind == "explicit":
            got = explicit_svo(text).verdict
            if got != post["expected"]:
                failures.append(
                    f"{post['id']}: explicit ждали {post['expected']}, получили {got} "
                    f"{explicit_svo(text).reasons}"
                )
        elif kind == "hidden":
            decision = hidden_svo(unit_fields(text), text, market)
            if decision.verdict != post["expected"]:
                failures.append(
                    f"{post['id']}: hidden ждали {post['expected']}, получили {decision.verdict} "
                    f"{decision.reasons}"
                )
            if explicit_svo(text).verdict != "clear":
                failures.append(f"{post['id']}: скрытый пример задет явным слоем")
        elif kind == "control":
            explicit = explicit_svo(text)
            hidden = hidden_svo(unit_fields(text), text, market)
            work_format = detect_work_format(text)
            if explicit.verdict != "clear":
                failures.append(f"{post['id']}: контроль задет явным слоем ({explicit.reasons})")
            if hidden.verdict != "clear":
                failures.append(f"{post['id']}: контроль задет скрытым слоем ({hidden.reasons})")
            if work_format != post["expectedFormat"]:
                failures.append(
                    f"{post['id']}: формат {work_format}, ждали {post['expectedFormat']}"
                )
        elif kind == "mixed":
            units = apply_svo_gate(text, source=source, market=market)
            if len(units) != post["expectedUnits"]:
                failures.append(
                    f"{post['id']}: ждали {post['expectedUnits']} единиц, получили {len(units)} "
                    f"({_slugs(units)})"
                )
            else:
                keep = list(post.get("keepProfessions") or [])
                drop = list(post.get("dropProfessions") or [])
                got = _slugs(units)
                if keep and got != keep:
                    failures.append(f"{post['id']}: оставили {got}, ждали {keep}")
                if any(slug in got for slug in drop):
                    failures.append(f"{post['id']}: не отбросили {drop}, осталось {got}")
        if "gateUnits" in post:
            units = apply_svo_gate(text, source=source, market=market)
            if len(units) != post["gateUnits"]:
                failures.append(
                    f"{post['id']}: ворота ждали {post['gateUnits']} единиц, получили {len(units)}"
                )
            if post.get("needsHumanReview") and units and not units[0].needs_human_review:
                failures.append(f"{post['id']}: ждали пометку на модерацию")
    assert failures == [], "\n".join(failures)


def test_explicit_whole_post_no_units():
    text = (
        "Набор на СВО. Нужен повар, зарплата 80 000 руб. Горловка.\n"
        "Также требуется охранник, зарплата 45 000 руб. Тел. 071-123-45-67"
    )
    assert explicit_svo(text).verdict == "reject"
    assert apply_svo_gate(text) == []


def test_mixed_post_keeps_welder_drops_guard():
    source, market, _posts = load_svo_samples()
    text = (
        "Нужен сварщик на завод, зарплата 45 000 руб. Горловка.\n"
        "Также требуется охранник, зарплата 250 000 руб. Тел. 071-123-45-67"
    )
    units = apply_svo_gate(text, source=source, market=market)
    assert len(units) == 1
    assert units[0].profession is not None
    assert units[0].profession.slug == "svarshchik"
    assert units[0].salary is None or units[0].salary.min_amount == 45000


def test_local_guard_market_rate_is_local():
    text = "Требуется охранник, зарплата 28 000 руб. Горловка. График 2/2. Тел. 071-111-22-33."
    assert detect_work_format(text) == "LOCAL"
    _, market, _posts = load_svo_samples()
    assert hidden_svo(unit_fields(text), text, market).verdict == "clear"
    units = apply_svo_gate(text, market=market)
    assert len(units) == 1


def test_yamal_cook_is_vahta_not_svo():
    text = (
        "Вахта, повар на Ямал, 60/30, зарплата 180 000 руб, "
        "проживание предоставляется. 071-131-41-51."
    )
    assert detect_work_format(text) == "VAHTA"
    _, market, _posts = load_svo_samples()
    assert hidden_svo(unit_fields(text), text, market).verdict == "clear"
    assert extract_profession(text) is not None
    assert extract_profession(text).slug == "povar"


def test_mariupol_restoration_is_vahta():
    text = "Вахта на восстановление Мариуполя с проживанием. Сварщик, зарплата 150 000 руб."
    assert detect_work_format(text) == "VAHTA"
    _, market, _posts = load_svo_samples()
    assert hidden_svo(unit_fields(text), text, market).verdict == "clear"


def test_welder_high_local_pay_is_not_svo():
    """Сварщик 250 000 местный — не СВО. Это потом trust_score, не скрытый набор."""
    text = "Требуется сварщик на завод, зарплата 250 000 руб. Горловка. График 5/2. 071-191-01-12."
    assert detect_work_format(text) == "LOCAL"
    _, market, _posts = load_svo_samples()
    hidden = hidden_svo(unit_fields(text), text, market)
    assert hidden.verdict == "clear"
    assert any(item.id == "not_cover" for item in hidden.rules)


def test_one_condition_is_not_enough():
    _, market, _posts = load_svo_samples()
    cover_only = "Требуется охранник, зарплата 28 000 руб. Горловка. График 2/2. 071-111-22-33."
    assert hidden_svo(unit_fields(cover_only), cover_only, market).verdict == "clear"
    pay_only = "Требуется сварщик, зарплата 250 000 руб. Горловка. График 5/2. 071-191-01-12."
    assert hidden_svo(unit_fields(pay_only), pay_only, market).verdict == "clear"
    vahta_cover = (
        "Вахта, охранник на Ямал, 60/30, зарплата 250 000 руб, "
        "проживание предоставляется. 071-131-41-51."
    )
    assert hidden_svo(unit_fields(vahta_cover), vahta_cover, market).verdict == "clear"


def test_shift_pay_not_compared_to_monthly_median():
    _, market, _posts = load_svo_samples()
    text = "Требуется охранник, 1 500 руб за смену. Горловка. График 2/2. 071-111-22-33."
    hidden = hidden_svo(unit_fields(text), text, market)
    assert hidden.verdict == "clear"
    assert any(item.id == "salary_period" for item in hidden.rules)


def test_svoego_and_promzona_are_not_svo():
    svoego = compile_term({"id": "svo_abbr", "pattern": "\\bсво\\b"})
    folded = fold_text("водитель на своем автомобиле и для своих")
    assert svoego.search(fold_text("набор на СВО"))
    assert not svoego.search(folded)
    assert not svoego.search(fold_text("из своего кармана"))
    zona = "Работа в промышленной зоне. Требуется охранник, зарплата 28 000 руб. График 2/2."
    assert explicit_svo(zona).verdict == "clear"


def test_no_forbidden_stems_in_json():
    cfg = shared_config.get_keywords()["svo"]
    for entry in cfg["explicit"]:
        stem = fold_text(str(entry.get("stem") or ""))
        phrase = fold_text(str(entry.get("phrase") or ""))
        pattern = str(entry.get("pattern") or "")
        assert stem not in {"зон", "зона"}
        assert "мобилизац" not in stem and "мобилизац" not in phrase
        assert stem != "контракт"
        assert stem != "своим"
        if stem == "сво":
            endings = entry.get("endings")
            assert endings is None or endings == [""]


def test_cover_slugs_exist_in_professions():
    slugs = {item["slug"] for item in shared_config.get_profession_items()}
    for slug in shared_config.get_keywords()["svo"]["coverProfessions"]:
        assert slug in slugs, slug


def test_work_format_has_no_fourth_value():
    assert set(get_args(WorkFormat)) == {"LOCAL", "VAHTA", "REMOTE"}
    assert "SVO" not in get_args(WorkFormat)
    schema = PRISMA.read_text(encoding="utf-8")
    enum_body = schema.split("enum WorkFormat")[1].split("}")[0]
    assert "SVO" not in enum_body
    assert "LOCAL" in enum_body and "VAHTA" in enum_body and "REMOTE" in enum_body


def test_svo_py_does_not_call_vacancy_or_trust():
    source = SVO_PY.read_text(encoding="utf-8")
    assert "is_vacancy(" not in source
    assert "trust_score(" not in source
    assert "from filter import" in source
    assert "is_vacancy" not in source.split("from filter import")[1].split("\n")[0]


def test_is_vacancy_still_accepts_svo_shaped_ad():
    """Фильтр отвечает «это вакансия?». Набор на СВО часто выглядит как вакансия."""
    text = (
        "Требуется повар на СВО, зарплата 250 000 руб, график 2/2. "
        "Телефон 071-123-45-67. Горловка."
    )
    assert is_vacancy(text).verdict in {"accept", "maybe"}
    assert explicit_svo(text).verdict == "reject"
    assert apply_svo_gate(text) == []


def test_json_threshold_changes_explicit_without_code(tmp_path, monkeypatch):
    original_path = shared_config.KEYWORDS_PATH
    data = json.loads(original_path.read_text(encoding="utf-8"))
    data["svo"]["thresholds"]["reject"] = 10_000
    data["svo"]["thresholds"]["maybe"] = 9_000
    dest = tmp_path / "keywords.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    text = "Набор на СВО. Денежное довольствие 200 000 руб. Тел. 071-123-45-67."
    assert explicit_svo(text).verdict == "reject"
    monkeypatch.setattr(shared_config, "KEYWORDS_PATH", dest)
    reload_svo()
    try:
        decision = explicit_svo(text)
        assert decision.thresholds["reject"] == 10_000
        assert decision.verdict == "clear"
    finally:
        monkeypatch.setattr(shared_config, "KEYWORDS_PATH", original_path)
        reload_svo()
    restored = explicit_svo(text)
    assert restored.verdict == "reject"
    assert restored.thresholds["reject"] == 40


def test_json_cover_list_changes_hidden_without_code(tmp_path, monkeypatch):
    original_path = shared_config.KEYWORDS_PATH
    data = json.loads(original_path.read_text(encoding="utf-8"))
    data["svo"]["coverProfessions"] = [
        slug for slug in data["svo"]["coverProfessions"] if slug != "ohrannik"
    ]
    dest = tmp_path / "keywords.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    text = "Требуется охранник, зарплата 250 000 руб. Горловка. График 2/2. 071-123-45-67."
    _, market, _posts = load_svo_samples()
    assert hidden_svo(unit_fields(text), text, market).verdict == "reject"
    monkeypatch.setattr(shared_config, "KEYWORDS_PATH", dest)
    reload_svo()
    try:
        assert hidden_svo(unit_fields(text), text, market).verdict == "clear"
    finally:
        monkeypatch.setattr(shared_config, "KEYWORDS_PATH", original_path)
        reload_svo()
    assert hidden_svo(unit_fields(text), text, market).verdict == "reject"


def test_maybe_explicit_does_not_split():
    text = (
        "Требуется контрактник сварщик, зарплата 80 000 руб. Горловка.\n"
        "Также требуется контрактник повар, зарплата 45 000 руб. 071-123-45-67."
    )
    assert explicit_svo(text).verdict == "maybe"
    units = apply_svo_gate(text)
    assert len(units) == 1
    assert units[0].needs_human_review
    assert units[0].raw_text == text


def test_live_svo_posts_rejected():
    _source, market, posts = load_svo_samples()
    live = [post for post in posts if post.get("origin") == "real" and post["kind"] == "explicit"]
    assert len(live) >= 5
    for post in live:
        assert explicit_svo(post["text"]).verdict == "reject", post["id"]
        assert apply_svo_gate(post["text"], market=market) == [], post["id"]


def test_live_vahta_not_svo():
    _source, market, posts = load_svo_samples()
    live = [post for post in posts if post.get("origin") == "real" and post["kind"] == "control"]
    assert len(live) >= 5
    for post in live:
        assert explicit_svo(post["text"]).verdict == "clear", post["id"]
        hidden = hidden_svo(unit_fields(post["text"]), post["text"], market)
        assert hidden.verdict == "clear", (post["id"], hidden.reasons)
        assert detect_work_format(post["text"]) == "VAHTA", post["id"]
        assert apply_svo_gate(post["text"], market=market), post["id"]


def test_svoim_wordplay_is_explicit_not_svoego():
    wordplay = "Ты нужен России ты нужен СВОим. Присоединяйся к сильнейшим."
    assert explicit_svo(wordplay).verdict == "reject"
    driver = (
        "Требуется водитель, нужен своим автомобилем, зарплата 35 000 руб. "
        "Горловка. График 5/2. 071-171-81-91."
    )
    assert explicit_svo(driver).verdict == "clear"


def test_punkt_otbora_rejected_even_if_looks_like_vahta():
    """Жильё + питание + проезд ставят VAHTA, но пункт отбора МО — не вахта."""
    text = (
        "Пункт отбора МО РФ: Контракт от 1 года. "
        "Оплатим проезд, обеспечим жильем и питанием, обучим на полигоне."
    )
    assert detect_work_format(text) == "VAHTA"
    assert explicit_svo(text).verdict == "reject"
    assert apply_svo_gate(text) == []


def test_bron_ot_mobilizatsii_is_not_svo():
    text = (
        "Вахта Ямал, 60/30, бронь от мобилизации, повар, зарплата 180 000 руб, "
        "проживание предоставляется. 071-181-91-01."
    )
    assert "мобилизац" in fold_text(text)
    assert explicit_svo(text).verdict == "clear"
    assert detect_work_format(text) == "VAHTA"
