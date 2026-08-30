"""Отчёт «было / стало»: доля совпадений с ожидаемым.

Запуск (из корня проекта, виртуальное окружение уже включено):
    python scripts/tests/normalize_report.py

Это метрика качества обработки (Этап 32 вернётся к ней). Сейчас —
правила без ИИ. Ниже 80 % совпадений — править JSON, не «подкручивать» тесты.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
# Каталог этого файла — scripts/tests, там лежит пакет ocr/ для фикстур.
# Если он останется первым в sys.path, «import ocr» возьмёт его, а не scripts/ocr.py.
_here = str(Path(__file__).resolve().parent)
if _here in sys.path:
    sys.path.remove(_here)
for _path in (str(ROOT), str(SCRIPTS)):
    if _path in sys.path:
        sys.path.remove(_path)
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(SCRIPTS))

from process import process_post  # noqa: E402
from tests.normalization import check_expected, load_normalize_samples  # noqa: E402


def _pad(text: str, width: int) -> str:
    return str(text)[:width].ljust(width)


def _preview(text: str, width: int = 90) -> str:
    one = " ".join((text or "").split())
    if len(one) <= width:
        return one
    return one[: width - 1] + "…"


def main() -> int:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    source, posts = load_normalize_samples()
    ok = 0
    print()
    for post in posts:
        records = process_post(post["text"], source=source)
        errors = check_expected(records, post["expected"])
        matched = not errors
        if matched:
            ok += 1
        mark = "ок" if matched else "ОШИБКА"
        title = records[0]["title"] if records else "—"
        summary = records[0].get("summaryLine") if records else "—"
        completeness = records[0].get("completeness") if records else "—"
        print("=" * 88)
        print(f"{post['id']}  {mark}  записей {len(records)}  полнота {completeness}")
        print("БЫЛО:  ", _preview(post["text"]))
        print("СТАЛО: ", _preview(f"{title} | {summary}"))
        if records:
            desc = records[0].get("description") or ""
            sections = records[0].get("descriptionSections") or {}
            if sections.get("tasks"):
                print("Задачи:", "; ".join(sections["tasks"][:4]))
            if desc:
                print("Текст: ", _preview(desc, 120))
        if errors:
            print("       ", "; ".join(errors))

    total = len(posts)
    ratio = 100 * ok / total if total else 0
    print()
    print("-" * 88)
    print(f"Совпало с ожидаемым: {ok} из {total}  ({ratio:.0f} %)")
    if ratio < 80:
        print("Ниже 80 % — правим shared/normalize.json, не код и не ожидания вслепую.")
        return 1
    print("Порог 80 % закрыт.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
