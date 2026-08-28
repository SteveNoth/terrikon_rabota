"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyCityOpen } from "@/components/geo/notify-city-open";

export function NotifyOpenForm({
  citySlug,
  notified = false,
}: {
  citySlug: string;
  notified?: boolean;
}) {
  const [done, setDone] = useState(notified);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const contact = String(new FormData(form).get("contact") ?? "").trim();
    console.log("[notify-city-open]", { city: citySlug, contact });
    event.preventDefault();
    setDone(true);
  }

  if (done) {
    return (
      <p className="text-md text-muted" role="status">
        Записали. Сообщим, когда город откроется.
      </p>
    );
  }

  return (
    <form action={notifyCityOpen} onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3">
      <input type="hidden" name="city" value={citySlug} />
      <Label htmlFor={`notify-contact-${citySlug}`}>Почта или телефон</Label>
      <Input
        id={`notify-contact-${citySlug}`}
        name="contact"
        type="text"
        required
        autoComplete="email"
        placeholder="Куда написать, когда откроемся"
      />
      <Button type="submit" variant="primary">
        Сообщить, когда откроется
      </Button>
    </form>
  );
}
