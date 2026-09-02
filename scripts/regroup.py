"""Ночная нечёткая группировка дублей (раздел 11.17).

Не в /api/parser/upload: у Vercel 10 секунд, у GitHub Actions — бесплатные минуты.

Берём активные вакансии за 60 дней, режем на корзины по signature,
считаем шинглы и Жаккар, склеиваем группы. Дубли не удаляем.

Отчёт: сколько групп появилось, сколько записей объединено,
сколько объявлений в самой большой группе.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from db_pg import connect
from dedupe import cluster_records
from employer_dedupe import (
    cluster_by_employer,
    employer_inn_key,
    pending_name_matches,
    pick_primary,
)


def _load_rows() -> list[dict[str, Any]]:
    sql = """
        SELECT
            v.id,
            v.signature,
            v.description,
            v."rawText" AS "rawText",
            v."workFormat" AS "workFormat",
            v."citySlug" AS "citySlug",
            v."publishedAt" AS "publishedAt",
            v."firstSeenAt" AS "firstSeenAt",
            v.completeness,
            v.source,
            v."contactPhone" AS "contactPhone",
            v."sourcePostExternalId" AS "sourcePostExternalId",
            v."groupId" AS "groupId",
            v."employerInn" AS "employerInn",
            v."professionSlug" AS "professionSlug",
            v."salaryFrom" AS "salaryFrom",
            v."salaryIsGross" AS "salaryIsGross",
            e.name AS "employerName"
        FROM "Vacancy" v
        LEFT JOIN "Employer" e ON e.id = v."employerId"
        WHERE v."isActive" = true
          AND v."publishedAt" >= NOW() - INTERVAL '60 days'
        ORDER BY v."firstSeenAt" ASC
    """
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = list(cur.fetchall())
    for row in rows:
        row["text"] = row.get("description") or row.get("rawText") or ""
    return rows


def _pick_primary(members: list[dict[str, Any]]) -> dict[str, Any]:
    return pick_primary(members)


def _upsert_group(cur: Any, members: list[dict[str, Any]], signature: str) -> tuple[str, int, int]:
    """Пишет группу и вешает groupId. Возвращает (group_id, сколько новых членов, создана ли группа)."""
    if len(members) < 2:
        return "", 0, 0
    primary = _pick_primary(members)
    sources = {item["source"] for item in members}
    phones = {item.get("contactPhone") for item in members if item.get("contactPhone")}
    first_seen = min(item["firstSeenAt"] for item in members)
    last_seen = max(item.get("publishedAt") or item["firstSeenAt"] for item in members)
    ids = [item["id"] for item in members]

    cur.execute('SELECT id FROM "VacancyGroup" WHERE signature = %s', (signature,))
    existing = cur.fetchone()
    if not existing:
        # Уже общая группа у всех членов — не плодим вторую с другим signature.
        group_ids = {item.get("groupId") for item in members if item.get("groupId")}
        if len(group_ids) == 1:
            existing = {"id": next(iter(group_ids))}
    created = 0
    if existing:
        group_id = existing["id"] if isinstance(existing, dict) else existing["id"]
        cur.execute(
            """
            UPDATE "VacancyGroup"
            SET "primaryVacancyId" = %s,
                "postingsCount" = %s,
                "sourcesCount" = %s,
                "distinctPhonesCount" = %s,
                "lastSeenAt" = %s
            WHERE id = %s
            """,
            (
                primary["id"],
                len(members),
                len(sources),
                len(phones),
                last_seen,
                group_id,
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO "VacancyGroup"
                (id, signature, "primaryVacancyId", "postingsCount", "sourcesCount",
                 "distinctPhonesCount", "firstSeenAt", "lastSeenAt")
            VALUES (concat('g', substr(md5(random()::text), 1, 24)),
                    %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                signature,
                primary["id"],
                len(members),
                len(sources),
                len(phones),
                first_seen,
                last_seen,
            ),
        )
        group_id = cur.fetchone()["id"]
        created = 1

    cur.execute(
        'SELECT COUNT(*) AS n FROM "Vacancy" WHERE id = ANY(%s) AND ("groupId" IS NULL OR "groupId" <> %s)',
        (ids, group_id),
    )
    merged = int(cur.fetchone()["n"])
    cur.execute(
        'UPDATE "Vacancy" SET "groupId" = %s WHERE id = ANY(%s)',
        (group_id, ids),
    )
    for item in members:
        item["groupId"] = group_id
    return group_id, merged, created


def regroup() -> dict[str, int]:
    rows = _load_rows()
    if not rows:
        print("Нет вакансий за 60 дней.")
        return {"groupsCreated": 0, "merged": 0, "largest": 0, "employerMerged": 0, "pendingName": 0}

    clusters = cluster_records(rows)
    created = 0
    merged = 0
    largest = max((len(group) for group in clusters), default=0)
    employer_merged = 0
    pending: list[dict[str, Any]] = []

    logs = Path(__file__).resolve().parent.parent / "logs"
    logs.mkdir(parents=True, exist_ok=True)

    with connect() as conn:
        with conn.cursor() as cur:
            for indexes in clusters:
                if len(indexes) < 2:
                    continue
                members = [rows[i] for i in indexes]
                posts = {str(item.get("sourcePostExternalId") or "") for item in members}
                if len(posts) == 1:
                    continue
                signature = _pick_primary(members)["signature"]
                _, added, new_group = _upsert_group(cur, members, signature)
                merged += added
                created += new_group

            rows = _load_rows()
            for indexes in cluster_by_employer(rows):
                members = [rows[i] for i in indexes]
                key = employer_inn_key(
                    members[0].get("employerInn"),
                    members[0].get("professionSlug"),
                    members[0].get("citySlug"),
                    members[0].get("workFormat"),
                )
                if not key:
                    continue
                _, added, new_group = _upsert_group(cur, members, key)
                employer_merged += added
                created += new_group

            pending = pending_name_matches(rows)
            if pending:
                pending_path = logs / "dedupe_pending.jsonl"
                with pending_path.open("a", encoding="utf-8") as handle:
                    for item in pending:
                        handle.write(
                            json.dumps(
                                {
                                    "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                                    "reason": item["reason"],
                                    "key": item["key"],
                                    "ids": item["ids"],
                                },
                                ensure_ascii=False,
                            )
                            + "\n"
                        )
        conn.commit()

    return {
        "groupsCreated": created,
        "merged": merged,
        "largest": largest,
        "employerMerged": employer_merged,
        "pendingName": len(pending),
    }


def main() -> int:
    report = regroup()
    print(
        f"групп появилось: {report['groupsCreated']}; "
        f"записей объединено: {report['merged']}; "
        f"в самой большой группе: {report['largest']}; "
        f"склеено по ИНН: {report.get('employerMerged', 0)}; "
        f"имён на подтверждение: {report.get('pendingName', 0)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
