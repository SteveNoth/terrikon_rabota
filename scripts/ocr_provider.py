"""Переходник к распознаванию текста на картинке (Закон 6, раздел 11.15).

Вызов один: ocr_image(bytes) -> str. Какой движок под капотом, вызывающий
код не знает. Выбор — переменная OCR_PROVIDER:

    none        картинки игнорируются, конвейер жив. По умолчанию, пока
                Tesseract не установлен.
    tesseract   локально, бесплатно, приватно. Библиотека pytesseract +
                системная программа Tesseract с русским языком.
                Это не облачный API.

Новый движок — новый класс с тем же методом ocr_image, плюс ветка
в _make_engine(). split.py и filter.py не трогаем.

Tesseract — системная программа, не pip-пакет. pip ставит только
pytesseract (мост) и pillow (открыть картинку).

GitHub Actions (Этап 16, парсер ВК) поставит пакеты так:

    sudo apt-get update
    sudo apt-get install -y tesseract-ocr tesseract-ocr-rus
    tesseract --list-langs

В списке должны быть rus и eng. В job: OCR_PROVIDER=tesseract.

Windows (этот компьютер): отдельный установщик
https://github.com/UB-Mannheim/tesseract/wiki
В мастере отметь язык Russian. Папка по умолчанию:

    C:\\Program Files\\Tesseract-OCR

Её нужно добавить в PATH. Языковые данные — в tessdata:

    TESSDATA_PREFIX=C:\\Program Files\\Tesseract-OCR\\tessdata

Если tesseract.exe не на PATH, задай полный путь:

    TESSERACT_CMD=C:\\Program Files\\Tesseract-OCR\\tesseract.exe

Проверка в новом окне PowerShell:

    tesseract --list-langs

Должны быть rus и eng. Потом OCR_PROVIDER=tesseract в .env.local.
"""

from __future__ import annotations

import io
import logging
import os
import shutil
import sys
from pathlib import Path
from typing import Protocol

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config

logger = logging.getLogger("ocr_provider")

_WINDOWS_BINARIES = (
    Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
    Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
)


class OcrEngine(Protocol):
    """Новый провайдер реализует только это."""

    name: str

    def ocr_image(self, data: bytes) -> str: ...


class NoneEngine:
    name = "none"

    def ocr_image(self, data: bytes) -> str:
        return ""


class TesseractEngine:
    name = "tesseract"

    def ocr_image(self, data: bytes) -> str:
        if not data:
            return ""
        try:
            import pytesseract
            from PIL import Image
        except ImportError as exc:
            logger.warning("tesseract: нет pytesseract или pillow (%s)", exc)
            return ""

        _configure_tesseract(pytesseract)
        cfg = shared_config.get_ocr()
        lang = str(cfg.get("language") or "rus+eng")
        timeout = int(cfg.get("tesseractTimeoutSec") or 15)
        psm = int(cfg.get("tesseractPsm") or 6)
        try:
            image = Image.open(io.BytesIO(data))
            if image.mode not in {"L", "RGB"}:
                image = image.convert("RGB")
            text = pytesseract.image_to_string(
                image,
                lang=lang,
                config=f"--psm {psm}",
                timeout=timeout,
            )
        except pytesseract.TesseractNotFoundError:
            logger.warning(
                "tesseract: бинарь не найден. Поставь Tesseract с русским языком "
                "и проверь tesseract --list-langs. Пока конвейер работает без картинок."
            )
            return ""
        except Exception as exc:
            logger.warning("tesseract: не удалось прочитать картинку (%s)", exc)
            return ""
        return (text or "").strip()


def provider_name() -> str:
    raw = (os.environ.get("OCR_PROVIDER") or "none").strip().lower()
    return raw or "none"


def _configure_tesseract(pytesseract_mod) -> None:
    cmd = (os.environ.get("TESSERACT_CMD") or "").strip()
    if not cmd:
        found = shutil.which("tesseract")
        if found:
            cmd = found
        else:
            for candidate in _WINDOWS_BINARIES:
                if candidate.is_file():
                    cmd = str(candidate)
                    break
    if cmd:
        pytesseract_mod.pytesseract.tesseract_cmd = cmd
        tessdata = (os.environ.get("TESSDATA_PREFIX") or "").strip()
        if not tessdata:
            sibling = Path(cmd).resolve().parent / "tessdata"
            if sibling.is_dir():
                os.environ["TESSDATA_PREFIX"] = str(sibling)


def tesseract_available() -> bool:
    """Бинарь на месте и в языках есть rus. Иначе тесты движка — skip."""
    try:
        import pytesseract
    except ImportError:
        return False
    _configure_tesseract(pytesseract)
    try:
        pytesseract.get_tesseract_version()
        langs = {item.lower() for item in pytesseract.get_languages(config="")}
    except Exception:
        return False
    return "rus" in langs


def _make_engine() -> OcrEngine:
    name = provider_name()
    if name == "none":
        return NoneEngine()
    if name == "tesseract":
        return TesseractEngine()
    logger.warning("OCR_PROVIDER=%s неизвестен — работаем как none", name)
    return NoneEngine()


def ocr_image(data: bytes) -> str:
    """Единственная точка входа. Смена движка — .env, не split.py / filter.py."""
    return _make_engine().ocr_image(data)
