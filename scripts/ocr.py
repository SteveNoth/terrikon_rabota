"""Сборка текста анализа: подпись поста + распознанное с картинок (14B).

Порядок, как в разделе 11.1. Не наоборот:

    альбом уже склеен парсером (Этап 17; сюда приходит один пост)
    → OCR: collect_analysis_text (этот файл, шаг 0)
    → явный СВО на полном тексте (подпись + ocrText)
    → фильтр is_vacancy на полном тексте
    → резка split_post
    → для каждой единицы: поля extract_*, формат вахты, скрытый СВО

Без OCR пост-картинка умрёт на фильтре как слишком короткий, а зарплата
с макета не попадёт в свою единицу после нарезки.

process_post в scripts/process.py вызывает тот же порядок, затем единый
вид. Здесь — сборка assemble_post (шаги 0…7), чтобы OCR и 14A можно
было проверить отдельно.

Контракт записи (Prisma заведёт поля на Этапе 15, схема уже такая):
    rawText    = подпись как в источнике, без распознанного
    ocrText    = то, что прочитал движок; можно обновить при росте OCR_VERSION
    imageUrls  = JSON-массив строк (URL или в тестах путь к фикстуре)
    плюс поля единиц из 14A

Картинки не пишем в репозиторий как склад постов, не кладём в Supabase
Storage и не пишем байты в Postgres (Закон 10). Карточка картинку поста
не показывает — только реконструкцию из полей (Закон 15). Логотипы
работодателей Этапа 12 — другое.

«Исходный текст» для правила чисел (Закон 16) — analysisText: подпись
и распознанное через разделитель из ocr.json. Выдуманного с картинки,
которой не было, быть не может.
"""

from __future__ import annotations

import hashlib
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

_SCRIPTS = Path(__file__).resolve().parent
ROOT = _SCRIPTS.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config
from extract import extract_phone, extract_profession, extract_salary, extract_schedule
from filter import compiled, is_vacancy, iter_hits, normalize, score
from ocr_provider import ocr_image, provider_name
from split import SplitUnit, split_post, unit_external_id
from svo import explicit_svo, hidden_svo, unit_fields
from vahta import detect_work_format

logger = logging.getLogger("ocr")

FIXTURES_OCR = ROOT / "scripts" / "tests" / "fixtures" / "ocr"

FetchFn = Callable[[str], bytes]
OcrFn = Callable[[bytes], str]

_ocr_cache: dict[str, str] = {}
_last_download_at = 0.0


@dataclass
class AnalysisText:
    caption: str
    ocr_text: str
    analysis_text: str
    image_urls: list[str]
    skipped_reason: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "caption": self.caption,
            "ocrText": self.ocr_text,
            "analysisText": self.analysis_text,
            "imageUrls": list(self.image_urls),
            "skippedReason": self.skipped_reason,
        }


@dataclass
class AssembledUnit:
    """Единица вакансии после OCR + 14A. rawText — только подпись."""

    unit_text: str
    raw_text: str
    ocr_text: str
    image_urls: list[str]
    split_index: int
    source_post_external_id: str | None
    external_id: str | None
    reasons: list[str] = field(default_factory=list)
    needs_human_review: bool = False
    profession: Any = None
    salary: Any = None
    phones: list[Any] = field(default_factory=list)
    schedule: str | None = None
    work_format: str | None = None
    splitter_version: int = 1
    ocr_version: int = 1

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "unitText": self.unit_text,
            "rawText": self.raw_text,
            "ocrText": self.ocr_text,
            "imageUrls": list(self.image_urls),
            "splitIndex": self.split_index,
            "sourcePostExternalId": self.source_post_external_id,
            "externalId": self.external_id,
            "reasons": list(self.reasons),
            "needsHumanReview": self.needs_human_review,
            "workFormat": self.work_format,
            "splitterVersion": self.splitter_version,
            "ocrVersion": self.ocr_version,
        }
        if self.profession is not None:
            payload["profession"] = self.profession.slug
        if self.salary is not None:
            payload["salary"] = self.salary.as_dict()
        if self.phones:
            payload["phones"] = [item.normalized for item in self.phones]
        if self.schedule:
            payload["schedule"] = self.schedule
        return payload


