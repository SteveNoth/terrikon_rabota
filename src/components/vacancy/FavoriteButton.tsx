"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

const STORAGE_KEY = "tr_favorites";

function readIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function FavoriteButton({ vacancyId }: { vacancyId: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(readIds().includes(vacancyId));
  }, [vacancyId]);

  function toggle() {
    const ids = readIds();
    const next = ids.includes(vacancyId)
      ? ids.filter((item) => item !== vacancyId)
      : [...ids, vacancyId];
    writeIds(next);
    setSaved(next.includes(vacancyId));
  }

  return (
    <Button type="button" variant={saved ? "accent" : "outline"} onClick={toggle} aria-pressed={saved}>
      {saved ? "В избранном" : "В избранное"}
    </Button>
  );
}
