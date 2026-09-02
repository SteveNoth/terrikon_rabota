import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import Link from "next/link";

export function VahtaWarning() {
  return (
    <Alert tone="warning" className="flex min-w-0 flex-col gap-2">
      <p className="flex min-w-0 items-center gap-2 font-medium">
        <Icon name="warning" size="sm" decorative />
        Вахта — это работа не здесь
      </p>
      <p className="text-sm">
        Набор идёт из нашего города, а объект может быть за тысячи километров. Не платите за
        трудоустройство, не отдавайте паспорт и не оформляйте на себя чужие карты. Подробнее —{" "}
        <Link href="/safety" className="text-brand underline-offset-2 hover:underline">
          как не попасться при поиске работы
        </Link>
        .
      </p>
    </Alert>
  );
}
