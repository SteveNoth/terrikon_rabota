"""Оценка доверия: независимость от фильтра, пороги, живые примеры, предоплата."""

from __future__ import annotations

import json
from pathlib import Path

from filter import is_vacancy
from process import process_post
from tests.fraud import load_fraud_samples
from trust import reload_trust, trust_score
import shared_config

ROOT = Path(__file__).resolve().parents[3]
TRUST_PY = ROOT / "scripts" / "trust.py"
FILTER_PY = ROOT / "scripts" / "filter.py"

SOURCE = {"name": "Работа Горловка", "default_city": "gorlovka"}


def _data():
    return load_fraud_samples()


def _by_id(sample_id: str) -> dict:
    for item in _data()["samples"]:
        if item["id"] == sample_id:
            return item
    raise KeyError(sample_id)


def _process(sample: dict, **kwargs):
    source = dict(_data()["source"])
    market = _data()["market"]
    return process_post(sample["text"], source=source, market=market, **kwargs)


def test_is_vacancy_and_trust_never_call_each_other():
    trust_src = TRUST_PY.read_text(encoding="utf-8")
    filter_src = FILTER_PY.read_text(encoding="utf-8")
    assert "is_vacancy(" not in trust_src
    assert "explicit_svo(" not in trust_src
    assert "hidden_svo(" not in trust_src
    assert "trust_score(" not in filter_src
    assert "from trust import" not in filter_src


def test_is_vacancy_still_accepts_fraud_shaped_ads():
    """Фильтр отвечает «это вакансия?». Живые обманки из файла оформлены как вакансии."""
    for sample in _data()["samples"]:
        if sample["kind"] != "fraud" or sample.get("origin") != "real":
            continue
        assert is_vacancy(sample["text"], source=SOURCE).verdict in {"accept", "maybe"}


def test_lichka_250k_not_auto_published():
    sample = _by_id("sy-lichka")
    records = _process(sample)
    assert records
    assert records[0]["moderationStatus"] != "AUTO_OK"
    assert records[0]["trustScore"] < 70


def test_honest_vahta_180k_publishes():
    sample = _by_id("vh02")
    records = _process(sample)
    assert records
    record = next(
        (item for item in records if item.get("professionSlug") == "mashinist-ekskavatora"),
        records[0],
    )
    assert record["workFormat"] == "VAHTA"
    assert record["trustScore"] >= 70
    assert record["moderationStatus"] == "AUTO_OK"
    assert record["moderationStatus"] != "BLOCKED"


def test_honest_local_high_pay_not_rejected():
    for sample_id in ("sy-rukovoditel", "sy-mashinist-local"):
        sample = _by_id(sample_id)
        records = _process(sample)
        assert records, sample_id
        assert records[0]["workFormat"] == "LOCAL"
        assert records[0]["moderationStatus"] != "BLOCKED"
        assert records[0]["trustScore"] >= 70
        assert records[0]["moderationStatus"] == "AUTO_OK"


def test_prepaid_is_blocked_not_queued():
    for sample in _data()["samples"]:
        if sample["kind"] != "prepaid":
            continue
        records = _process(sample)
        assert records, sample["id"]
        for record in records:
            assert record["moderationStatus"] == "BLOCKED", sample["id"]
            assert record["trustScore"] == 0
            assert record["needsHumanReview"] is False


def test_salary_detail_has_both_numbers_and_sample_size():
    sample = _by_id("sy-prodavets")
    records = _process(sample)
    assert records
    flags = records[0]["trustFlags"]
    median_flags = [item for item in flags if item["id"] == "salary_vs_median"]
    assert median_flags, flags
    detail = median_flags[0]["detail"]
    assert "250 000" in detail or "250000" in detail.replace(" ", "")
    assert "35 000" in detail
    assert "выборка 47" in detail
    assert "продавец" in detail.lower()


def test_hourly_detail_has_both_rates():
    sample = _by_id("sy-prodavets")
    records = _process(sample)
    flags = records[0]["trustFlags"]
    hourly = [item for item in flags if item["id"] == "hourly_vs_median"]
    assert hourly, flags
    detail = hourly[0]["detail"]
    assert "в час" in detail
    assert "при медиане" in detail


