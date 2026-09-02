import { ErrorScreen } from "@/components/feedback/ErrorScreen";
import { getDefaultCity } from "@/lib/geo";

export default function MissingPage({ homeHref }: { homeHref?: string }) {
  const href = homeHref ?? `/${getDefaultCity().slug}`;
  return (
    <ErrorScreen
      title="Страница не найдена"
      description="Такого адреса нет. Можно вернуться на главную и продолжить поиск работы."
      homeHref={href}
    />
  );
}
