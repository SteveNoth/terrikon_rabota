"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getLastUpdated } from "@/lib/offline/db";
import { flushQueue } from "@/lib/offline/queue";
import { OFFLINE_EVENT, type OfflineEventDetail } from "@/lib/offline/types";
import { useOnline } from "@/lib/offline/use-online";
import { formatTimeShort } from "@/lib/format/date";

type Toast = { text: string; tone: "success" | "info" } | null;

export function OfflineBanner() {
  const online = useOnline();
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [wasOffline, setWasOffline] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    void getLastUpdated().then(setLastUpdated);
  }, [online]);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      return;
    }
    void flushQueue();
  }, [online]);

  useEffect(() => {
    if (!online || !wasOffline) {
      return;
    }
    setToast({ text: "Вы снова в сети", tone: "info" });
    const hide = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(hide);
  }, [online, wasOffline]);

  useEffect(() => {
    function onOfflineEvent(event: Event) {
      const detail = (event as CustomEvent<OfflineEventDetail>).detail;
      if (!detail) {
        return;
      }
      if (detail.kind === "apply-sent") {
        setToast({ text: "Отклик отправлен", tone: "success" });
      }
      if (detail.kind === "apply-queued") {
        setToast({
          text: "Отклик в очереди. Уйдёт один раз, когда появится интернет.",
          tone: "info",
        });
      }
      if (detail.kind === "apply-need-login") {
        setToast({ text: "Чтобы отклик дошёл, войдите в аккаунт", tone: "info" });
      }
      if (detail.kind === "favorite-queued") {
        setToast({
          text: "Избранное сохранили на этом устройстве. Когда будет сеть, отправим.",
          tone: "info",
        });
      }
    }
    window.addEventListener(OFFLINE_EVENT, onOfflineEvent);
    return () => window.removeEventListener(OFFLINE_EVENT, onOfflineEvent);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const hide = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(hide);
  }, [toast]);

  if (!online) {
    const stamp = lastUpdated ? formatTimeShort(new Date(lastUpdated)) : null;
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Alert tone="warning" data-offline-banner role="status" aria-live="polite">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <p>
              {stamp
                ? `Нет сети. Показываем сохранённые вакансии от ${stamp}`
                : "Нет сети. Показываем сохранённые вакансии"}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
              Обновить
            </Button>
          </div>
        </Alert>
        {toast ? (
          <Alert tone={toast.tone === "success" ? "success" : "info"} role="status" aria-live="polite">
            <p>{toast.text}</p>
          </Alert>
        ) : null}
      </div>
    );
  }

  if (!toast) {
    return <div hidden data-offline-banner role="status" aria-live="polite" />;
  }

  return (
    <Alert tone={toast.tone === "success" ? "success" : "info"} data-offline-banner role="status" aria-live="polite">
      <p>{toast.text}</p>
    </Alert>
  );
}
