"use client";

import { useState, type FormEvent } from "react";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { APPLY_MESSAGE_MAX_CHARS } from "@/lib/seeker/constants";
import { enqueueApply, flushQueue } from "@/lib/offline/queue";
import { useOnline } from "@/lib/offline/use-online";
import { applyAction } from "@/app/profile/actions";
import { Alert } from "@/components/ui/alert";

export function ApplyForm({
  vacancyId,
  title,
  href,
  defaultMessage,
}: {
  vacancyId: string;
  title: string;
  href: string;
  defaultMessage: string;
}) {
  const online = useOnline();
  const [queued, setQueued] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (online) {
      return;
    }
    event.preventDefault();
    const form = event.currentTarget;
    const message = String(new FormData(form).get("message") || "");
    await enqueueApply({ vacancyId, title, href, message });
    setQueued(true);
    if (navigator.onLine) {
      void flushQueue();
    }
  }

  if (queued) {
    return (
      <Alert tone="info">Отклик отправится, как появится интернет. Повторно нажимать не нужно — уйдёт один раз.</Alert>
    );
  }

  return (
    <form action={applyAction} onSubmit={(event) => void onSubmit(event)} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="vacancyId" value={vacancyId} />
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="apply-message">Сообщение работодателю</Label>
        <textarea
          id="apply-message"
          name="message"
          rows={8}
          maxLength={APPLY_MESSAGE_MAX_CHARS}
          defaultValue={defaultMessage}
          className={FIELD_CLASS}
        />
        <p className="text-sm text-muted">
          Подставили текст из резюме. Можно поправить. Без сети отклик встанет в очередь и уйдёт сам.
        </p>
      </div>
      <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
        {online ? "Отправить отклик" : "Поставить в очередь"}
      </button>
    </form>
  );
}
