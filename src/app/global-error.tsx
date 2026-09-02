"use client";

import { ErrorScreen } from "@/components/feedback/ErrorScreen";
import { getDefaultCity } from "@/lib/geo";
import "@/styles/globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru" data-mode="lite" data-theme="light">
      <body>
        <ErrorScreen
          title="Не получилось открыть страницу"
          description="Сайт споткнулся целиком. Это не «Application error» из шаблона — можно вернуться на главную и попробовать снова."
          homeHref={`/${getDefaultCity().slug}`}
          onRetry={reset}
        />
      </body>
    </html>
  );
}
