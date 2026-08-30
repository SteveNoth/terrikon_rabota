"""Ночная нечёткая группировка дублей (раздел 11.17).

Не в /api/parser/upload: у Vercel 10 секунд, у GitHub Actions — бесплатные минуты.

Берём активные вакансии за 60 дней, режем на корзины по signature,
считаем шинглы и Жаккар, склеиваем группы. Дубли не удаляем.

Отчёт: сколько групп появилось, сколько записей объединено,
сколько объявлений в самой большой группе.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from db_pg import connect
from dedupe import cluster_records


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
            v."groupId" AS "groupId"
        FROM "Vacancy" v
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
    return sorted(
        members,
        key=lambda item: (-int(item.get("completeness") or 0), item.get("firstSeenAt") or datetime.now(timezone.utc)),
    )[0]


def regroup() -> dict[str, int]:
    rows = _load_rows()
    if not rows:
        print("Нет вакансий за 60 дней.")
        return {"groupsCreated": 0, "merged": 0, "largest": 0}

    clusters = cluster_records(rows)
    created = 0
    merged = 0
    largest = max((len(group) for group in clusters), default=0)

    with connect() as conn:
        with conn.cursor() as cur:
            for indexes in clusters:
                if len(indexes) < 2:
                    continue
                members = [rows[i] for i in indexes]
                posts = {str(item.get("sourcePostExternalId") or "") for item in members}
                if len(posts) == 1:
                    continue
                primary = _pick_primary(members)
                sources = {item["source"] for item in members}
                phones = {item.get("contactPhone") for item in members if item.get("contactPhone")}
                first_seen = min(item["firstSeenAt"] for item in members)
                last_seen = max(item.get("publishedAt") or item["firstSeenAt"] for item in members)
                signature = primary["signature"]
                ids = [item["id"] for item in members]

                cur.execute(
                    'SELECT id FROM "VacancyGroup" WHERE signature = %s',
                    (signature,),
                )
                existing = cur.fetchone()
                if existing:
                    group_id = existing["id"]
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
                    created += 1

                cur.execute(
                    'SELECT COUNT(*) AS n FROM "Vacancy" WHERE id = ANY(%s) AND ("groupId" IS NULL OR "groupId" <> %s)',
                    (ids, group_id),
                )
                merged += int(cur.fetchone()["n"])
                cur.execute(
                    'UPDATE "Vacancy" SET "groupId" = %s WHERE id = ANY(%s)',
                    (group_id, ids),
                )
        conn.commit()

    return {"groupsCreated": created, "merged": merged, "largest": largest}


def main() -> int:
    report = regroup()
    print(
        f"групп появилось: {report['groupsCreated']}; "
        f"записей объединено: {report['merged']}; "
        f"в самой большой группе: {report['largest']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