def test_samples_match_expected_status():
    failures = []
    for sample in _data()["samples"]:
        records = _process(sample)
        if not records:
            failures.append(f"{sample['id']}: process_post вернул пусто")
            continue
        statuses = {item["moderationStatus"] for item in records}
        expected = sample["expectedStatus"]
        if expected == "BLOCKED":
            if statuses != {"BLOCKED"}:
                failures.append(f"{sample['id']}: ждали BLOCKED, получили {statuses}")
        elif expected == "AUTO_OK":
            if any(item["moderationStatus"] == "BLOCKED" for item in records):
                failures.append(f"{sample['id']}: честный пример заблокирован")
            if not any(item["moderationStatus"] == "AUTO_OK" for item in records):
                failures.append(
                    f"{sample['id']}: ждали AUTO_OK, получили {statuses} "
                    f"score={[item['trustScore'] for item in records]}"
                )
        else:
            if any(item["moderationStatus"] == "AUTO_OK" and sample.get("expectedAutoPublish") is False for item in records):
                failures.append(f"{sample['id']}: не должны автопубликовать, получили AUTO_OK")
            if all(item["moderationStatus"] == "AUTO_OK" for item in records):
                failures.append(f"{sample['id']}: ждали не авто, все AUTO_OK")
    assert not failures, "\n".join(failures)


def test_new_contact_goes_to_review_even_if_score_high():
    sample = _by_id("vh02")
    records = _process(sample, contact_verdicts={})
    record = records[0]
    assert record["trustScore"] >= 70
    assert record["moderationStatus"] == "PENDING"
    assert record["needsHumanReview"] is True
    ids = {item["id"] for item in record["trustFlags"]}
    assert "new_contact" in ids


def test_trusted_contact_can_auto_publish():
    sample = _by_id("vh02")
    records = _process(sample)
    phone = records[0]["contactPhone"]
    trusted = _process(sample, contact_verdicts={phone: "TRUSTED"})
    assert trusted[0]["moderationStatus"] == "AUTO_OK"


def test_blacklisted_contact_blocked():
    sample = _by_id("sy-mashinist-local")
    records = _process(sample)
    phone = records[0]["contactPhone"]
    blocked = _process(sample, contact_verdicts={phone: "BLOCKED"})
    assert blocked[0]["moderationStatus"] == "BLOCKED"


def test_json_threshold_changes_without_code(tmp_path, monkeypatch):
    original = shared_config.KEYWORDS_PATH
    data = json.loads(original.read_text(encoding="utf-8"))
    data["fraud"]["thresholds"]["publish"] = 101
    dest = tmp_path / "keywords.json"
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    sample = _by_id("sy-mashinist-local")
    assert _process(sample)[0]["moderationStatus"] == "AUTO_OK"
    monkeypatch.setattr(shared_config, "KEYWORDS_PATH", dest)
    reload_trust()
    try:
        decision = trust_score(
            {
                "professionSlug": "mashinist-ekskavatora",
                "professionName": "Машинист экскаватора",
                "sphere": "transport",
                "salaryFrom": 85000,
                "salaryPeriod": "MONTH",
                "workFormat": "LOCAL",
                "contactPhone": "+79495554433",
                "employerName": "ООО Горняк",
                "description": sample["text"] * 2,
            },
            sample["text"],
            _data()["market"],
        )
        assert decision.moderation_status == "PENDING"
        assert decision.score >= 70
    finally:
        monkeypatch.setattr(shared_config, "KEYWORDS_PATH", original)
        reload_trust()


def test_process_post_always_has_trust_fields():
    records = process_post(
        "Требуется сварщик на завод, оклад 45 000 руб, график 5/2. Тел. 071-123-45-67.",
        source=SOURCE,
    )
    assert records
    record = records[0]
    assert "trustScore" in record
    assert "trustFlags" in record
    assert "signature" in record
    assert "moderationStatus" in record
    assert 0 <= record["trustScore"] <= 100


def test_trust_does_not_import_vacancy_helpers():
    source = TRUST_PY.read_text(encoding="utf-8")
    assert "from filter import is_vacancy" not in source
    assert "from svo import" not in source


def test_aggregation_many_phones_lowers_score():
    sample = _by_id("sy-mashinist-local")
    base = _process(sample)[0]
    crowded = _process(sample, aggregation={"distinctPhones": 8})[0]
    assert crowded["trustScore"] < base["trustScore"]
    ids = {item["id"] for item in crowded["trustFlags"]}
    assert "many_phones_in_group" in ids


def test_no_rule_weaker_than_half_on_samples():
    """Правило, которое чаще врёт, чем угадывает, засоряет очередь — его нет."""
    hits: dict[str, int] = {}
    correct: dict[str, int] = {}
    for sample in _data()["samples"]:
        records = _process(sample)
        fraud_like = sample["kind"] in {"fraud", "prepaid"}
        for record in records:
            for flag in record.get("trustFlags") or []:
                rule_id = flag["id"]
                if rule_id == "new_contact":
                    continue
                hits[rule_id] = hits.get(rule_id, 0) + 1
                if fraud_like:
                    correct[rule_id] = correct.get(rule_id, 0) + 1
    weak = [
        f"{rule_id}: {correct.get(rule_id, 0)}/{hits[rule_id]}"
        for rule_id, count in hits.items()
        if count >= 2 and correct.get(rule_id, 0) / count < 0.5
    ]
    assert not weak, "убрать из JSON: " + "; ".join(weak)
