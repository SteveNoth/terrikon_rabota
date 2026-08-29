"use client";

import { buttonVariants } from "@/components/ui/button-variants";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/format/cn";
import { useState, type MouseEvent } from "react";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const telegramShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      event.preventDefault();
      try {
        await navigator.share({ title, url });
      } catch {
        /* человек закрыл меню — это не ошибка */
      }
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      event.preventDefault();
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  }

  return (
    <a
      href={telegramShare}
      onClick={onClick}
      className={cn(buttonVariants({ variant: "outline" }))}
    >
      <Icon name="share" size="sm" decorative />
      {copied ? "Ссылка скопирована" : "Поделиться"}
    </a>
  );
}
