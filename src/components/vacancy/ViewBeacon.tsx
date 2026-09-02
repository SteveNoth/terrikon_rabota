"use client";

import { useEffect } from "react";

/** Full и Lite: просмотр уходит в фоне, страница его не ждёт. */
export function ViewBeacon({ vacancyId }: { vacancyId: string }) {
  useEffect(() => {
    const body = JSON.stringify({ type: "VACANCY_VIEW", vacancyId });
    const blob = new Blob([body], { type: "application/json" });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/events", blob);
      return;
    }
    void fetch("/api/events", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  }, [vacancyId]);

  return null;
}
