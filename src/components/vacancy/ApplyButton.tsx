"use client";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { enqueueApply, flushQueue, hasPendingApply, hasSentApply } from "@/lib/offline/queue";
import { OFFLINE_EVENT, type OfflineEventDetail } from "@/lib/offline/types";
import { useOnline } from "@/lib/offline/use-online";
import Link from "next/link";
import { useEffect, useState } from "react";

type ApplyState = "idle" | "queued" | "sent";

export function ApplyButton({
  href,
  vacancyId,
  title,
}: {
  href: string;
  vacancyId: string;
  title: string;
}) {
  const online = useOnline();
  const [state, setState] = useState<ApplyState>("idle");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([hasSentApply(vacancyId), hasPendingApply(vacancyId)]).then(([sent, pending]) => {
      if (cancelled) {
        return;
      }
      if (sent) {
        setState("sent");
      } else if (pending) {
        setState("queued");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [vacancyId, online]);

  useEffect(() => {
    function onEvent(event: Event) {
      const detail = (event as CustomEvent<OfflineEventDetail>).detail;
      if (detail?.kind === "apply-sent" && detail.vacancyId === vacancyId) {
        setState("sent");
      }
    }
    window.addEventListener(OFFLINE_EVENT, onEvent);
    return () => window.removeEventListener(OFFLINE_EVENT, onEvent);
  }, [vacancyId]);

  async function queueApply() {
    await enqueueApply({ vacancyId, title, href });
    setState("queued");
    if (navigator.onLine) {
      void flushQueue();
    }
  }

  if (state === "sent") {
    return (
      <Button type="button" variant="primary" disabled>
        Отклик отправлен
      </Button>
    );
  }

  if (!online || state === "queued") {
    return (
      <Button type="button" variant="primary" onClick={() => void queueApply()} disabled={state === "queued"}>
        {state === "queued" ? "Отклик отправится, как появится интернет" : "Откликнуться"}
      </Button>
    );
  }

  return (
    <Link href={href} className={cn(buttonVariants({ variant: "primary" }))}>
      Откликнуться
    </Link>
  );
}
