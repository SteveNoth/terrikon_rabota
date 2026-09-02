"use client";

import { ErrorScreen } from "@/components/feedback/ErrorScreen";
import { getDefaultCity } from "@/lib/geo";

export default function CityError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorScreen
      title="Не получилось открыть страницу"
      description="Это не ваша вина. Можно вернуться на главную города и продолжить с того же места."
      homeHref={`/${getDefaultCity().slug}`}
      onRetry={reset}
    />
  );
}
