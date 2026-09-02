"use client";

import { useEffect } from "react";

/**
 * Горячие клавиши очереди. Поля ввода не перехватываем.
 * P опубликовать · T доверять · F мошенничество · N не вакансия · G всю группу
 */
export function QueueHotkeys() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      const map: Record<string, string> = {
        p: "queue-publish",
        t: "queue-trust",
        f: "queue-fraud",
        n: "queue-not-vacancy",
        g: "queue-group",
        d: "queue-duplicate-of",
      };
      const id = map[event.key.toLowerCase()];
      if (!id) {
        return;
      }
      event.preventDefault();
      if (id === "queue-duplicate-of") {
        document.getElementById(id)?.focus();
        return;
      }
      (document.getElementById(id) as HTMLButtonElement | null)?.click();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

/**
 * Очередь кабинета: P опубликовать · T доверять контакту · V проверить компанию
 * R отклонить · B запрещённый текст · U отключить публикацию · E вернуть на проверку
 */
export function CabinetQueueHotkeys() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      const map: Record<string, string> = {
        p: "cabinet-publish",
        t: "cabinet-trust",
        v: "cabinet-verify",
        r: "cabinet-reject",
        b: "cabinet-forbidden",
        u: "cabinet-disable-publish",
        e: "cabinet-restore",
      };
      const id = map[event.key.toLowerCase()];
      if (!id) {
        return;
      }
      event.preventDefault();
      (document.getElementById(id) as HTMLButtonElement | null)?.click();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

export function PostsHotkeys() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      const map: Record<string, string> = {
        y: "post-approve",
        n: "post-reject",
        s: "post-stop",
      };
      const id = map[event.key.toLowerCase()];
      if (!id) {
        return;
      }
      event.preventDefault();
      if (id === "post-stop") {
        document.getElementById("post-stop-word")?.focus();
        return;
      }
      (document.getElementById(id) as HTMLButtonElement | null)?.click();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
