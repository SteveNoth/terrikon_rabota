"""Извлечение полей из сырого поста (раздел 11.4 ядра).

Зарплату не путаем с графиком 2/2 и временем 8-17.
Телефон: сначала оставляем только цифры у кандидата, потом проверяем,
что это осмысленный номер. «30 000 - 45 000» не телефон: после очистки
старт 3, такого кода нет.
"""

from __future__ import annotations

import hashlib
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config
from filter import compiled, compile_term, fold_text, iter_hits, normalize

_PAIR_RE = re.compile(r"\b(\d{1,3})\s*[\/\\]\s*(\d{1,3})\b")
_TIME_RE = re.compile(r"\b(?:[01]?\d|2[0-3])\s*[-–—:]\s*(?:[01]?\d|2[0-3])\b")
# 12.00, 7:30 — часы:минуты. Не путать с 5.000 ₽: после минут не должно быть цифры.
_CLOCK_RE = re.compile(r"\b(?:[01]?\d|2[0-3])\s*[:.]\s*[0-5]\d(?!\d)\b")
# 45 000 / 1 500 000 / 5.000. Два оклада подряд («100 000  110 000») — два числа, не одно.
_NUMBER_RE = re.compile(
    r"(?<!\d)(\d{1,2}(?:[\s\u00a0.]\d{3}){1,2}|\d{3}(?:[\s\u00a0.]\d{3})|\d{2,7})(?!\d)"
)
# «100тыс» без пробела: границы слова между цифрой и буквой нет.
_TYS_RE = re.compile(r"(?<![а-яёa-z])тыс(?:яч[аиу]?)?|\bт\.?\s*р\.?\b", re.IGNORECASE)
_CURRENCY_RE = re.compile(r"(?:₽|\bруб(?:л(?:ей|я|ь)?)?\b|\bр\.\b|\bруб\b)", re.IGNORECASE)
_ZP_RE = re.compile(
    r"(?:\bз\s*/\s*п\b|\bзп\b|\bоклад\b|\bзарплат\w*|\bставк\w*|\bоплат\w*)",
    re.IGNORECASE,
)
_FROM_RE = re.compile(r"\bот\b", re.IGNORECASE)
_TO_RE = re.compile(r"\bдо\b", re.IGNORECASE)
_PERIOD_HOUR = re.compile(r"(?:/час|\bв\s+час\b|\bпочасов\w*|\bза\s+час\b)", re.IGNORECASE)
_PERIOD_SHIFT = re.compile(r"(?:/смен\w*|\bза\s+смен\w*|\bв\s+смену\b)", re.IGNORECASE)
_PERIOD_DAY = re.compile(r"(?:/день|\bв\s+день\b|\bза\s+день\b|\bдневн\w*)", re.IGNORECASE)
_PERIOD_MONTH = re.compile(r"(?:/мес|\bв\s+месяц\b|\bза\s+месяц\b|\bоклад\b)", re.IGNORECASE)

_PHONE_SPAN_RE = re.compile(
    r"(?:\+?\d[\d \t\-()]{5,18}\d)"
)
_USERNAME_RE = re.compile(r"(?<![\w.])@([a-zA-Z][\w]{3,31})")
_LINK_RE = re.compile(
    r"https?://(?:t(?:elegram)?\.me|vk\.(?:com|ru)|wa\.me)/[^\s<>]+",
    re.IGNORECASE,
)

_EXPERIENCE_YEARS_RE = re.compile(
    r"(?:опыт|стаж)(?:\s+работы)?\s*(?:от\s*)?(\d+)\s*(год|года|лет|мес)",
    re.IGNORECASE,
)

_PHONE_STARTS = {"7", "8", "9", "0"}


@dataclass
class Salary:
    min_amount: int | None
    max_amount: int | None
    period: str
    raw: str
    has_bonus: bool = False

    def as_dict(self) -> dict[str, Any]:
        data = {
            "min": self.min_amount,
            "max": self.max_amount,
            "period": self.period,
            "raw": self.raw,
        }
        if self.has_bonus:
            data["hasBonus"] = True
        return {key: value for key, value in data.items() if value is not None and value is not False}


