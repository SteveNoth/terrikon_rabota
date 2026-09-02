"use client";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { enqueueApply, flushQueue, hasPendingApply, hasSentApply } from "@/lib/offline/queue";
import { OFFLINE_EVENT, type OfflineEventDetail } from "@/lib/offline/types";
import { useOnline } from "@/lib/offline/use-online";
import { appliedAgoLabel } from "@/lib/seeker/labels";
import Link from "next/link";
import { useEffect, useState } from "react";

type ApplyState = "idle" | "queued" | "sent";

export function ApplyButton({
  href,
  vacancyId,
  title,
  signedIn,
  appliedAt,
  blocked,
  blockedMessage,
  closed,
}: {
  href: string;
  vacancyId: string;
  title: string;
  signedIn: boolean;
  appliedAt?: Date | string | null;
  blocked?: boolean;
  blockedMessage?: string;
  closed?: boolean;
}) {
  const online = useOnline();
  const [state, setState] = useState<ApplyState>(appliedAt ? "sent" : "idle");

  useEffect(() => {
    if (appliedAt) {
      setState("sent");
      return;
    }
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
  }, [vacancyId, online, appliedAt]);

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

  if (closed) {
    return null;
  }

  if (blocked) {
    return <p className="text-md text-muted">{blockedMessage}</p>;
  }

  if (appliedAt) {
    return (
      <p className="text-md text-muted" role="status">
        {appliedAgoLabel(appliedAt)}
      </p>
    );
  }

  if (state === "sent") {
    return (
      <Button type="button" variant="primary" disabled>
        Отклик отправлен
      </Button>
    );
  }

  if (!online) {
    if (!signedIn) {
      return (
        <p className="text-md text-muted">
          Нет сети. Сохраните вакансию в избранное — отклик отправим после входа, когда появится интернет.
        </p>
      );
    }
    return (
      <Button type="button" variant="primary" onClick={() => void queueApply()} disabled={state === "queued"}>
        {state === "queued" ? "Отклик отправится, как появится интернет" : "Откликнуться"}
      </Button>
    );
  }

  if (state === "queued") {
    return (
      <Button type="button" variant="primary" disabled>
        Отклик отправится, как появится интернет
      </Button>
    );
  }

  return (
    <Link href={href} className={cn(buttonVariants({ variant: "primary" }))}>
      Откликнуться
    </Link>
  );
}
