"use client";

import { ErrorScreen } from "@/components/feedback/ErrorScreen";
import { getDefaultCity } from "@/lib/geo";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorScreen
      title="Не получилось открыть страницу"
      description="Это не ваша вина. Данные на месте — сбой на нашей стороне. Можно вернуться и открыть страницу ещё раз."
      homeHref={`/${getDefaultCity().slug}`}
      onRetry={reset}
    />
  );
}