@dataclass
class Phone:
    digits: str
    normalized: str
    original: str
    kind: str


@dataclass
class ProfessionHit:
    slug: str
    name: str
    sphere: str
    matched: str
    start: int = -1
    end: int = -1


@dataclass
class CityHit:
    city_slug: str | None
    district_slug: str | None
    reason: str
    region: str | None = None


@dataclass
class Contacts:
    usernames: list[str] = field(default_factory=list)
    links: list[str] = field(default_factory=list)


def _vahta_bounds() -> tuple[int, int]:
    vahta = compiled()["keywords"].get("vahta") or {}
    return int(vahta.get("scheduleMax") or 7), int(vahta.get("rotationMin") or 15)


def _span_is_schedule_or_time(span: str) -> bool:
    schedule_max, rotation_min = _vahta_bounds()
    pair = _PAIR_RE.search(span)
    if pair:
        left, right = int(pair.group(1)), int(pair.group(2))
        if left <= schedule_max and right <= schedule_max:
            return True
        if left >= rotation_min and right >= rotation_min:
            return True
    if _TIME_RE.search(span):
        return True
    return False


def _parse_number(raw: str) -> int:
    digits = re.sub(r"\D", "", raw)
    return int(digits) if digits else 0


def _nearby(text: str, start: int, end: int, width: int = 28) -> str:
    return text[max(0, start - width) : min(len(text), end + width)]


def extract_salary(text: str) -> Salary | None:
    """Все формы из 11.4. 2/2 и 8-17 — не деньги. Телефон маскируем, иначе 071-321-45-67 станет «321»."""
    original = text or ""
    if not original:
        return None
    masked = original
    for phone in extract_phone(original):
        masked = masked.replace(phone.original, " ")
    masked = _CLOCK_RE.sub(" ", masked)
    norm = normalize(masked)
    body = norm.text
    if not body:
        return None

    if _span_is_schedule_or_time(body) and not (_CURRENCY_RE.search(body) or _ZP_RE.search(body) or _TYS_RE.search(body)):
        # В тексте только график/время, без денежных маркеров — зарплаты нет.
        if not _NUMBER_RE.search(body):
            return None

    candidates: list[tuple[int, int, int, str]] = []
    for match in _NUMBER_RE.finditer(body):
        raw = match.group(1)
        if _span_is_schedule_or_time(match.group(0)):
            continue
        around = _nearby(body, match.start(), match.end())
        if _TIME_RE.search(around) and raw.replace(" ", "").isdigit() and _parse_number(raw) <= 24:
            continue
        value = _parse_number(raw)
        if value <= 0:
            continue
        if _TYS_RE.search(around) and value < 1000:
            value *= 1000
        has_money_marker = bool(
            _CURRENCY_RE.search(around)
            or _ZP_RE.search(around)
            or _TYS_RE.search(around)
            or _FROM_RE.search(around)
            or _TO_RE.search(around)
        )
        if not has_money_marker and value < 10000:
            continue
        if value < 100:
            continue
        candidates.append((match.start(), match.end(), value, match.group(0)))

    if not candidates:
        return None

    # Берём денежный «кластер»: числа, между которыми не больше 24 символов.
    first_start, last_end, amounts = candidates[0][0], candidates[0][1], [candidates[0][2]]
    for start, end, value, _raw in candidates[1:]:
        if start - last_end <= 24:
            amounts.append(value)
            last_end = end
        else:
            break

    period = "month"
    window = body[max(0, first_start - 20) : min(len(body), last_end + 24)]
    if _PERIOD_HOUR.search(window):
        period = "hour"
    elif _PERIOD_SHIFT.search(window):
        period = "shift"
    elif _PERIOD_DAY.search(window):
        period = "day"
    elif _PERIOD_MONTH.search(window):
        period = "month"

    has_bonus = "преми" in window
    raw_slice = body[first_start:last_end]

    min_amount = min(amounts)
    max_amount = max(amounts)
    if min_amount == max_amount:
        if _TO_RE.search(_nearby(body, first_start, last_end, 12)) and not _FROM_RE.search(
            _nearby(body, first_start, last_end, 12)
        ):
            return Salary(min_amount=None, max_amount=min_amount, period=period, raw=raw_slice, has_bonus=has_bonus)
        if _FROM_RE.search(_nearby(body, first_start, last_end, 12)):
            return Salary(min_amount=min_amount, max_amount=None, period=period, raw=raw_slice, has_bonus=has_bonus)
        return Salary(min_amount=min_amount, max_amount=min_amount, period=period, raw=raw_slice, has_bonus=has_bonus)

    return Salary(
        min_amount=min_amount,
        max_amount=max_amount,
        period=period,
        raw=raw_slice,
        has_bonus=has_bonus,
    )


