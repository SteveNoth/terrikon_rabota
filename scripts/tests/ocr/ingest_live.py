"""Кладёт живые фото постов в фикстуры OCR: уменьшает, даёт латинские имена.

Исходник: папка на рабочем столе, имя файла = номер + метка
(вакансия / вахта / мусор / не вакансия / сво).

Запуск из корня, виртуальное окружение включено:

    python scripts/tests/ocr/ingest_live.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from ocr_provider import ocr_image  # noqa: E402

SOURCE_DIR = Path(r"C:\Users\Max\Desktop\ПОСТЫ ФОТО")
LIVE_DIR = ROOT / "scripts" / "tests" / "fixtures" / "ocr" / "live"
MANIFEST = Path(__file__).resolve().parent / "live.json"

KIND_BY_LABEL = {
    "вакансия": "vacancy",
    "вахта": "vahta",
    "мусор": "garbage",
    "не вакансия": "not_vacancy",
    "сво": "svo",
}

_NAME_RE = re.compile(r"^(\d+)\s+(.+)\.jpe?g$", re.IGNORECASE)
MAX_SIDE = 1280
JPEG_QUALITY = 82


def _parse_name(name: str) -> tuple[int, str] | None:
    match = _NAME_RE.match(name)
    if not match:
        return None
    label = match.group(2).strip().casefold()
    kind = KIND_BY_LABEL.get(label)
    if kind is None:
        return None
    return int(match.group(1)), kind


def _save_small_jpeg(src: Path, dest: Path) -> None:
    image = Image.open(src)
    if image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")
    elif image.mode == "L":
        image = image.convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)


def ingest(run_ocr: bool = True) -> list[dict]:
    if not SOURCE_DIR.is_dir():
        raise FileNotFoundError(f"нет папки с фото: {SOURCE_DIR}")
    os.environ["OCR_PROVIDER"] = "tesseract"
    items: list[dict] = []
    for name in sorted(os.listdir(SOURCE_DIR), key=lambda item: item.casefold()):
        parsed = _parse_name(name)
        if parsed is None:
            continue
        number, kind = parsed
        dest_name = f"{kind}-{number:02d}.jpg"
        dest = LIVE_DIR / dest_name
        src = SOURCE_DIR / name
        _save_small_jpeg(src, dest)
        ocr_text = ""
        if run_ocr:
            ocr_text = ocr_image(dest.read_bytes())
        items.append(
            {
                "id": f"{kind}-{number:02d}",
                "kind": kind,
                "file": f"live/{dest_name}",
                "originalName": name,
                "caption": "",
                "ocrPreview": (ocr_text or "").replace("\r\n", "\n").strip()[:400],
                "ocrChars": len((ocr_text or "").strip()),
            }
        )
    items.sort(key=lambda row: (row["kind"], row["id"]))
    MANIFEST.write_text(
        json.dumps(
            {
                "source": {
                    "name": "Работа Горловка",
                    "default_city": "gorlovka",
                    "externalId": "ocr-live",
                },
                "_readme": "Живые макеты из папки «ПОСТЫ ФОТО». Подпись пустая: смысл на картинке. ocrPreview — снимок Tesseract на момент ingest, тесты гоняют движок заново.",
                "posts": items,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return items


def load_live_posts() -> tuple[dict, list[dict]]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return data.get("source") or {}, list(data["posts"])


def main() -> int:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    items = ingest(run_ocr=True)
    by_kind: dict[str, int] = {}
    for item in items:
        by_kind[item["kind"]] = by_kind.get(item["kind"], 0) + 1
        print(f"{item['id']:16} {item['ocrChars']:4} симв.  {item['originalName']}")
    print()
    print("итого", len(items), by_kind)
    print("манифест", MANIFEST)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
