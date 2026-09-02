"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { listFavorites, putFavoriteRecord, removeFavorite } from "@/lib/offline/db";
import type { OfflineVacancy } from "@/lib/offline/types";

type SyncItem = {
  vacancyId: string;
  snapshot: OfflineVacancy | null;
};

/**
 * Избранное без входа живёт в IndexedDB. После входа переносим в аккаунт,
 * иначе заставлять регистрироваться ради закладки — потерять пользователя.
 *
 * Флаг в sessionStorage не ставим: человек может выйти, добавить закладки гостем
 * и войти снова в той же вкладке — они тоже должны уехать в аккаунт.
 * Layout кабинета монтируется один раз на визит, повторный POST при клиентской
 * навигации между «Данные / Отклики / Избранное» не случится.
 */
export function FavoriteMigrator() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function migrate() {
      const local = await listFavorites();
      const response = await fetch("/api/favorites/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          items: local.map((item) => ({ vacancyId: item.vacancyId, addedAt: item.addedAt })),
        }),
      });
      if (!response.ok || cancelled) {
        return;
      }
      const body = (await response.json()) as { items?: SyncItem[] };
      const items = body.items ?? [];
      const keep = new Set(items.map((item) => item.vacancyId));

      for (const item of items) {
        await putFavoriteRecord(item.vacancyId, item.snapshot);
      }
      for (const localItem of local) {
        if (!keep.has(localItem.vacancyId)) {
          await removeFavorite(localItem.vacancyId);
        }
      }
      if (!cancelled && local.length > 0) {
        router.refresh();
      }
    }

    void migrate();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