def _classify_digits(digits: str) -> tuple[str, str] | None:
    """(normalized +7..., kind) или None, если это не телефон."""
    if not digits or digits[0] not in _PHONE_STARTS:
        return None

    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7949"):
        return "+" + digits, "dpr7949"
    if len(digits) == 11 and digits.startswith("7944"):
        return "+" + digits, "lpr7944"
    if len(digits) == 11 and digits.startswith("7959"):
        return "+" + digits, "lpr7959"
    if len(digits) == 11 and digits.startswith("7"):
        return "+" + digits, "ru11"
    if len(digits) == 10 and digits.startswith("9"):
        return "+7" + digits, "mobile10"
    if len(digits) == 10 and digits.startswith("071"):
        return "+7949" + digits[3:], "dpr071"
    if len(digits) == 10 and digits.startswith("072"):
        return "+7959" + digits[3:], "lpr072"
    if len(digits) == 10 and digits.startswith("949"):
        return "+7" + digits, "dpr949"
    if len(digits) == 10 and digits.startswith("0"):
        # Местный код ДНР/ЛНР, но не 071/072 — не угадываем.
        return None
    return None


def _classify_digit_run(digits: str) -> list[tuple[str, str]]:
    """Один или несколько номеров из сплошной цифровой строки.

    Два номера подряд через перевод строки раньше склеивались в 22 цифры
    и не проходили проверку длины.
    """
    classified = _classify_digits(digits)
    if classified is not None:
        return [classified]
    found: list[tuple[str, str]] = []
    index = 0
    while index < len(digits):
        chunk = None
        for size in (11, 10):
            piece = digits[index : index + size]
            if len(piece) != size:
                continue
            classified = _classify_digits(piece)
            if classified is not None:
                chunk = classified
                index += size
                break
        if chunk is None:
            index += 1
            continue
        found.append(chunk)
    return found


def extract_phone(text: str) -> list[Phone]:
    """Сначала у кандидата убираем не-цифры, потом проверяем осмысленность."""
    original = text or ""
    found: list[Phone] = []
    seen: set[str] = set()
    for match in _PHONE_SPAN_RE.finditer(original):
        span = match.group(0)
        digits = re.sub(r"\D", "", span)
        for normalized, kind in _classify_digit_run(digits):
            if normalized in seen:
                continue
            seen.add(normalized)
            found.append(
                Phone(digits=re.sub(r"\D", "", normalized), normalized=normalized, original=span.strip(), kind=kind)
            )
    return found


def extract_phones(text: str) -> list[Phone]:
    return extract_phone(text)


_profession_patterns: list[tuple[dict[str, Any], str, re.Pattern[str]]] | None = None
_profession_mtime: float | None = None


