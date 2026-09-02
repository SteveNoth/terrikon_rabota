"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ServiceWorkerRegistrar() {
  const pathname = usePathname();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (pathname.startsWith("/dev") || pathname.startsWith("/admin") || pathname.startsWith("/auth") || pathname.startsWith("/employer") || pathname.startsWith("/profile")) {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    function watch(reg: ServiceWorkerRegistration) {
      if (reg.waiting && navigator.serviceWorker.controller) {
        setUpdateReady(true);
      }
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) {
          return;
        }
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }
        });
      });
    }

    void navigator.serviceWorker.register("/sw.js").then((reg) => {
      if (cancelled) {
        return;
      }
      registration = reg;
      watch(reg);
      void reg.update();
    });

    function onVisible() {
      if (document.visibilityState === "visible") {
        void registration?.update();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  if (!updateReady) {
    return null;
  }

  async function updateApp() {
    const reg = await navigator.serviceWorker.getRegistration();
    const waiting = reg?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    const reload = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    waiting.postMessage("SKIP_WAITING");
  }

  return (
    <Alert tone="info" className="rounded-none border-x-0 border-t-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p>Доступна новая версия сайта. Обновите, чтобы не остаться на старой.</p>
        <Button type="button" variant="primary" size="sm" onClick={() => void updateApp()}>
          Обновить приложение
        </Button>
      </div>
    </Alert>
  );
}
