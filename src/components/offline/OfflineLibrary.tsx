"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { getLastUpdated, listFavorites, listSavedVacancies, listSearches, listQueue } from "@/lib/offline/db";
import { formatTimeShort } from "@/lib/format/date";
import { cityName, isCitySlug } from "@/lib/geo";
import type { OfflineFavorite, OfflineSearch, OfflineVacancy, QueuedAction } from "@/lib/offline/types";
import Link from "next/link";
import { useEffect, useState } from "react";

function cityLabel(slug: string): string {
  return isCitySlug(slug) ? cityName(slug, "nom") : slug;
}

export function OfflineLibrary() {
  const [vacancies, setVacancies] = useState<OfflineVacancy[] | null>(null);
  const [favorites, setFavorites] = useState<OfflineFavorite[]>([]);
  const [searches, setSearches] = useState<OfflineSearch[]>([]);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listSavedVacancies(),
      listFavorites(),
      listSearches(),
      listQueue(),
      getLastUpdated(),
    ]).then(([saved, favs, queries, actions, updated]) => {
      if (cancelled) {
        return;
      }
      setVacancies(saved);
      setFavorites(favs);
      setSearches(queries);
      setQueue(actions.filter((item) => item.status !== "sent"));
      setLastUpdated(updated);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (vacancies === null) {
    return <p className="text-md text-muted">Загружаем сохранённое…</p>;
  }

  const stamp = lastUpdated ? formatTimeShort(new Date(lastUpdated)) : null;
  const pendingApply = queue.filter((item) => item.type === "apply");

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <p className="max-w-xl text-md text-muted">
        {stamp
          ? `Последнее обновление сохранённых вакансий: ${stamp}.`
          : "Пока ничего не сохранено: откройте список или карточку при живой сети — они останутся здесь."}
      </p>

      <section id="vacancies" className="flex min-w-0 flex-col gap-3">
        <h2 className="font-display text-xl font-medium">Сохранённые вакансии</h2>
        {vacancies.length === 0 ? (
          <EmptyState
            icon="search"
            title="Ещё нет сохранённых вакансий"
            description="Откройте главную или список, пока есть интернет. Сюда попадут последние 100 карточек."
          />
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {vacancies.map((item) => (
              <li key={item.id} className="min-w-0">
                <Link href={item.href} className="text-brand underline-offset-2 hover:underline">
                  {item.title}
                </Link>
                <p className="text-sm text-muted">
                  {cityLabel(item.citySlug)}
                  {item.salaryText ? ` · ${item.salaryText}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="favorites" className="flex min-w-0 flex-col gap-3">
        <h2 className="font-display text-xl font-medium">Избранное</h2>
        {favorites.length === 0 ? (
          <p className="text-md text-muted">Нажмите «В избранное» на карточке — объявление останется и без сети.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {favorites.map((item) => {
              const vacancy = item.vacancy;
              return (
                <li key={item.vacancyId} className="min-w-0">
                  {vacancy ? (
                    <>
                      <Link href={vacancy.href} className="text-brand underline-offset-2 hover:underline">
                        {vacancy.title}
                      </Link>
                      <p className="text-sm text-muted">{vacancy.salaryText}</p>
                    </>
                  ) : (
                    <span className="text-muted">Сохранённый номер объявления</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="searches" className="flex min-w-0 flex-col gap-3">
        <h2 className="font-display text-xl font-medium">Последние поиски</h2>
        {searches.length === 0 ? (
          <p className="text-md text-muted">Поиски с фильтрами запоминаем — до пяти последних.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {searches.map((item) => (
              <li key={item.id} className="min-w-0">
                <Link href={item.href} className="text-brand underline-offset-2 hover:underline">
                  {item.query || "Подборка с фильтрами"}
                </Link>
                <p className="text-sm text-muted">
                  {cityLabel(item.citySlug)}
                  {item.titles.length > 0 ? ` · ${item.titles.slice(0, 3).join(", ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingApply.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Ждёт отправки</h2>
          <ul className="flex min-w-0 flex-col gap-2">
            {pendingApply.map((item) => (
              <li key={item.id} className="min-w-0 text-md">
                Отклик: {item.title}
                <span className="text-muted"> — уйдёт, как появится интернет</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
