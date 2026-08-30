"""Оценка доверия объявления (раздел 11.18 ядра, Закон 18).

Это другой вопрос, чем is_vacancy. Фильтр отвечает «это вообще вакансия?».
trust_score отвечает «ей можно верить?». Пост может быть безупречно
оформленной вакансией и явным обманом одновременно. Поэтому сюда нельзя
звать is_vacancy, explicit_svo и hidden_svo: смешав слои, мы либо пропустим
вербовку «250 000 за два часа», либо забракуем честную вахту.

Стартуем со 100 и вычитаем. Веса — блок fraud в shared/keywords.json.
Жёсткий флаг (предоплата от соискателя, дроппер, клады, торговля людьми)
→ BLOCKED, баллы не считаются, в очередь не идёт. Текст всё равно
сохраняем: это свидетельство, не карточка на сайте.

Зарплату сравниваем с нашей медианой по той же профессии и тому же
workFormat. Вахта законно втрое выше местной: без формата все честные
вахты попадут под подозрение. Выборка меньше 5 — потолок сферы из JSON,
не выдуманная константа в коде.

Правило нового контакта: телефон, которого не было в белом списке,
идёт на одобрение хотя бы один раз, даже при балле ≥ 70. Как только
контакт в TRUSTED, следующие объявления публикуются сами. Очередь
со временем сокращается, а не растёт бесконечно.

Пороги: ≥ 70 можно публиковать, 40–69 ручное одобрение, < 40 то же
с пометкой «высокий риск». Автопубликации «если не проверил за сутки»
нет и не будет.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config
from filter import compile_terms, iter_hits, normalize

ModerationStatus = Literal["AUTO_OK", "PENDING", "BLOCKED"]

_PAIR_HOURS_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч)\b",
    re.IGNORECASE,
)
_ONE_HOURS_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч)\s*(?:в\s+день|в\s+сутки)\b",
    re.IGNORECASE,
)
_PARU_HOURS_RE = re.compile(r"\bпар[уыеа]\s+час", re.IGNORECASE)
_CLOCK_SPAN_RE = re.compile(
    r"с\s+(\d{1,2})[:.](\d{2})\s+до\s+(\d{1,2})[:.](\d{2})",
    re.IGNORECASE,
)
_compiled: dict[str, Any] = {"mtime": None, "bundle": None}


@dataclass
class TrustFlag:
    id: str
    points: int
    sample: str = ""
    label: str = ""
    detail: str = ""

    def as_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "points": self.points,
            "label": self.label or self.id,
        }
        if self.sample:
            data["sample"] = self.sample
        if self.detail:
            data["detail"] = self.detail
        return data


@dataclass
class TrustDecision:
    score: int
    flags: list[TrustFlag] = field(default_factory=list)
    hard: bool = False
    high_risk: bool = False
    moderation_status: ModerationStatus = "PENDING"
    reasons: list[str] = field(default_factory=list)
    hours_per_day: float | None = None
    monthly_salary: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "flags": [item.as_dict() for item in self.flags],
            "hard": self.hard,
            "highRisk": self.high_risk,
            "moderationStatus": self.moderation_status,
            "reasons": list(self.reasons),
        }


def _cfg() -> dict[str, Any]:
    return dict(shared_config.get_keywords().get("fraud") or {})


def _bundle() -> dict[str, Any]:
    mtime = shared_config.KEYWORDS_PATH.stat().st_mtime
    if _compiled["mtime"] != mtime:
        shared_config.reload()
        cfg = _cfg()
        _compiled["bundle"] = {
            "cfg": cfg,
            "fastMoney": compile_terms(cfg.get("fastMoney")),
            "privacy": compile_terms(cfg.get("privacy")),
            "denials": compile_terms(cfg.get("denials")),
            "hardFlags": compile_terms(cfg.get("hardFlags")),
            "abroad": compile_terms(cfg.get("abroad")),
            "documentsHelp": compile_terms(cfg.get("documentsHelp")),
            "klady": compile_terms(cfg.get("klady")),
            "dailyPay": compile_terms(cfg.get("dailyPay")),
        }
        _compiled["mtime"] = mtime
    return _compiled["bundle"]


def reload_trust() -> None:
    """Сбросить кэш. Нужно тестам: правка JSON без правки кода."""
    shared_config.reload()
    _compiled["mtime"] = None
    _bundle()


def extract_hours_per_day(text: str) -> float | None:
    """Часы в день, только если они написаны. Не догадываемся про «полный день»."""
    body = normalize(text or "").text
    if not body:
        return None
    if _PARU_HOURS_RE.search(body):
        return 2.0
    pair = _PAIR_HOURS_RE.search(body)
    if pair:
        left = float(pair.group(1).replace(",", "."))
        right = float(pair.group(2).replace(",", "."))
        if 0 < left <= 16 and 0 < right <= 16:
            return round((left + right) / 2, 2)
    one = _ONE_HOURS_RE.search(body)
    if one:
        value = float(one.group(1).replace(",", "."))
        if 0 < value <= 16:
            return value
    clock = _CLOCK_SPAN_RE.search(body)
    if clock:
        start = int(clock.group(1)) + int(clock.group(2)) / 60
        end = int(clock.group(3)) + int(clock.group(4)) / 60
        if end <= start:
            end += 24
        hours = end - start
        if 1 <= hours <= 16:
            return round(hours, 2)
    return None


def _salary_amount(fields: dict[str, Any]) -> tuple[int | None, str | None]:
    raw_from = fields.get("salaryFrom")
    raw_to = fields.get("salaryTo")
    amounts = [int(item) for item in (raw_from, raw_to) if item is not None]
    if not amounts:
        return None, fields.get("salaryPeriod")
    return max(amounts), fields.get("salaryPeriod")


def monthly_equivalent(amount: int, period: str | None, cfg: dict[str, Any]) -> int:
    """Приводим к месяцу, чтобы сравнивать с медианой.

    «180 000 за смену» у вахты почти всегда имеет в виду месяц, а не
    одну рабочую смену. Если сумма уже похожа на месячную (порог в JSON),
    не умножаем её на число смен — иначе честная вахта станет «миллионом».
    """
    token = (period or "month") or "month"
    token = str(token).lower()
    days = int(cfg.get("workDaysPerMonth") or 22)
    hours = float(cfg.get("hoursPerDayDefault") or 8)
    shift_as_month = int(cfg.get("shiftAsMonthlyAbove") or 40000)
    if token in {"month", "monthly"}:
        return int(amount)
    if token in {"hour", "hourly"}:
        return int(amount * days * hours)
    if token in {"day", "daily"}:
        return int(amount * days)
    if token in {"shift", "piece"}:
        if amount >= shift_as_month:
            return int(amount)
        return int(amount * days)
    return int(amount)


def _format_money(value: int) -> str:
    return f"{value:,}".replace(",", " ") + " ₽"


def _profession_label(fields: dict[str, Any]) -> str:
    return str(fields.get("professionName") or fields.get("professionSlug") or "без профессии")


def _work_format(fields: dict[str, Any]) -> str:
    token = str(fields.get("workFormat") or "LOCAL").upper()
    if token not in {"LOCAL", "VAHTA", "REMOTE"}:
        return "LOCAL"
    return token


def _market_row(
    market: dict[str, Any] | None,
    slug: str | None,
    work_format: str,
) -> dict[str, Any] | None:
    if not slug:
        return None
    row = ((market or {}).get("byProfession") or {}).get(slug)
    if not isinstance(row, dict):
        return None
    nested = row.get(work_format)
    if isinstance(nested, dict) and ("median" in nested or "sample" in nested):
        return nested
    # Плоская запись без формата — только для LOCAL, иначе вахта
    # получит местную медиану и все честные вахты станут подозрительными.
    if work_format == "LOCAL" and "median" in row:
        return row
    return None


def _ceiling(cfg: dict[str, Any], work_format: str, sphere: str | None) -> int | None:
    block = (cfg.get("sphereSalaryCeiling") or {}).get(work_format) or {}
    if sphere and block.get(sphere) is not None:
        return int(block[sphere])
    if block.get("default") is not None:
        return int(block["default"])
    return None


def _big_money_bar(cfg: dict[str, Any], work_format: str) -> int:
    bars = cfg.get("bigMoneyMonthly") or {}
    if bars.get(work_format) is not None:
        return int(bars[work_format])
    return int(bars.get("LOCAL") or 80000)


def _contact_key(fields: dict[str, Any]) -> str | None:
    phone = fields.get("contactPhone")
    if phone:
        return str(phone)
    telegram = fields.get("contactTelegram")
    if telegram:
        token = str(telegram).strip()
        if token and not token.startswith("@"):
            token = "@" + token
        return token.lower() if token else None
    return None


def _verdict_for(
    key: str | None,
    contact_verdicts: dict[str, Any] | None,
) -> str | None:
    if not key or contact_verdicts is None:
        return None
    direct = contact_verdicts.get(key)
    if isinstance(direct, str):
        return direct.upper()
    lowered = contact_verdicts.get(key.lower()) if isinstance(key, str) else None
    if isinstance(lowered, str):
        return lowered.upper()
    nested = contact_verdicts.get("phones") or contact_verdicts.get("accounts") or {}
    if isinstance(nested, dict):
        found = nested.get(key) or nested.get(key.lower())
        if isinstance(found, str):
            return found.upper()
    return None


def _add(
    flags: list[TrustFlag],
    reasons: list[str],
    *,
    rule_id: str,
    points: int,
    sample: str = "",
    label: str = "",
    detail: str = "",
) -> None:
    flags.append(
        TrustFlag(
            id=rule_id,
            points=points,
            sample=sample,
            label=label or rule_id,
            detail=detail,
        )
    )
    extra = f" («{sample}»)" if sample else ""
    line = f"{label or rule_id}{extra}"
    if detail:
        line = f"{line}: {detail}"
    reasons.append(line)


def _phrase_hits(
    group: list[Any],
    body: str,
    fields: dict[str, Any],
    flags: list[TrustFlag],
    reasons: list[str],
) -> None:
    has_phone = bool(fields.get("contactPhone"))
    for entry, sample in iter_hits(group, body):
        if entry.get("requireNoPhone") and has_phone:
            continue
        _add(
            flags,
            reasons,
            rule_id=str(entry.get("id") or sample),
            points=int(entry.get("weight") or 0),
            sample=sample,
            label=str(entry.get("label") or entry.get("id") or sample),
        )


def trust_score(
    fields: dict[str, Any] | None,
    text: str,
    market: dict[str, Any] | None = None,
    *,
    contact_verdicts: dict[str, Any] | None = None,
    aggregation: dict[str, Any] | None = None,
) -> TrustDecision:
    """0–100 и список сработавших признаков. Не вызывает is_vacancy."""
    bundle = _bundle()
    cfg = bundle["cfg"]
    merged = dict(fields or {})
    body = normalize(text or "").text
    fmt = _work_format(merged)
    merged["workFormat"] = fmt
    flags: list[TrustFlag] = []
    reasons: list[str] = []
    hours = extract_hours_per_day(text or "")
    amount, period = _salary_amount(merged)
    monthly = monthly_equivalent(amount, period, cfg) if amount is not None else None
    slug = merged.get("professionSlug")
    sphere = merged.get("sphere")
    contact_key = _contact_key(merged)
    contact_kind = _verdict_for(contact_key, contact_verdicts)

    hard = False

    for entry, sample in iter_hits(bundle["hardFlags"], body):
        hard = True
        _add(
            flags,
            reasons,
            rule_id=str(entry.get("id") or sample),
            points=0,
            sample=sample,
            label=str(entry.get("label") or entry.get("id") or sample),
        )

    abroad = iter_hits(bundle["abroad"], body)
    docs = iter_hits(bundle["documentsHelp"], body)
    if abroad and docs and hard:
        _add(
            flags,
            reasons,
            rule_id="trafficking_combo",
            points=0,
            sample=abroad[0][1],
            label="признаки торговли людьми",
            detail="работа за границей + документы + предоплата",
        )

    if iter_hits(bundle["klady"], body):
        hard = True
        sample = iter_hits(bundle["klady"], body)[0][1]
        _add(flags, reasons, rule_id="klady", points=0, sample=sample, label="клады / расфасовка")

    daily = bool(iter_hits(bundle["dailyPay"], body) or (period and str(period).lower() in {"day", "daily"}))
    if slug == "kurer" and daily and monthly is not None:
        row = _market_row(market, slug, fmt)
        min_sample = int(cfg.get("minSample") or 5)
        multiplier = float(cfg.get("salaryMultiplier") or 3)
        if row and int(row.get("sample") or 0) >= min_sample and row.get("median"):
            bar = int(row["median"]) * multiplier
            if monthly >= bar:
                hard = True
                _add(
                    flags,
                    reasons,
                    rule_id="courier_daily_high",
                    points=0,
                    sample=str(monthly),
                    label="курьер + ежедневная оплата + зарплата втрое выше медианы",
                )

    if contact_kind == "BLOCKED":
        hard = True
        _add(
            flags,
            reasons,
            rule_id="blacklisted_contact",
            points=0,
            sample=contact_key or "",
            label="контакт из чёрного списка",
        )

    if hard:
        return TrustDecision(
            score=0,
            flags=flags,
            hard=True,
            high_risk=True,
            moderation_status="BLOCKED",
            reasons=reasons,
            hours_per_day=hours,
            monthly_salary=monthly,
        )

    _phrase_hits(bundle["fastMoney"], body, merged, flags, reasons)
    _phrase_hits(bundle["privacy"], body, merged, flags, reasons)
    _phrase_hits(bundle["denials"], body, merged, flags, reasons)

    min_sample = int(cfg.get("minSample") or 5)
    multiplier = float(cfg.get("salaryMultiplier") or 3)
    weights = cfg.get("weights") or {}

    if monthly is not None:
        row = _market_row(market, slug, fmt)
        sample_n = int((row or {}).get("sample") or 0)
        median = int(row["median"]) if row and row.get("median") is not None else None
        if sample_n >= min_sample and median:
            if monthly >= int(median * multiplier):
                detail = (
                    f"{_format_money(monthly)} при медиане {_format_money(median)} "
                    f"по профессии {_profession_label(merged)} (выборка {sample_n})"
                )
                _add(
                    flags,
                    reasons,
                    rule_id="salary_vs_median",
                    points=int(weights.get("salaryVsMedian") or 40),
                    sample=str(monthly),
                    label="зарплата выше медианы более чем втрое",
                    detail=detail,
                )
        else:
            ceiling = _ceiling(cfg, fmt, sphere)
            if ceiling and monthly > ceiling:
                detail = (
                    f"{_format_money(monthly)} при потолке {_format_money(ceiling)} "
                    f"по сфере {sphere or 'default'} (выборка {sample_n})"
                )
                _add(
                    flags,
                    reasons,
                    rule_id="salary_vs_ceiling",
                    points=int(weights.get("salaryVsMedian") or 40),
                    sample=str(monthly),
                    label="зарплата выше потолка сферы",
                    detail=detail,
                )

        if hours:
            implied = monthly / (hours * int(cfg.get("workDaysPerMonth") or 22))
            default_hours = float(cfg.get("hoursPerDayDefault") or 8)
            days = int(cfg.get("workDaysPerMonth") or 22)
            if median:
                median_hourly = median / (default_hours * days)
            else:
                ceiling = _ceiling(cfg, fmt, sphere) or _big_money_bar(cfg, fmt)
                median_hourly = ceiling / (default_hours * days) / multiplier
            hourly_mult = float(cfg.get("hourlyMultiplier") or 3)
            if implied >= median_hourly * hourly_mult:
                detail = (
                    f"около {implied:,.0f} ₽ в час при медиане {median_hourly:,.0f}".replace(",", " ")
                )
                _add(
                    flags,
                    reasons,
                    rule_id="hourly_vs_median",
                    points=int(weights.get("hourlyVsMedian") or 25),
                    sample=str(hours),
                    label="деньги против труда",
                    detail=detail,
                )

        big = monthly >= _big_money_bar(cfg, fmt)
        if big:
            desc = str(merged.get("description") or text or "")
            if not slug:
                _add(
                    flags,
                    reasons,
                    rule_id="empty_profession",
                    points=int(weights.get("emptyProfession") or 15),
                    label="большие деньги без профессии из словаря",
                )
            if not merged.get("employerName"):
                _add(
                    flags,
                    reasons,
                    rule_id="empty_company",
                    points=int(weights.get("emptyCompany") or 8),
                    label="большие деньги без названия компании",
                )
            if len(desc) < int(cfg.get("shortDescriptionChars") or 150):
                _add(
                    flags,
                    reasons,
                    rule_id="short_description",
                    points=int(weights.get("shortDescription") or 12),
                    label="большие деньги при коротком описании",
                )
            if merged.get("contactTelegram") and not merged.get("contactPhone"):
                _add(
                    flags,
                    reasons,
                    rule_id="account_no_phone",
                    points=int(weights.get("accountNoPhone") or 15),
                    label="только аккаунт без телефона",
                )

    agg = aggregation or {}
    phones_in_group = int(agg.get("distinctPhones") or agg.get("distinctPhonesCount") or 0)
    if phones_in_group >= int(cfg.get("manyPhonesInGroup") or 5):
        _add(
            flags,
            reasons,
            rule_id="many_phones_in_group",
            points=int(weights.get("manyPhonesInGroup") or 20),
            sample=str(phones_in_group),
            label="много размещений с разными телефонами",
        )
    professions_for_phone = list(agg.get("professionsForPhone") or [])
    need = int(cfg.get("incompatibleProfessionCount") or 10)
    if len(set(professions_for_phone)) >= need:
        _add(
            flags,
            reasons,
            rule_id="phone_many_professions",
            points=int(weights.get("phoneManyProfessions") or 25),
            sample=str(len(set(professions_for_phone))),
            label="один телефон на несовместимых профессиях",
        )

    deducted = sum(item.points for item in flags)
    score = max(0, min(100, 100 - deducted))
    publish_at = int((cfg.get("thresholds") or {}).get("publish") or 70)
    review_at = int((cfg.get("thresholds") or {}).get("review") or 40)
    high_risk = score < review_at

    status: ModerationStatus
    if score >= publish_at:
        status = "AUTO_OK"
    else:
        status = "PENDING"

    # Неизвестный контакт — на одобрение один раз, даже при высоком балле.
    # contact_verdicts is None: таблицы ещё нет, правило не из чего применить.
    # Пустой словарь: все контакты новые.
    if contact_verdicts is not None and status == "AUTO_OK":
        if contact_kind != "TRUSTED":
            status = "PENDING"
            _add(
                flags,
                reasons,
                rule_id="new_contact",
                points=0,
                sample=contact_key or "",
                label="новый контакт — первое одобрение",
            )

    return TrustDecision(
        score=score,
        flags=flags,
        hard=False,
        high_risk=high_risk,
        moderation_status=status,
        reasons=reasons,
        hours_per_day=hours,
        monthly_salary=monthly,
    )
