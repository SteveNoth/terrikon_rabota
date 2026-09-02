"""Сигнатура, шинглы, Жаккар, корзины. Дубли объединяем, не удаляем."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from dedupe import build_signature, cluster_records, jaccard, shingles
from process import process_post
from tests.fraud import load_fraud_samples

SOURCE = {"name": "Работа Горловка", "default_city": "gorlovka"}


def _records_from_yamal() -> list[dict]:
    data = load_fraud_samples()
    market = data["market"]
    records = []
    for item in data["yamalGroup"]:
        source = {"name": "Работа", "default_city": item["city"]}
        batch = process_post(item["text"], source=source, market=market)
        assert batch, item["id"]
        record = batch[0]
        record["text"] = item["text"]
        records.append(record)
    return records


def test_eight_yamal_paraphrases_one_group():
    records = _records_from_yamal()
    assert len(records) == 8
    signatures = {item["signature"] for item in records}
    assert len(signatures) == 1, signatures
    groups = cluster_records(records)
    clustered = [group for group in groups if len(group) > 1]
    assert clustered, groups
    assert max(len(group) for group in groups) == 8


def test_yamal_from_gorlovka_and_donetsk_same_group():
    records = _records_from_yamal()
    cities = {item.get("citySlug") for item in records}
    assert "gorlovka" in cities
    assert "donetsk" in cities
    groups = cluster_records(records)
    assert max(len(group) for group in groups) == 8


def test_local_sellers_different_cities_not_grouped():
    data = load_fraud_samples()
    pair = data["cityPair"]
    gorlovka = process_post(
        pair["gorlovka"],
        source={"name": "Работа", "default_city": "gorlovka"},
    )[0]
    donetsk = process_post(
        pair["donetsk"],
        source={"name": "Работа", "default_city": "donetsk"},
    )[0]
    assert gorlovka["professionSlug"] == donetsk["professionSlug"] == "prodavets"
    assert gorlovka["workFormat"] == donetsk["workFormat"] == "LOCAL"
    assert gorlovka["citySlug"] == "gorlovka"
    assert donetsk["citySlug"] == "donetsk"
    assert gorlovka["signature"] != donetsk["signature"]
    groups = cluster_records([gorlovka, donetsk])
    assert groups == [[0], [1]] or sorted(groups) == [[0], [1]]
    assert all(len(group) == 1 for group in groups)


def test_jaccard_example_from_comment():
    left = shingles("сварщик вахта ямал проживание питание")
    right = shingles("сварщик вахта ямал проживание питание официально")
    score = jaccard(left, right)
    assert score > 0.6
    assert abs(score - 0.75) < 0.01


def test_compare_only_inside_baskets_timing():
    """1000 записей. Сравниваем внутри корзин, не каждую с каждой."""
    now = datetime.now(timezone.utc)
    records = []
    for index in range(1000):
        bucket = index % 50
        records.append(
            {
                "professionSlug": f"job-{bucket}",
                "workFormat": "VAHTA" if bucket % 2 == 0 else "LOCAL",
                "workDestinationSlug": f"dest-{bucket}",
                "citySlug": f"city-{bucket}",
                "salaryFrom": 100000 + (bucket * 1000),
                "rotationPattern": "60/30" if bucket % 2 == 0 else None,
                "unitText": (
                    f"требуются сварщики на вахту ямал проживание питание график "
                    f"номер {index} корзина {bucket} зарплата стабильная официально"
                ),
                "publishedAt": now - timedelta(days=index % 40),
            }
        )
        records[-1]["signature"] = build_signature(records[-1])
    started = time.perf_counter()
    groups = cluster_records(records, now=now)
    elapsed = time.perf_counter() - started
    assert elapsed < 3.0, f"корзины заняли {elapsed:.2f} с — слишком долго"
    assert groups
    assert sum(len(group) for group in groups) == 1000


def test_old_records_outside_60_days_skipped():
    now = datetime.now(timezone.utc)
    text = "требуются сварщики на вахту ямал проживание питание график 60/30"
    fresh = {
        "professionSlug": "svarshchik",
        "workFormat": "VAHTA",
        "workDestinationSlug": "yanao",
        "salaryFrom": 180000,
        "rotationPattern": "60/30",
        "unitText": text,
        "publishedAt": now - timedelta(days=10),
    }
    old = dict(fresh)
    old["publishedAt"] = now - timedelta(days=90)
    fresh["signature"] = build_signature(fresh)
    old["signature"] = build_signature(old)
    groups = cluster_records([fresh, old], now=now)
    assert groups == [[0]]


def test_signature_uses_work_location_for_vahta_not_hiring_city():
    gorlovka = {
        "professionSlug": "svarshchik",
        "workFormat": "VAHTA",
        "citySlug": "gorlovka",
        "workDestinationSlug": "yanao",
        "salaryFrom": 180000,
        "rotationPattern": "60/30",
    }
    donetsk = dict(gorlovka)
    donetsk["citySlug"] = "donetsk"
    assert build_signature(gorlovka) == build_signature(donetsk)


def test_process_post_assigns_signature_does_not_cluster():
    from pathlib import Path

    source = Path(__file__).resolve().parents[2] / "process.py"
    text = source.read_text(encoding="utf-8")
    assert "build_signature(" in text
    assert "cluster_records(" not in text
