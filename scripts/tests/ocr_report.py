"""Отчёт OCR: что распозналось, какие поля, где пропустили зря.

Запуск (из корня проекта, виртуальное окружение уже включено):
    python scripts/tests/ocr_report.py

Движок Tesseract не обязателен: без бинаря отчёт идёт на mockOcr из samples.json
и честно пишет, что живое распознавание пропущено.
"""

from __future__ import annotations

import os
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ocr import assemble_post, collect_analysis_text, reset_ocr_cache  # noqa: E402
from ocr_provider import provider_name, tesseract_available  # noqa: E402
from tests.ocr import load_live_posts, load_ocr_samples  # noqa: E402
from tests.ocr.make_fixtures import ensure_ocr_fixtures  # noqa: E402


def _pad(text: str, width: int) -> str:
    return str(text)[:width].ljust(width)


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text or "")


def _salary(unit) -> str:
    if unit is None or unit.salary is None:
        return "—"
    amount = unit.salary.min_amount
    return str(amount) if amount is not None else "—"


def main() -> int:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    reset_ocr_cache()
    ensure_ocr_fixtures()
    source, posts = load_ocr_samples()
    engine_ok = tesseract_available()
    default_provider = provider_name()
    # decide_ocr смотрит на OCR_PROVIDER. Для отчёта включаем путь «гнать»,
    # а движок либо живой Tesseract, либо mockOcr из samples.json.
    os.environ["OCR_PROVIDER"] = "tesseract"

    print()
    print(
        f"по умолчанию OCR_PROVIDER={default_provider}; "
        f"в отчёте путь tesseract; живой rus={'да' if engine_ok else 'нет (mock)'}"
    )
    print("Синтетические фикстуры (подпись + макет):")
    print()
    print(
        _pad("id", 20),
        _pad("OCR?", 8),
        _pad("вердикт", 8),
        _pad("зп", 8),
        _pad("профессия", 12),
        "причина / распознанное",
    )
    print("-" * 110)

    wasted = []
    ok = 0
    for post in posts:
        expect_ocr = bool(post.get("expectOcr"))
        mock = post.get("mockOcr") or ""

        def fake_ocr(_data: bytes, text=mock) -> str:
            return text

        use_engine = engine_ok and expect_ocr
        kwargs = {"source": source}
        if not use_engine:
            kwargs["ocr"] = fake_ocr

        collected = collect_analysis_text(
            post["caption"],
            post["images"],
            ocr=None if use_engine else fake_ocr,
        )
        result = assemble_post(post["caption"], post["images"], **kwargs)
        unit = result.units[0] if result.units else None
        ran = collected.skipped_reason not in {"caption_garbage", "provider_none", "caption_skip", "no_images"}
        ocr_mark = "да" if (use_engine and ran) or (not use_engine and expect_ocr and collected.ocr_text) else "нет"
        if collected.skipped_reason == "caption_garbage":
            ocr_mark = "skip"
        if collected.skipped_reason == "provider_none":
            ocr_mark = "none"
        preview = (collected.ocr_text or collected.skipped_reason or "—").replace("\n", " / ")
        print(
            _pad(post["id"], 20),
            _pad(ocr_mark, 8),
            _pad(result.vacancy_verdict or "—", 8),
            _pad(_salary(unit), 8),
            _pad(unit.profession.slug if unit and unit.profession else "—", 12),
            preview[:60],
        )

        if expect_ocr and collected.skipped_reason in {"caption_garbage", "caption_skip"}:
            wasted.append(f"{post['id']}: пропустили OCR зря ({collected.skipped_reason})")
        elif expect_ocr and collected.skipped_reason == "provider_none":
            wasted.append(f"{post['id']}: OCR_PROVIDER=none — картинка не читалась, это честно")
        elif not expect_ocr and collected.skipped_reason != "caption_garbage":
            wasted.append(f"{post['id']}: гоняли OCR на мусоре")
        else:
            ok += 1

        if expect_ocr and unit and post.get("expectSalary"):
            got = unit.salary.min_amount if unit.salary else None
            if got != post["expectSalary"]:
                wasted.append(f"{post['id']}: зарплата {got}, ждали {post['expectSalary']}")
            if post["expectSalary"] and _digits(str(post["expectSalary"])) not in _digits(unit.ocr_text) and use_engine:
                wasted.append(f"{post['id']}: числа зарплаты нет в ocrText")

    print()
    print(f"синтетика: разобрали {ok}/{len(posts)}")
    if wasted:
        print("замечания:")
        for line in wasted:
            print("  ", line)
    else:
        print("лишних пропусков OCR на синтетике нет.")

    print()
    print("Живые макеты из «ПОСТЫ ФОТО» (подпись пустая, метка в имени файла):")
    print(
        _pad("id", 16),
        _pad("метка", 12),
        _pad("фильтр", 8),
        _pad("СВО", 8),
        _pad("зп", 8),
        "распознанное",
    )
    print("-" * 110)
    live_notes = []
    live_source, live_posts = load_live_posts()
    if engine_ok:
        kind_filter = Counter()
        for post in live_posts:
            result = assemble_post(post["caption"], [post["file"]], source=live_source)
            unit = result.units[0] if result.units else None
            kind_filter[f"{post['kind']}:{result.vacancy_verdict}"] += 1
            preview = (result.analysis.ocr_text or "—").replace("\n", " / ")[:50]
            print(
                _pad(post["id"], 16),
                _pad(post["kind"], 12),
                _pad(result.vacancy_verdict or "—", 8),
                _pad(result.svo_verdict or "—", 8),
                _pad(_salary(unit), 8),
                preview,
            )
            if post["kind"] == "vacancy" and result.vacancy_verdict == "reject":
                live_notes.append(f"{post['id']}: метка вакансия, фильтр reject (шум OCR или стоп-слово)")
            if post["kind"] == "svo" and result.svo_verdict == "clear":
                live_notes.append(f"{post['id']}: метка СВО, явный слой не сработал (на плакате нет слов из словаря)")
            if post["kind"] in {"garbage", "not_vacancy"} and result.vacancy_verdict == "accept":
                live_notes.append(f"{post['id']}: метка {post['kind']}, фильтр accept")
        print()
        print("живые по видам:", dict(kind_filter))
    else:
        print("живой Tesseract нет — живые макеты в отчёт не гоняли.")
        live_posts = []

    print()
    if live_notes:
        print("живые замечания:")
        for line in live_notes:
            print("  ", line)
    elif engine_ok:
        print("на живых макетах фильтр не принял мусор и не пропустил все СВО молча.")
    return 0 if not any("зря" in line or "мусоре" in line for line in wasted) else 1


if __name__ == "__main__":
    raise SystemExit(main())
