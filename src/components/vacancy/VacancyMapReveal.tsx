"use client";

import { buttonVariants } from "@/components/ui/button-variants";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/format/cn";
import { useState } from "react";

export function VacancyMapReveal({
  mode,
  address,
  previewUrl,
  navigatorHref,
}: {
  mode: "interactive" | "static";
  address: string | null;
  previewUrl: string | null;
  navigatorHref: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className={cn(buttonVariants({ variant: "outline" }))}
        onClick={() => setOpen(true)}
      >
        <Icon name="map" size="sm" decorative />
        Показать на карте
      </button>
    );
  }

  if (mode === "static" && previewUrl) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {/* Картинка появляется только после клика — в первую загрузку её нет. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={address ? `Схема проезда: ${address}` : "Схема проезда"}
          className="h-auto w-full max-w-full rounded-md border border-border"
        />
        {navigatorHref ? (
          <a href={navigatorHref} className="text-brand underline-offset-2 hover:underline">
            Открыть в навигаторе
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {address ? <p className="min-w-0 break-words">{address}</p> : null}
      {navigatorHref ? (
        <a href={navigatorHref} className="text-brand underline-offset-2 hover:underline">
          Открыть в навигаторе
        </a>
      ) : null}
    </div>
  );
}
