"""Четвёртый уровень дедупликации (раздел 11.17 ядра).

Дубли не удаляем — собираем в группу. Одна вахта в восьми группах
с восьми телефонов — это информация: человеку видно, что вакансию
продвигают, в оценку доверия идёт число разных номеров, в очереди
модерации один пункт вместо восьми.

Уровни 1–3 (11.5) дешёвые и работают при приёме: точный отпечаток,
нормализованный текст + телефон, заголовок + зарплата + город.
Их недостаточно для вахт: вербовщики пишут разными словами и с разных
номеров. Здесь — сигнатура плюс сходство текста.

Сигнатура считается одинаково для одного входа: профессия + workFormat
+ место работы + коридор зарплаты до 10 000 + схема вахты.

Сходство без библиотек. Нормализованный текст, без служебных слов,
режем на тройки соседних слов (шинглы) и берём долю общих троек
к общему числу разных — мера Жаккара. Выше 0,6 — одно объявление.

Пример на двух коротких фразах (после выброса «на», «и», «за»):

    «сварщик вахта ямал проживание питание»
    тройки: (сварщик вахта ямал), (вахта ямал проживание),
            (ямал проживание питание)

    «сварщик вахта ямал проживание питание официально»
    тройки: (сварщик вахта ямал), (вахта ямал проживание),
            (ямал проживание питание), (проживание питание официально)

Общих 3, разных 4, Жаккар 3/4 = 0,75 — выше порога, это одно объявление.
Приём укладывается в десятки строк чистого Python и полностью объясним,
в отличие от «умных» библиотек, чей ответ нельзя показать в админке.

Почему нельзя сравнивать каждую вакансию с каждой: при 5000 записях
это 5000 × 4999 / 2 = 12,5 миллиона сравнений. Никакой лимит времени
Vercel (10 секунд) этого не выдержит. Поэтому корзины: только одна
сигнатура и только последние 60 дней.

Правило городов. Местные дубли — внутри города: продавец в Горловке
и продавец в Донецке — разные работы, в сигнатуру идёт citySlug.
Вахты — по всем городам сразу: одна вахта на Ямал висит и в горловских,
и в донецких группах, в сигнатуру идёт место работы (ЯНАО), не город набора.

Нечёткая группировка — ночным заданием (Этап 15, GitHub Actions),
не в момент приёма. При приёме process_post только ставит signature.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import shared_config
from filter import fold_text, normalize

_WORD_RE = __import__("re").compile(r"[а-яёa-z0-9]+", __import__("re").IGNORECASE)


def _cfg() -> dict[str, Any]:
    return dict(shared_config.get_keywords().get("fraud") or {})


def _stop_words() -> set[str]:
    raw = _cfg().get("shingleStopWords") or []
    return {fold_text(str(item)) for item in raw}


def _salary_bucket(fields: dict[str, Any], corridor: int) -> str:
    amount = fields.get("salaryFrom")
    if amount is None:
        amount = fields.get("salaryTo")
    if amount is None:
        return "none"
    return str(int(amount) // corridor * corridor)


def work_location_for_signature(fields: dict[str, Any]) -> str:
    """Место, по которому ищем дубли. У вахты это объект, не город набора."""
    fmt = str(fields.get("workFormat") or "LOCAL").upper()
    if fmt == "VAHTA":
        return (
            str(fields.get("workDestinationSlug") or "").strip()
            or str(fields.get("workCitySlug") or "").strip()
            or fold_text(str(fields.get("workLocationText") or "")).strip()
            or "vahta"
        )
    return str(fields.get("citySlug") or "unknown")


def build_signature(fields: dict[str, Any] | None) -> str:
    """профессия|формат|место|коридор зарплаты|ротация — уровень 4 из 11.17."""
    merged = dict(fields or {})
    cfg = _cfg()
    corridor = int(cfg.get("salaryCorridor") or 10_000)
    slug = str(merged.get("professionSlug") or "unknown")
    fmt = str(merged.get("workFormat") or "LOCAL").upper()
    location = work_location_for_signature(merged)
    bucket = _salary_bucket(merged, corridor)
    rotation = str(merged.get("rotationPattern") or "")
    return "|".join([slug, fmt, location, bucket, rotation])


def shingles(text: str, size: int = 3) -> set[tuple[str, ...]]:
    """Тройки соседних слов после нормализации и выброса служебных."""
    stop = _stop_words()
    body = normalize(text or "").text
    words = [word for word in _WORD_RE.findall(body) if word not in stop]
    if len(words) < size:
        if not words:
            return set()
        return {tuple(words)}
    return {tuple(words[index : index + size]) for index in range(len(words) - size + 1)}


def jaccard(left: set[Any], right: set[Any]) -> float:
    """|A∩B| / |A∪B|. Пустые множества — не «одинаковые объявления»."""
    if not left and not right:
        return 0.0
    if not left or not right:
        return 0.0
    union = len(left | right)
    if union == 0:
        return 0.0
    return len(left & right) / union


def _parse_when(record: dict[str, Any]) -> datetime | None:
    raw = record.get("publishedAt") or record.get("createdAt") or record.get("seenAt")
    if raw is None:
        return None
    if isinstance(raw, datetime):
        if raw.tzinfo is None:
            return raw.replace(tzinfo=timezone.utc)
        return raw
    text = str(raw)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _shingle_text(record: dict[str, Any]) -> str:
    return str(
        record.get("unitText")
        or record.get("description")
        or record.get("rawText")
        or record.get("text")
        or ""
    )


class _UnionFind:
    def __init__(self, count: int) -> None:
        self.parent = list(range(count))

    def find(self, item: int) -> int:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, left: int, right: int) -> None:
        root_l, root_r = self.find(left), self.find(right)
        if root_l != root_r:
            self.parent[root_r] = root_l


def cluster_records(
    records: list[dict[str, Any]],
    *,
    now: datetime | None = None,
    window_days: int | None = None,
    threshold: float | None = None,
) -> list[list[int]]:
    """Группы индексов внутри корзин. Не вызывать из process_post.

    Ночное задание: шинглы и Жаккар только внутри одной сигнатуры
    за последние 60 дней. При 5000 записей все пары — 12,5 млн сравнений;
    внутри корзины из 40 копий одной вахты — меньше тысячи.
    """
    cfg = _cfg()
    window = int(window_days if window_days is not None else cfg.get("basketWindowDays") or 60)
    limit = float(threshold if threshold is not None else cfg.get("jaccardThreshold") or 0.6)
    clock = now or datetime.now(timezone.utc)
    if clock.tzinfo is None:
        clock = clock.replace(tzinfo=timezone.utc)
    cutoff = clock - timedelta(days=window)

    alive: list[int] = []
    for index, record in enumerate(records):
        when = _parse_when(record)
        if when is not None and when < cutoff:
            continue
        alive.append(index)

    baskets: dict[str, list[int]] = {}
    for index in alive:
        record = records[index]
        signature = record.get("signature") or build_signature(record)
        baskets.setdefault(str(signature), []).append(index)

    groups: list[list[int]] = []
    for bucket in baskets.values():
        if len(bucket) == 1:
            groups.append(bucket)
            continue
        cache = {index: shingles(_shingle_text(records[index])) for index in bucket}
        forest = _UnionFind(len(bucket))
        for left_pos, left in enumerate(bucket):
            for right_pos in range(left_pos + 1, len(bucket)):
                right = bucket[right_pos]
                if jaccard(cache[left], cache[right]) > limit:
                    forest.union(left_pos, right_pos)
        clustered: dict[int, list[int]] = {}
        for pos, index in enumerate(bucket):
            clustered.setdefault(forest.find(pos), []).append(index)
        groups.extend(clustered.values())
    return groups
