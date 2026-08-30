"""Небольшие PNG с русским текстом для тестов OCR.

Нужен шрифт с кириллицей (Arial / Segoe UI на Windows, DejaVu на Linux).
Tesseract для генерации не нужен — только pillow.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = ROOT / "scripts" / "tests" / "fixtures" / "ocr"

VACANCY_SELLER_LINES = [
    "Требуется продавец",
    "Горловка",
    "Зарплата 28 000 руб",
    "График 2/2",
    "Тел. 071-321-45-67",
]

SALARY_MOCKUP_LINES = [
    "Зарплата 45 000 руб",
]

CAPTION_WITH_SALARY_ON_LAYOUT = (
    "Требуется продавец в магазин. Горловка. График 2/2. Тел. 071-555-12-34"
)

VACANCY_SELLER_TEXT = "\n".join(VACANCY_SELLER_LINES)
SALARY_MOCKUP_TEXT = "\n".join(SALARY_MOCKUP_LINES)


def _cyrillic_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
        Path(r"C:\Windows\Fonts\tahoma.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
        Path("/usr/share/fonts/truetype/freefont/FreeSans.ttf"),
    ]
    for path in candidates:
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    raise FileNotFoundError(
        "Нет шрифта с кириллицей: поставь Arial (Windows) или fonts-dejavu (Linux)"
    )


def _write_text_png(path: Path, lines: list[str], *, width: int = 720, line_height: int = 52) -> None:
    font = _cyrillic_font(36)
    height = 40 + line_height * len(lines) + 24
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    y = 24
    for line in lines:
        draw.text((28, y), line, fill=(0, 0, 0), font=font)
        y += line_height
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def _write_product_png(path: Path) -> None:
    image = Image.new("RGB", (240, 160), (180, 188, 196))
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 30, 200, 130), fill=(90, 110, 130), outline=(40, 50, 60), width=3)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def ensure_ocr_fixtures() -> dict[str, Path]:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    seller = FIXTURE_DIR / "vacancy_seller.png"
    salary = FIXTURE_DIR / "salary_mockup.png"
    fridge = FIXTURE_DIR / "fridge.png"
    if not seller.is_file():
        _write_text_png(seller, VACANCY_SELLER_LINES)
    if not salary.is_file():
        _write_text_png(salary, SALARY_MOCKUP_LINES, width=520, line_height=56)
    if not fridge.is_file():
        _write_product_png(fridge)
    return {"vacancy_seller": seller, "salary_mockup": salary, "fridge": fridge}


def main() -> None:
    paths = ensure_ocr_fixtures()
    for name, path in paths.items():
        print(f"{name}: {path} ({path.stat().st_size} байт)")


if __name__ == "__main__":
    main()
