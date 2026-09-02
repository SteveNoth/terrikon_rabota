"""Отчёт качества оценки доверия: по каждому правилу — сколько раз сработало и сколько раз это было верно.

Правило, которое чаще ошибается, чем угадывает, надо не «доработать», а убрать:
иначе оно тихо засоряет очередь модерации, и ей нельзя верить.

Запуск (из корня проекта):
    python scripts/tests/trust_report.py
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from process import process_post  # noqa: E402
from tests.fraud import load_fraud_samples  # noqa: E402

SKIP_ACCURACY = {"new_contact"}


def _pad(text: str, width: int) -> str:
    return str(text)[:width].ljust(width)


def main() -> int:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    data = load_fraud_samples()
    source = data.get("source") or {"name": "Работа Горловка", "default_city": "gorlovka"}
    market = data.get("market") or {}
    hits: Counter[str] = Counter()
    correct: Counter[str] = Counter()
    mistakes: list[str] = []

    print()
    print(
        _pad("id", 22),
        _pad("тип", 8),
        _pad("ждали", 10),
        _pad("получили", 12),
        "правила",
    )
    print("-" * 110)

    for sample in data["samples"]:
        records = process_post(sample["text"], source=source, market=market)
        expected = sample["expectedStatus"]
        if not records:
            mistakes.append(f"{sample['id']}: пустой список")
            print(_pad(sample["id"], 22), _pad(sample["kind"], 8), expected, "пусто")
            continue

        statuses = [item["moderationStatus"] for item in records]
        flags = [flag for item in records for flag in item.get("trustFlags") or []]
        rule_ids = [flag["id"] for flag in flags if flag["id"] not in SKIP_ACCURACY]
        honest = sample["kind"] == "honest"
        fraud_like = sample["kind"] in {"fraud", "prepaid"}

        if expected == "BLOCKED":
            ok = all(status == "BLOCKED" for status in statuses)
        elif expected == "AUTO_OK":
            ok = any(status == "AUTO_OK" for status in statuses) and "BLOCKED" not in statuses
        else:
            ok = "AUTO_OK" not in statuses

        if sample.get("expectedAutoPublish") is False and "AUTO_OK" in statuses:
            ok = False

        mark = "ок" if ok else "ОШИБКА"
        if not ok:
            mistakes.append(
                f"{sample['id']}: ждали {expected}, получили {statuses} "
                f"score={[item['trustScore'] for item in records]}"
            )

        for rule_id in rule_ids:
            hits[rule_id] += 1
            if fraud_like:
                correct[rule_id] += 1
            elif honest:
                pass

        print(
            _pad(sample["id"], 22),
            _pad(sample["kind"], 8),
            _pad(expected, 10),
            _pad(f"{statuses[0]}/{mark}", 12),
            ", ".join(rule_ids[:6]) or "—",
        )

    print("-" * 110)
    print("Правила (сработало / из них верно на обмане; на честном срабатывание — ошибка):")
    weak: list[str] = []
    for rule_id, count in hits.most_common():
        ok_count = correct[rule_id]
        ratio = ok_count / count if count else 0
        flag = ""
        if count >= 2 and ratio < 0.5:
            flag = "  ← убрать, точность ниже половины"
            weak.append(rule_id)
        print(f"  {count:3}  верно {ok_count:3}  {ratio:5.0%}  {rule_id}{flag}")

    live_fraud = [item for item in data["samples"] if item.get("origin") == "real" and item["kind"] == "fraud"]
    live_honest = [item for item in data["samples"] if item.get("origin") == "real" and item["kind"] == "honest"]
    print()
    print(f"Живых обманок: {len(live_fraud)}, живых честных вахт: {len(live_honest)}.")
    print("Честных местных с высокой зп — в синтетике (руководитель участка, машинист).")

    if weak:
        print("Правила с точностью ниже половины:")
        for rule_id in weak:
            print("  ", rule_id)
        return 1
    if mistakes:
        print("Где ошиблись:")
        for line in mistakes:
            print("  ", line)
        return 1
    print("Расхождений с ожидаемым нет. Правил слабее половины нет.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
