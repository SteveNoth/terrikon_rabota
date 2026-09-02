"use client";

import { ErrorScreen } from "@/components/feedback/ErrorScreen";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorScreen
      title="Админка не открылась"
      description="Ошибка на нашей стороне. Можно вернуться к обзору или попробовать снова."
      homeHref="/admin"
      onRetry={reset}
    />
  );
}