def _profession_terms() -> list[tuple[dict[str, Any], str, re.Pattern[str]]]:
    global _profession_patterns, _profession_mtime
    mtime = shared_config.PROFESSIONS_PATH.stat().st_mtime
    if _profession_patterns is not None and _profession_mtime == mtime:
        return _profession_patterns
    items: list[tuple[dict[str, Any], str, re.Pattern[str]]] = []
    for prof in shared_config.get_profession_items():
        terms = [prof["name"], *list(prof.get("synonyms") or [])]
        for term in terms:
            folded = fold_text(term).strip()
            if not folded:
                continue
            parts = [re.escape(part) for part in folded.split() if part]
            body = r"\s+".join(parts)
            # Окончания только у последнего слова, и короткие: сварщик|сварщика.
            pattern = re.compile(rf"\b{body}\w{{0,4}}\b", re.IGNORECASE | re.UNICODE)
            items.append((prof, term, pattern))
    items.sort(key=lambda row: -len(fold_text(row[1])))
    _profession_patterns = items
    _profession_mtime = mtime
    return items


def extract_profession(text: str) -> ProfessionHit | None:
    body = normalize(text).text
    if not body:
        return None
    best: ProfessionHit | None = None
    best_len = 0
    for prof, term, pattern in _profession_terms():
        match = pattern.search(body)
        if not match:
            continue
        matched = match.group(0)
        if len(matched) > best_len:
            best_len = len(matched)
            best = ProfessionHit(
                slug=prof["slug"],
                name=prof["name"],
                sphere=prof["sphere"],
                matched=matched,
            )
    return best


def extract_professions(text: str) -> list[ProfessionHit]:
    """Все профессии из словаря, по порядку в тексте.

    extract_profession оставляет одно самое длинное совпадение — так нужно
    фильтру. Разделению поста нужны все: «сварщик и повар» это две должности.
    Короткое совпадение внутри длинного не считаем: «водитель» внутри
    «водитель-экспедитор» не вторая работа.
    """
    body = fold_text(text)
    if not body:
        return []
    raw: list[ProfessionHit] = []
    for prof, _term, pattern in _profession_terms():
        for match in pattern.finditer(body):
            raw.append(
                ProfessionHit(
                    slug=prof["slug"],
                    name=prof["name"],
                    sphere=prof["sphere"],
                    matched=match.group(0),
                    start=match.start(),
                    end=match.end(),
                )
            )
    raw.sort(key=lambda hit: (-(hit.end - hit.start), hit.start, hit.slug))
    accepted: list[ProfessionHit] = []
    for hit in raw:
        if any(hit.start < other.end and hit.end > other.start for other in accepted):
            continue
        accepted.append(hit)
    accepted.sort(key=lambda hit: (hit.start, hit.end, hit.slug))
    return accepted


def _phone_region_city(text: str) -> str | None:
    phones = extract_phone(text)
    codes = (compiled()["keywords"].get("extract") or {}).get("phoneCodes") or []
    for phone in phones:
        digits = phone.digits
        if digits.startswith("8") and len(digits) == 11:
            digits = "7" + digits[1:]
        for code in codes:
            prefix = str(code.get("digits") or "")
            if prefix and digits.startswith(prefix):
                city = shared_config.active_city_for_region(str(code.get("region") or ""))
                if city:
                    return city
    return None


def _city_from_token(token: str) -> str | None:
    token = fold_text(token)
    hit = shared_config.find_city_alias(token)
    if hit:
        return hit[1]
    return None


