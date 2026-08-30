"""Отчёт качества отсева СВО: явные правила, скрытый слой, контроли.

Запуск (из корня проекта, виртуальное окружение уже включено):
    python scripts/tests/svo_report.py
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

from svo import apply_svo_gate, explicit_svo, hidden_svo, unit_fields  # noqa: E402
from tests.svo import load_svo_samples  # noqa: E402
from vahta import detect_work_format  # noqa: E402


def _pad(text: str, width: int) -> str:
    return str(text)[:width].ljust(width)


def main() -> int:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    source, market, posts = load_svo_samples()
    rule_hits: Counter[str] = Counter()
    rule_ok: Counter[str] = Counter()
    mistakes: list[str] = []

    print()
    print(
        _pad("id", 12),
        _pad("тип", 9),
        _pad("ждали", 8),
        _pad("получили", 10),
        _pad("ворот", 8),
        "правила / ошибка",
    )
    print("-" * 110)

    for post in posts:
        kind = post["kind"]
        text = post["text"]
        explicit = explicit_svo(text)
        hidden = hidden_svo(unit_fields(text), text, market)
        units = apply_svo_gate(text, source=source, market=market)
        work_format = detect_work_format(text)

        if kind == "explicit":
            expected = post["expected"]
            got = explicit.verdict
            rules = [item.id for item in explicit.rules]
        elif kind == "hidden":
            expected = post["expected"]
            got = hidden.verdict
            rules = [item.id for item in hidden.rules]
        elif kind == "control":
            expected = f"clear/{post['expectedFormat']}"
            hidden_ok = hidden.verdict == "clear"
            explicit_ok = explicit.verdict == "clear"
            format_ok = work_format == post["expectedFormat"]
            got = f"{hidden.verdict}/{work_format}"
            if not (hidden_ok and explicit_ok and format_ok):
                got = f"explicit={explicit.verdict} hidden={hidden.verdict} {work_format}"
            rules = [item.id for item in explicit.rules] + [item.id for item in hidden.rules]
        else:
            expected = f"{post['expectedUnits']} ед."
            got = f"{len(units)} ед."
            rules = list(units[0].reasons) if units else ["отброшен"]

        gate_ok = True
        if "gateUnits" in post and len(units) != post["gateUnits"]:
            gate_ok = False
        if kind == "mixed" and len(units) != post["expectedUnits"]:
            gate_ok = False

        if kind == "control":
            ok = (
                explicit.verdict == "clear"
                and hidden.verdict == "clear"
                and work_format == post["expectedFormat"]
                and gate_ok
            )
        elif kind == "mixed":
            slugs = [unit.profession.slug for unit in units if unit.profession]
            keep = list(post.get("keepProfessions") or [])
            drop = list(post.get("dropProfessions") or [])
            ok = len(units) == post["expectedUnits"] and (not keep or slugs == keep)
            ok = ok and not any(slug in slugs for slug in drop)
        else:
            ok = got == expected and gate_ok

        mark = "ок" if ok else "ОШИБКА"
        if ok:
            for rule_id in rules:
                rule_hits[rule_id] += 1
                rule_ok[rule_id] += 1
        else:
            for rule_id in rules:
                rule_hits[rule_id] += 1
            mistakes.append(f"{post['id']}: ждали {expected}, получили {got}")

        print(
            _pad(post["id"], 12),
            _pad(kind, 9),
            _pad(str(expected), 8),
            _pad(f"{got}/{mark}", 10) if len(str(got)) < 8 else _pad(f"{mark}", 10),
            _pad(str(len(units)), 8),
            ", ".join(rules[:6]) or "—",
        )

    print("-" * 110)
    print("Правила (сколько раз сработало / сколько из них на верном примере):")
    for rule_id, count in rule_hits.most_common():
        correct = rule_ok[rule_id]
        ratio = correct / count if count else 0
        flag = "  ← убрать, если часто срабатывает зря" if count >= 2 and ratio < 0.5 else ""
        print(f"  {count:3}  верно {correct:3}  {rule_id}{flag}")

    print()
    live = [post for post in posts if post.get("origin") == "real"]
    live_svo = [post for post in live if post["kind"] == "explicit"]
    live_vahta = [post for post in live if post["kind"] == "control"]
    live_hidden = [post for post in live if post["kind"] == "hidden"]
    print(
        f"Живых явных: {len(live_svo)}, живых вахт-контроль: {len(live_vahta)}, "
        f"живых скрытых: {len(live_hidden)}."
    )
    if not live_svo:
        print("Живых явных наборов в samples.json ещё нет.")
    if not live_hidden:
        print("Скрытых живых наборов нет — в парсерных группах их не нашли, остаются синтетика.")
    if mistakes:
        print("Где ошиблись:")
        for line in mistakes:
            print("  ", line)
        return 1
    print("Расхождений с ожидаемым нет.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
