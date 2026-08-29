"use client";

import { useEffect } from "react";
import { putDicts, putSearch, putVacancies, setLastUpdated } from "@/lib/offline/db";
import { toOfflineVacancy } from "@/lib/offline/vacancy";
import type { OfflineDictsPayload, OfflineSearch, OfflineVacancy } from "@/lib/offline/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";

export function OfflineCapture({
  vacancies,
  records,
  search,
  dicts,
}: {
  vacancies?: VacancyListItem[];
  records?: OfflineVacancy[];
  search?: Omit<OfflineSearch, "savedAt" | "titles"> & { titles?: string[] };
  dicts?: OfflineDictsPayload;
}) {
  const vacancyKey = [
    ...(vacancies ?? []).map((item) => item.id),
    ...(records ?? []).map((item) => item.id),
  ].join(",");
  const searchKey = search ? `${search.id}:${search.href}` : "";
  const dictKey = dicts
    ? `${dicts.cities?.length ?? 0}:${dicts.spheres?.length ?? 0}:${dicts.professions?.length ?? 0}`
    : "";

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return;
    }

    let cancelled = false;

    async function save() {
      const fromList = (vacancies ?? []).map((item) => toOfflineVacancy(item));
      const all = [...(records ?? []), ...fromList];
      if (all.length > 0) {
        await putVacancies(all);
      }
      if (search) {
        await putSearch({
          ...search,
          titles: search.titles ?? (vacancies ?? []).map((item) => item.title).slice(0, 8),
        });
      }
      if (dicts) {
        await putDicts(dicts);
      }
      if (all.length > 0 || search || dicts) {
        await setLastUpdated();
      }
    }

    void save().catch((cause) => {
      if (!cancelled) {
        console.error("[offline] не удалось сохранить", cause);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [vacancyKey, searchKey, dictKey, vacancies, records, search, dicts]);

  return null;
}