def extract_city(
    text: str,
    source: dict[str, Any] | None = None,
    *,
    work_format: str | None = None,
) -> CityHit:
    """Приоритет 11.3: явный город → район → город источника → код телефона → неизвестно.

    У вахты город в тексте чаще место работы, а не набор. Город набора тогда
    берём из источника, если набор прямо не назван («набор в Горловке»).
    """
    source = source or {}
    default_city = source.get("default_city") or source.get("defaultCity")
    body = normalize(text).text

    if work_format == "VAHTA":
        extract_cfg = compiled()["keywords"].get("extract") or {}
        for entry in extract_cfg.get("recruitingPhrases") or []:
            pattern = compile_term(entry) if "pattern" not in entry else re.compile(entry["pattern"], re.I | re.U)
            match = pattern.search(body)
            if not match:
                continue
            token = match.group(1) if match.lastindex else match.group(0)
            slug = _city_from_token(token)
            if slug:
                return CityHit(city_slug=slug, district_slug=None, reason="recruiting_phrase")
        if default_city:
            return CityHit(city_slug=str(default_city), district_slug=None, reason="source_default")
        phone_city = _phone_region_city(text)
        if phone_city:
            return CityHit(city_slug=phone_city, district_slug=None, reason="phone_code")
        return CityHit(city_slug=None, district_slug=None, reason="unknown")

    city = shared_config.find_city_alias(body)
    if city:
        district = shared_config.find_district_alias(body)
        district_slug = district[2] if district and district[1] == city[1] else None
        return CityHit(city_slug=city[1], district_slug=district_slug, reason="explicit_city")

    district = shared_config.find_district_alias(body)
    if district:
        return CityHit(city_slug=district[1], district_slug=district[2], reason="district")

    if default_city:
        return CityHit(city_slug=str(default_city), district_slug=None, reason="source_default")

    phone_city = _phone_region_city(text)
    if phone_city:
        return CityHit(city_slug=phone_city, district_slug=None, reason="phone_code")

    return CityHit(city_slug=None, district_slug=None, reason="unknown")


def extract_schedule(text: str) -> str | None:
    """Сменный график вида 2/2. Вахтовая ротация 60/30 сюда не попадает."""
    body = normalize(text).text
    schedule_max, _rotation_min = _vahta_bounds()
    found: list[str] = []
    for match in _PAIR_RE.finditer(body):
        left, right = int(match.group(1)), int(match.group(2))
        if left <= schedule_max and right <= schedule_max:
            found.append(f"{left}/{right}")
    if found:
        return found[0]
    groups = compiled()
    hits = iter_hits(groups["scheduleWords"], body)
    if hits:
        # Само слово «график» без схемы смен — слабый сигнал, в поле не кладём.
        useful = [sample for entry, sample in hits if entry.get("id") != "grafik"]
        if useful:
            return useful[0]
    return None


def extract_experience(text: str) -> dict[str, Any] | None:
    body = normalize(text).text
    groups = compiled()
    for entry, sample in iter_hits(groups["experience"], body):
        years = entry.get("years")
        return {"years": years, "raw": sample, "id": entry.get("id")}
    match = _EXPERIENCE_YEARS_RE.search(body)
    if match:
        amount = int(match.group(1))
        unit = match.group(2).casefold()
        if unit.startswith("мес"):
            years = 0 if amount < 12 else amount // 12
        else:
            years = amount
        return {"years": years, "raw": match.group(0)}
    return None


def extract_employment(text: str) -> str | None:
    body = normalize(text).text
    groups = compiled()
    for entry, _sample in iter_hits(groups["employment"], body):
        value = entry.get("value")
        if value:
            return str(value)
    from vahta import detect_work_format

    if detect_work_format(text) == "VAHTA":
        return "vahta"
    return None


def extract_contacts(text: str) -> Contacts:
    original = text or ""
    usernames = [f"@{item}" for item in _USERNAME_RE.findall(original)]
    links = _LINK_RE.findall(original)
    # уникальные, порядок сохранён
    seen_u: set[str] = set()
    uniq_u: list[str] = []
    for name in usernames:
        key = name.casefold()
        if key not in seen_u:
            seen_u.add(key)
            uniq_u.append(name)
    seen_l: set[str] = set()
    uniq_l: list[str] = []
    for link in links:
        key = link.rstrip(").,;").casefold()
        if key not in seen_l:
            seen_l.add(key)
            uniq_l.append(link.rstrip(").,;"))
    return Contacts(usernames=uniq_u, links=uniq_l)


def content_hash(text: str, phone: str | None = None) -> str:
    """sha1(первые 500 нормализованных символов + телефон) — уровень 2 из 11.5."""
    body = normalize(text).text[:500]
    payload = f"{body}|{phone or ''}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()
