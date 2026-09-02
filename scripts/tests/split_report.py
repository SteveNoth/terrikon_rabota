"""Отчёт качества нарезки: единицы, профессии, где ошиблись.

Запуск (из корня проекта, виртуальное окружение уже включено):
    python scripts/tests/split_report.py
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

from split import split_post  # noqa: E402
from tests.split import load_split_samples  # noqa: E402


def _pad(text: str, width: int) -> str:
    return str(text)[:width].ljust(width)


def main() -> int:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    source, posts = load_split_samples()
    rule_hits: Counter[str] = Counter()
    rule_ok: Counter[str] = Counter()
    mistakes: list[str] = []

    print()
    print(
        _pad("id", 10),
        _pad("тип", 8),
        _pad("ждали", 6),
        _pad("получили", 10),
        _pad("профессии", 36),
        "причины / ошибка",
    )
    print("-" * 110)

    for post in posts:
        units = split_post(post["text"], source=source)
        slugs = [unit.profession.slug if unit.profession else "—" for unit in units]
        reasons = []
        for unit in units:
            reasons.extend(unit.reasons)
        ok = len(units) == post["expectedUnits"]
        expected_slugs = list(post.get("professions") or [])
        if expected_slugs and slugs[: len(expected_slugs)] != expected_slugs:
            ok = False
        mark = "ок" if ok else "ОШИБКА"
        if ok:
            for reason in reasons:
                rule_hits[reason] += 1
                rule_ok[reason] += 1
        else:
            for reason in reasons:
                rule_hits[reason] += 1
            mistakes.append(
                f"{post['id']}: ждали {post['expectedUnits']} {expected_slugs}, "
                f"получили {len(units)} {slugs}"
            )
        print(
            _pad(post["id"], 10),
            _pad(post["kind"], 8),
            _pad(str(post["expectedUnits"]), 6),
            _pad(f"{len(units)}/{mark}", 10),
            _pad(", ".join(slugs), 36),
            ", ".join(dict.fromkeys(reasons)) or "—",
        )

    print("-" * 110)
    print("Правила (сколько раз сработало / сколько из них на верном примере):")
    for reason, count in rule_hits.most_common():
        correct = rule_ok[reason]
        ratio = correct / count if count else 0
        flag = "  ← убрать, если часто режет зря" if count >= 2 and ratio < 0.5 else ""
        print(f"  {count:3}  верно {correct:3}  {reason}{flag}")

    print()
    real_sheets = [post for post in posts if post.get("kind") == "sheet" and post["id"].startswith("real")]
    if not real_sheets:
        print("Живых простыней в samples.json ещё нет. Пришлите 8–10 постов из групп.")
    if mistakes:
        print("Где ошиблись:")
        for line in mistakes:
            print("  ", line)
        return 1
    print("Расхождений с ожидаемым нет.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
