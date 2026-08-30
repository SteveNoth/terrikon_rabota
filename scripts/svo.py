"""Отсев наборов на СВО (раздел 11.15 ядра).

Это не формат работы. workFormat по-прежнему только LOCAL / VAHTA / REMOTE.
Четвёртого значения нет: набор на СВО — отброс, не карточка на сайте.

Два разных вопроса, которые сюда не входят:

    is_vacancy  — «это вообще вакансия?»  Набор на СВО часто оформлен как
                  идеальная вакансия (должность, зарплата, телефон) и
                  проходит фильтр. Поэтому явные слова СВО нельзя спрятать
                  в стоп-слова фильтра: причина была бы «это не вакансия»,
                  а правильная — «это не наш тип объявления».

    trust_score — «можно ли верить вакансии?»  Здесь ещё не написан, и
                  вызывать его нельзя. Скрытый набор — не мошенничество
                  в смысле завышенной зп сварщика: это другой тип объявления.

Почему скрытый слой нельзя вставить в фильтр is_vacancy
    Фильтр смотрит на сырой текст. У него ещё нет профессии из словаря,
    нет workFormat и нет зарплаты числом. Если отбрасывать «повар + большая
    цифра» на этом шаге, честная вахта повара на Ямал (180 000, 60/30,
    жильё на объекте) станет мусором вместе с местным «охранник 250 000
    без объекта». Скрытую проверку можно делать только после extract_*
    и detect_work_format, на каждой единице нарезки, и только когда
    сработали все три условия сразу.

Порядок (как в 11.1; process_post здесь не пишем):
    явный СВО на целом посте → если reject, единиц нет, резать нельзя;
    иначе нарезка → поля и формат → скрытый СВО на каждой единице.

Словари и пороги — блок svo в shared/keywords.json (Закон 5).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config
from extract import (
    extract_phone,
    extract_profession,
    extract_salary,
    extract_schedule,
)
from filter import compile_terms, iter_hits, normalize
from split import SplitUnit, split_post, unit_external_id
from vahta import (
    detect_work_format,
    extract_rotation,
    extract_vahta_conditions,
    extract_work_location,
)

Verdict = Literal["reject", "maybe", "clear"]
Layer = Literal["explicit", "hidden"]

_MONTHLY = {"month", "MONTH", None}
_NON_MONTHLY = {"hour", "HOUR", "day", "DAY", "shift", "SHIFT", "piece", "PIECE"}

_compiled: dict[str, Any] = {"mtime": None, "cfg": None, "explicit": None}


@dataclass
class SvoHit:
    id: str
    points: int
    sample: str = ""
    label: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "points": self.points,
            "sample": self.sample,
            "label": self.label or self.id,
        }


@dataclass
class SvoDecision:
    verdict: Verdict
    score: int
    reasons: list[str]
    rules: list[SvoHit] = field(default_factory=list)
    layer: Layer = "explicit"
    thresholds: dict[str, int] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "score": self.score,
            "reasons": list(self.reasons),
            "rules": [item.as_dict() for item in self.rules],
            "layer": self.layer,
            "thresholds": dict(self.thresholds),
        }


def _svo_cfg() -> dict[str, Any]:
    bundle = _bundle()
    return bundle["cfg"] or {}


def _bundle() -> dict[str, Any]:
    mtime = shared_config.KEYWORDS_PATH.stat().st_mtime
    if _compiled["mtime"] != mtime or _compiled["cfg"] is None:
        shared_config.reload()
        cfg = (shared_config.get_keywords().get("svo") or {})
        _compiled["mtime"] = mtime
        _compiled["cfg"] = cfg
        _compiled["explicit"] = compile_terms(cfg.get("explicit"))
    return _compiled


def reload_svo() -> None:
    """Сбросить кэш. После правки shared/keywords.json в тестах."""
    shared_config.reload()
    _compiled["mtime"] = None
    _bundle()


def _thresholds() -> tuple[int, int]:
    cfg = _svo_cfg().get("thresholds") or {}
    return int(cfg.get("reject") or 40), int(cfg.get("maybe") or 20)


def _verdict(score: int, reject_at: int, maybe_at: int) -> Verdict:
    if score >= reject_at:
        return "reject"
    if score >= maybe_at:
        return "maybe"
    return "clear"


def _hit(entry: dict[str, Any], sample: str) -> SvoHit:
    return SvoHit(
        id=str(entry.get("id") or sample),
        points=int(entry.get("weight") or 10),
        sample=sample,
        label=str(entry.get("label") or entry.get("id") or sample),
    )


def explicit_svo(text: str) -> SvoDecision:
    """Явный набор. Целый пост, до нарезки. reject / maybe / clear."""
    reject_at, maybe_at = _thresholds()
    body = normalize(text or "").text
    rules: list[SvoHit] = []
    for entry, sample in iter_hits(_bundle()["explicit"], body):
        rules.append(_hit(entry, sample))
    score = sum(item.points for item in rules)
    verdict = _verdict(score, reject_at, maybe_at)
    reasons = [
        f"{item.label}: {item.points:+d}" + (f" («{item.sample}»)" if item.sample else "")
        for item in rules
    ]
    if not reasons:
        reasons = ["нет явных признаков СВО"]
    return SvoDecision(
        verdict=verdict,
        score=score,
        reasons=reasons,
        rules=rules,
        layer="explicit",
        thresholds={"reject": reject_at, "maybe": maybe_at},
    )


def _profession_sphere(slug: str | None) -> str | None:
    if not slug:
        return None
    for item in shared_config.get_profession_items():
        if item.get("slug") == slug:
            return item.get("sphere")
    return None


def unit_fields(text: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """Поля единицы так, как их дадут extract_* и detect_work_format.

    hidden_svo читает этот словарь, а не сырой текст: иначе нет профессии,
    формата и зарплаты числом.
    """
    profession = extract_profession(text)
    salary = extract_salary(text)
    rotation = extract_rotation(text)
    location = extract_work_location(text)
    conditions = extract_vahta_conditions(text)
    payload: dict[str, Any] = {
        "professionSlug": profession.slug if profession else None,
        "sphere": profession.sphere if profession else None,
        "salaryMin": salary.min_amount if salary else None,
        "salaryMax": salary.max_amount if salary else None,
        "salaryPeriod": salary.period if salary else None,
        "workFormat": detect_work_format(text),
        "rotationPattern": rotation.pattern if rotation else None,
        "vahtaDays": rotation.vahta_days if rotation else None,
        "workDestinationSlug": location.work_destination_slug,
        "workCitySlug": location.work_city_slug,
        "housingProvided": conditions.housing,
    }
    if extra:
        for key, value in extra.items():
            if value is not None:
                payload[key] = value
    return payload


def _salary_amount(fields: dict[str, Any]) -> tuple[int | None, str | None]:
    period = fields.get("salaryPeriod") or fields.get("period")
    salary = fields.get("salary")
    mn = fields.get("salaryMin") if fields.get("salaryMin") is not None else fields.get("min")
    mx = fields.get("salaryMax") if fields.get("salaryMax") is not None else fields.get("max")
    if salary is not None and hasattr(salary, "min_amount"):
        if mn is None:
            mn = salary.min_amount
        if mx is None:
            mx = salary.max_amount
        period = period or salary.period
    amounts: list[int] = []
    for value in (mn, mx):
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, (int, float)) and value > 0:
            amounts.append(int(value))
    if not amounts:
        return None, period
    return max(amounts), period


def _period_is_monthly(period: str | None) -> bool:
    if period in _NON_MONTHLY:
        return False
    return period in _MONTHLY or period is None


def _vahta_signs(fields: dict[str, Any]) -> list[str]:
    """Признаки честной вахты. Один снимает скрытый отсев.

    Направление (Ямал) — признак даже без слова «вахта»: иначе северную
    работу с высокой ставкой убьём как скрытый набор. Жильё на объекте
    и ротация от 15 дней — из ядра. workFormat=VAHTA тоже.
    Город нашей географии (Мариуполь) сам по себе признаком не является:
    формат там ставят слова «вахта» и проживание, не «чужой город».
    """
    signs: list[str] = []
    if fields.get("workFormat") == "VAHTA":
        signs.append("workFormat")
    vahta_cfg = (shared_config.get_keywords().get("vahta") or {})
    rotation_min = int(vahta_cfg.get("rotationMin") or 15)
    days = fields.get("vahtaDays")
    if fields.get("rotationPattern"):
        signs.append("rotation")
    elif isinstance(days, int) and days >= rotation_min:
        signs.append("rotation")
    if fields.get("workDestinationSlug"):
        signs.append("destination")
    if fields.get("housingProvided"):
        signs.append("housing")
    return signs


def _salary_bars(
    slug: str | None,
    sphere: str | None,
    amount: int,
    market: dict[str, Any] | None,
    cfg: dict[str, Any],
) -> tuple[int | None, int | None, str]:
    """(порог reject, порог maybe, откуда взяли). None — сравнивать не с чем."""
    multiplier = float(cfg.get("salaryMultiplier") or 3)
    maybe_mult = float(cfg.get("maybeMultiplier") or 2.2)
    min_sample = int(cfg.get("minSample") or 5)
    ceilings = cfg.get("sphereSalaryCeiling") or {}
    ceiling = ceilings.get(sphere) if sphere else None
    if ceiling is None:
        ceiling = ceilings.get("default")
    ceiling_n = int(ceiling) if ceiling else None
    maybe_ratio = float(cfg.get("maybeCeilingRatio") or 0.85)

    by_prof = (market or {}).get("byProfession") or {}
    row = by_prof.get(slug) if slug else None
    sample = int((row or {}).get("sample") or 0)
    median = (row or {}).get("median") if row else None

    if sample >= min_sample and median:
        median_n = int(median)
        return (
            int(median_n * multiplier),
            int(median_n * maybe_mult),
            f"median:{slug}:{median_n}:n={sample}",
        )
    if ceiling_n:
        return (
            ceiling_n,
            int(ceiling_n * maybe_ratio),
            f"ceiling:{sphere or 'default'}:{ceiling_n}",
        )
    return None, None, "no_bar"


def hidden_svo(
    fields: dict[str, Any] | None,
    text: str,
    market: dict[str, Any] | None = None,
) -> SvoDecision:
    """Скрытый набор. Единица после extract и формата. Три условия сразу."""
    cfg = _svo_cfg()
    reject_at, maybe_at = _thresholds()
    merged = unit_fields(text or "", extra=fields)
    slug = merged.get("professionSlug")
    sphere = merged.get("sphere") or _profession_sphere(slug)
    merged["sphere"] = sphere

    cover = set(cfg.get("coverProfessions") or [])
    is_cover = bool(slug) and slug in cover
    amount, period = _salary_amount(merged)
    monthly = _period_is_monthly(period)
    signs = _vahta_signs(merged)

    rules: list[SvoHit] = []
    reasons: list[str] = []

    def add(rule_id: str, points: int, sample: str = "", label: str = "") -> None:
        rules.append(SvoHit(id=rule_id, points=points, sample=sample, label=label or rule_id))
        extra = f" («{sample}»)" if sample else ""
        reasons.append(f"{label or rule_id}{extra}")

    if is_cover:
        add("cover", 1, str(slug), "профессия-прикрытие")
    else:
        add("not_cover", 0, str(slug or ""), "не профессия-прикрытие")

    if signs:
        for sign in signs:
            add(f"vahta_{sign}", 0, sign, f"вахтовый признак: {sign}")

    if amount is None:
        add("no_salary", 0, "", "нет зарплаты числом")
    elif not monthly:
        add("salary_period", 0, str(period), "зарплата не за месяц")
    else:
        bar_reject, bar_maybe, bar_src = _salary_bars(slug, sphere, amount, market, cfg)
        if bar_reject is None:
            add("no_bar", 0, bar_src, "нет медианы и потолка")
        elif amount >= bar_reject:
            add("salary_anomaly", 1, f"{amount}>{bar_reject}", "аномальная местная зарплата")
        elif bar_maybe is not None and amount >= bar_maybe:
            add("salary_maybe", 1, f"{amount}>{bar_maybe}", "зарплата выше серого порога")
        else:
            add("salary_ok", 0, f"{amount}<{bar_maybe or bar_reject}", "зарплата рынка")

    cover_ok = any(item.id == "cover" for item in rules)
    salary_reject = any(item.id == "salary_anomaly" for item in rules)
    salary_maybe = any(item.id == "salary_maybe" for item in rules)
    no_vahta = not signs

    if cover_ok and salary_reject and no_vahta:
        verdict: Verdict = "reject"
        score = 2
        reasons.insert(0, "скрытый набор: прикрытие + аномальная зп + нет вахты")
    elif cover_ok and salary_maybe and no_vahta:
        verdict = "maybe"
        score = 1
        reasons.insert(0, "серый скрытый набор: прикрытие + зп выше серого порога + нет вахты")
    else:
        verdict = "clear"
        score = 0
        if not reasons:
            reasons = ["скрытый слой не сработал"]

    return SvoDecision(
        verdict=verdict,
        score=score,
        reasons=reasons,
        rules=rules,
        layer="hidden",
        thresholds={"reject": reject_at, "maybe": maybe_at},
    )


def _source_id(source: dict[str, Any] | None) -> str | None:
    if not source:
        return None
    for key in ("externalId", "external_id", "id"):
        value = source.get(key)
        if value:
            return str(value)
    return None


def _fill_unit(unit: SplitUnit) -> None:
    unit.profession = extract_profession(unit.unit_text)
    unit.salary = extract_salary(unit.unit_text)
    unit.phones = extract_phone(unit.unit_text)
    unit.schedule = extract_schedule(unit.unit_text)


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
    _fill_unit(unit)
    return unit


def apply_svo_gate(
    text: str,
    source: dict[str, Any] | None = None,
    market: dict[str, Any] | None = None,
) -> list[SplitUnit]:
    """СВО-ворота для тестов и будущего сборщика. Это не process_post.

    process_post появится в части 2 этапа 14 и вызовет этот порядок сам:
    явный слой → (фильтр) → нарезка → поля → скрытый слой.
    Здесь только СВО: фильтр, OCR и нормализацию не трогаем.

    reject на целом посте → пустой список, без нарезки.
    maybe на целом посте → одна единица на модерацию, без нарезки
    (иначе фантомные повара и охранники из простыни-набора).
    Иначе режем, скрытый reject выкидывает единицу, maybe помечает.
    """
    original = text if text is not None else ""
    explicit = explicit_svo(original)
    if explicit.verdict == "reject":
        return []
    if explicit.verdict == "maybe":
        reasons = ["svo:explicit:maybe", *explicit.reasons]
        return [_whole_post_unit(original, source, reasons)]

    units = split_post(original, source=source)
    kept: list[SplitUnit] = []
    for unit in units:
        hidden = hidden_svo(unit_fields(unit.unit_text), unit.unit_text, market)
        if hidden.verdict == "reject":
            continue
        if hidden.verdict == "maybe":
            unit.needs_human_review = True
            unit.reasons.append("svo:hidden:maybe")
            unit.reasons.extend(hidden.reasons[:3])
        kept.append(unit)
    return kept
