"use client";

import { Button } from "@/components/ui/button";
import { enqueueFavoriteToggle, flushQueue } from "@/lib/offline/queue";
import { toOfflineVacancy } from "@/lib/offline/vacancy";
import { isFavorite } from "@/lib/offline/db";
import { useOnline } from "@/lib/offline/use-online";
import type { OfflineVacancy } from "@/lib/offline/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import { useEffect, useState } from "react";

export function FavoriteButton({
  vacancyId,
  title,
  href,
  snapshot,
}: {
  vacancyId: string;
  title: string;
  href?: string;
  snapshot?: VacancyListItem | OfflineVacancy | null;
}) {
  const online = useOnline();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isFavorite(vacancyId).then((value) => {
      if (!cancelled) {
        setSaved(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [vacancyId]);

  async function toggle() {
    const next = !saved;
    setSaved(next);
    const vacancy =
      snapshot && "salaryText" in snapshot
        ? snapshot
        : snapshot
          ? toOfflineVacancy(snapshot)
          : null;

    await enqueueFavoriteToggle({
      vacancyId,
      title,
      href,
      add: next,
      vacancy,
    });

    if (online) {
      void flushQueue();
    }
  }

  return (
    <Button type="button" variant={saved ? "accent" : "outline"} onClick={() => void toggle()} aria-pressed={saved}>
      {saved ? "В избранном" : "В избранное"}
    </Button>
  );
}
