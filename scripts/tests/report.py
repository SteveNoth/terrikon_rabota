"""Отчёт качества фильтра: таблица по примерам и частые правила.

Запуск (из корня проекта, виртуальное окружение уже включено):
    python scripts/tests/report.py
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

from extract import extract_profession, extract_salary  # noqa: E402
from filter import is_vacancy  # noqa: E402
from tests.data import load_posts  # noqa: E402
from vahta import detect_work_format  # noqa: E402


def _pad(text: str, width: int) -> str:
    return str(text)[:width].ljust(width)


def main() -> int:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    source, posts = load_posts()
    verdicts = Counter()
    formats = Counter()
    rules = Counter()
    mistakes: list[str] = []
    kinds_ok = Counter()
    kinds_fail = Counter()

    print()
    print(
        _pad("id", 6),
        _pad("тип", 8),
        _pad("ждали", 8),
        _pad("получили", 10),
        _pad("баллы", 6),
        _pad("формат", 8),
        "профессия / зарплата / правила",
    )
    print("-" * 110)

    for post in posts:
        decision = is_vacancy(post["text"], source=source)
        work_format = detect_work_format(post["text"])
        profession = extract_profession(post["text"])
        salary = extract_salary(post["text"])
        verdicts[decision.verdict] += 1
        formats[work_format] += 1
        for rule in decision.rules:
            rules[rule.id] += 1

        ok = decision.verdict == post["expected"]
        if ok:
            kinds_ok[post["kind"]] += 1
        else:
            kinds_fail[post["kind"]] += 1
            mistakes.append(
                f"{post['id']}: ждали {post['expected']}, получили {decision.verdict} "
                f"({decision.score}) {decision.reasons[:4]}"
            )

        mark = "ок" if ok else "ОШИБКА"
        prof_name = profession.name if profession else "—"
        salary_s = "—"
        if salary is not None:
            salary_s = f"{salary.min_amount or '—'}-{salary.max_amount or '—'}"
        top = ", ".join(f"{item.id}{item.points:+d}" for item in decision.rules[:4])
        print(
            _pad(post["id"], 6),
            _pad(post["kind"], 8),
            _pad(post["expected"], 8),
            _pad(f"{decision.verdict}/{mark}", 10),
            _pad(str(decision.score), 6),
            _pad(work_format, 8),
            f"{prof_name}; {salary_s}; {top}",
        )

    print("-" * 110)
    print(
        "Итого решений: "
        f"принято {verdicts['accept']}, спорных {verdicts['maybe']}, отброшено {verdicts['reject']}"
    )
    print(f"Распознано вахтами: {formats['VAHTA']}  (местных {formats['LOCAL']}, удалённых {formats['REMOTE']})")
    print("Чаще всего срабатывают правила:")
    for rule_id, count in rules.most_common(12):
        print(f"  {count:3}  {rule_id}")

    print()
    if mistakes:
        print("Где ошиблись:")
        for line in mistakes:
            print("  ", line)
        return 1

    print("Расхождений с ожидаемым нет.")
    print(
        "По типам: "
        f"вакансии ок {kinds_ok['vacancy']}, мусор ок {kinds_ok['junk']}, спорные ок {kinds_ok['maybe']}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