@dataclass
class AssembleResult:
    analysis: AnalysisText
    units: list[AssembledUnit]
    vacancy_verdict: str | None = None
    svo_verdict: str | None = None
    filter_score: int | None = None
    filter_reasons: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "analysis": self.analysis.as_dict(),
            "units": [item.as_dict() for item in self.units],
            "vacancyVerdict": self.vacancy_verdict,
            "svoVerdict": self.svo_verdict,
            "filterScore": self.filter_score,
            "filterReasons": list(self.filter_reasons),
        }


def reload_ocr() -> None:
    """Сбросить кэш JSON. После правки shared/ocr.json в тестах."""
    shared_config.reload()


def reset_ocr_cache() -> None:
    """Кэш распознавания живёт один запуск. Тестам нужно обнулять."""
    _ocr_cache.clear()


def get_ocr_cfg() -> dict[str, Any]:
    return shared_config.get_ocr()


def _host_allowed(hostname: str, allow: list[str]) -> bool:
    host = (hostname or "").lower().rstrip(".")
    if not host:
        return False
    for entry in allow:
        base = (entry or "").lower().lstrip(".")
        if not base:
            continue
        if host == base or host.endswith("." + base):
            return True
    return False


def image_url_allowed(url: str) -> bool:
    """URL картинки с хоста из downloadAllowHosts (shared/ocr.json)."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    allow = list(get_ocr_cfg().get("downloadAllowHosts") or [])
    return _host_allowed(parsed.hostname or "", allow)


def _pace_download(gap_ms: int) -> None:
    global _last_download_at
    if gap_ms <= 0:
        _last_download_at = time.monotonic()
        return
    wait = (_last_download_at + gap_ms / 1000.0) - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_download_at = time.monotonic()


def _default_fetch(url: str) -> bytes:
    cfg = get_ocr_cfg()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"не URL: {url}")
    allow = list(cfg.get("downloadAllowHosts") or [])
    if not _host_allowed(parsed.hostname or "", allow):
        raise ValueError(f"хост не в allowlist: {parsed.hostname}")
    import requests

    _pace_download(int(cfg.get("downloadGapMs") or 400))
    timeout = int(cfg.get("downloadTimeoutSec") or 8)
    response = requests.get(
        url,
        timeout=timeout,
        headers={"User-Agent": "TerriconRabota/0.1 (OCR; https://github.com/SteveNoth/terrikon_rabota)"},
    )
    response.raise_for_status()
    return response.content


def _fixture_path(ref: str) -> Path | None:
    """Локальный файл только из scripts/tests/fixtures/ocr/. Иначе — не читаем."""
    raw = Path(ref)
    if raw.is_absolute():
        path = raw.resolve()
    else:
        path = (FIXTURES_OCR / ref).resolve()
    try:
        path.relative_to(FIXTURES_OCR.resolve())
    except ValueError:
        return None
    if path.is_file():
        return path
    return None


def _load_bytes(ref: str, fetch: FetchFn | None) -> bytes:
    if ref.startswith("http://") or ref.startswith("https://"):
        loader = fetch or _default_fetch
        return loader(ref)
    if fetch is not None:
        return fetch(ref)
    path = _fixture_path(ref)
    if path is None:
        raise ValueError(f"нельзя читать путь вне фикстур OCR: {ref}")
    return path.read_bytes()


def join_analysis_text(caption: str, ocr_text: str, separator: str | None = None) -> str:
    """Подпись и распознанное рядом, не вместо. rawText остаётся подписью."""
    cap = caption if caption is not None else ""
    ocr = (ocr_text or "").strip()
    if cap.strip() and ocr:
        mark = separator if separator is not None else str(get_ocr_cfg().get("analysisSeparator") or "---OCR---")
        return f"{cap.rstrip()}\n\n{mark}\n\n{ocr}"
    if ocr:
        return ocr
    return cap


def decide_ocr(caption: str, image_refs: list[str]) -> str | None:
    """Почему не гоняем. None — гоняем. Правила из shared/ocr.json."""
    cfg = get_ocr_cfg()
    if not image_refs:
        return "no_images"
    if provider_name() == "none":
        return "provider_none"
    body = normalize(caption or "").text
    if cfg.get("skipIfGarbage", True):
        skip_ids = {str(item) for item in (cfg.get("skipStopWordIds") or [])}
        if skip_ids:
            for entry, _sample in iter_hits(compiled()["stopWords"], body):
                if str(entry.get("id")) in skip_ids:
                    return "caption_garbage"
    almost = int(cfg.get("captionAlmostEmptyChars") or 24)
    if cfg.get("alwaysIfNoCaption", True) and len(body) <= almost:
        return None
    if cfg.get("runIfLooksLikeVacancy", True):
        min_score = int(cfg.get("vacancyScoreAtLeast") or compiled()["keywords"]["thresholds"]["maybe"])
        if score(caption or "").total >= min_score:
            return None
    return "caption_skip"


def collect_analysis_text(
    caption: str,
    image_refs: list[str] | None = None,
    fetch: FetchFn | None = None,
    ocr: OcrFn | None = None,
) -> AnalysisText:
    """Подпись + OCR. Ошибка чтения не роняет пост: остаётся подпись."""
    cap = caption if caption is not None else ""
    cfg = get_ocr_cfg()
    max_images = int(cfg.get("maxImages") or 4)
    refs = [str(item) for item in (image_refs or []) if item][: max(0, max_images)]
    reason = decide_ocr(cap, refs)
    if reason:
        logger.info("ocr skip: %s", reason)
        return AnalysisText(
            caption=cap,
            ocr_text="",
            analysis_text=join_analysis_text(cap, ""),
            image_urls=list(refs),
            skipped_reason=reason,
        )

    engine = ocr or ocr_image
    chunks: list[str] = []
    for ref in refs:
        url_key = "url:" + ref
        if url_key in _ocr_cache:
            cached = _ocr_cache[url_key]
            if cached:
                chunks.append(cached)
            continue
        try:
            data = _load_bytes(ref, fetch)
        except Exception as exc:
            logger.warning("ocr: не удалось прочитать %s (%s)", ref, exc)
            continue
        byte_key = "sha256:" + hashlib.sha256(data).hexdigest()
        if byte_key in _ocr_cache:
            text = _ocr_cache[byte_key]
            _ocr_cache[url_key] = text
            if text:
                chunks.append(text)
            continue
        try:
            text = (engine(data) or "").strip()
        except Exception as exc:
            logger.warning("ocr: движок не прочитал %s (%s)", ref, exc)
            text = ""
        _ocr_cache[url_key] = text
        _ocr_cache[byte_key] = text
        if text:
            chunks.append(text)
        elif not text:
            logger.info("ocr: пустой результат для %s", ref)

    ocr_text = "\n".join(chunks).strip()
    return AnalysisText(
        caption=cap,
        ocr_text=ocr_text,
        analysis_text=join_analysis_text(cap, ocr_text),
        image_urls=list(refs),
        skipped_reason=None if ocr_text else "ocr_empty",
    )


def _source_id(source: dict[str, Any] | None) -> str | None:
    if not source:
        return None
    for key in ("externalId", "external_id", "id"):
        value = source.get(key)
        if value:
            return str(value)
    return None


def _to_assembled(unit: SplitUnit, analysis: AnalysisText) -> AssembledUnit:
    cfg = get_ocr_cfg()
    work_format = detect_work_format(unit.unit_text)
    return AssembledUnit(
        unit_text=unit.unit_text,
        raw_text=analysis.caption,
        ocr_text=analysis.ocr_text,
        image_urls=list(analysis.image_urls),
        split_index=unit.split_index,
        source_post_external_id=unit.source_post_external_id,
        external_id=unit.external_id,
        reasons=list(unit.reasons),
        needs_human_review=unit.needs_human_review,
        profession=unit.profession or extract_profession(unit.unit_text),
        salary=unit.salary if unit.salary is not None else extract_salary(unit.unit_text),
        phones=list(unit.phones) or extract_phone(unit.unit_text),
        schedule=unit.schedule or extract_schedule(unit.unit_text),
        work_format=work_format,
        splitter_version=unit.splitter_version,
        ocr_version=int(cfg.get("OCR_VERSION") or 1),
    )


def _whole_post_unit(text: str, source: dict[str, Any] | None, reasons: list[str]) -> SplitUnit:
    source_id = _source_id(source)
    version = int(shared_config.get_split().get("SPLITTER_VERSION") or 1)
    unit = SplitUnit(
        unit_text=text,
        raw_text=text,
        split_index=0,
        source_post_external_id=source_id,
        external_id=unit_external_id(source_id, 0, 1),
        reasons=reasons,
        needs_human_review=True,
        splitter_version=version,
    )
    unit.profession = extract_profession(unit.unit_text)
    unit.salary = extract_salary(unit.unit_text)
    unit.phones = extract_phone(unit.unit_text)
    unit.schedule = extract_schedule(unit.unit_text)
    return unit


def assemble_post(
    caption: str,
    image_refs: list[str] | None = None,
    *,
    source: dict[str, Any] | None = None,
    market: dict[str, Any] | None = None,
    fetch: FetchFn | None = None,
    ocr: OcrFn | None = None,
    spam: bool = False,
    ocr_text: str | None = None,
) -> AssembleResult:
    """Сборка шагов 0…7. Единый вид добавляет process_post поверх.

    Порядок внутри: OCR → явный СВО → фильтр → резка → поля / формат / скрытый СВО.
    ocr_text: уже сохранённое распознавание. Картинки заново не качаем
    (ссылки протухают) — так работает reprocess.py.
    """
    if ocr_text is not None:
        refs = [str(item) for item in (image_refs or []) if item]
        analysis = AnalysisText(
            caption=caption if caption is not None else "",
            ocr_text=ocr_text,
            analysis_text=join_analysis_text(caption if caption is not None else "", ocr_text),
            image_urls=refs,
            skipped_reason="saved_ocr",
        )
    else:
        analysis = collect_analysis_text(caption, image_refs, fetch=fetch, ocr=ocr)
    full = analysis.analysis_text

    svo = explicit_svo(full)
    if svo.verdict == "reject":
        return AssembleResult(analysis=analysis, units=[], svo_verdict=svo.verdict)

    vacancy = is_vacancy(full, source=source, spam=spam)
    if vacancy.verdict == "reject":
        return AssembleResult(
            analysis=analysis,
            units=[],
            vacancy_verdict=vacancy.verdict,
            svo_verdict=svo.verdict,
            filter_score=vacancy.score,
            filter_reasons=list(vacancy.reasons),
        )

    if svo.verdict == "maybe":
        split_units = [_whole_post_unit(full, source, ["svo:explicit:maybe", *svo.reasons])]
    else:
        split_units = split_post(full, source=source)

    kept: list[AssembledUnit] = []
    for unit in split_units:
        hidden = hidden_svo(unit_fields(unit.unit_text), unit.unit_text, market)
        if hidden.verdict == "reject":
            continue
        assembled = _to_assembled(unit, analysis)
        if hidden.verdict == "maybe":
            assembled.needs_human_review = True
            assembled.reasons.append("svo:hidden:maybe")
        kept.append(assembled)

    return AssembleResult(
        analysis=analysis,
        units=kept,
        vacancy_verdict=vacancy.verdict,
        svo_verdict=svo.verdict,
        filter_score=vacancy.score,
        filter_reasons=list(vacancy.reasons),
    )
