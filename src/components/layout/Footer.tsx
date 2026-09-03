import Link from "next/link";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { Icon } from "@/components/ui/icon";
import { Divider } from "@/components/ui/divider";
import { AccountLinks } from "@/components/auth/AccountLinks";
import { CitySelect } from "@/components/layout/CitySelect";
import { LayoutSlot } from "@/components/layout/LayoutSlot";
import { QualitySwitcher } from "@/components/quality/QualitySwitcher";
import { SupportFooterLink } from "@/components/support/SupportFooterLink";
import { TELEGRAM_CHANNEL_URL, telegramChannelTitle } from "@/lib/site";
import type { AuthUser } from "@/lib/adapters/auth";
import type { CityOption } from "@/lib/geo";

export function Footer({
  citySlug,
  activeCities,
  soonCities,
  user,
}: {
  citySlug: string;
  activeCities: CityOption[];
  soonCities: CityOption[];
  user: AuthUser | null;
}) {
  return (
    <footer className="mt-8 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-container flex-col gap-4 px-4 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <BrandLockup href={`/${citySlug}`} />
          <div className="max-w-xs min-w-0">
            <CitySelect
              id="tr-city-footer"
              currentSlug={citySlug}
              activeCities={activeCities}
              soonCities={soonCities}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AccountLinks citySlug={citySlug} user={user} compact />
          </div>
        </div>
        <Divider />
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link
            href={`/${citySlug}/map`}
            prefetch={false}
            className="text-brand underline-offset-2 hover:underline"
          >
            Карта вакансий
          </Link>
          <Link href="/about" className="text-brand underline-offset-2 hover:underline">
            О проекте
          </Link>
          <Link href="/help" className="text-brand underline-offset-2 hover:underline">
            Помощь
          </Link>
          <Link href="/contacts" className="text-brand underline-offset-2 hover:underline">
            Контакты
          </Link>
          <Link href="/terms" className="text-brand underline-offset-2 hover:underline">
            Правила
          </Link>
          <Link href="/safety" className="text-brand underline-offset-2 hover:underline">
            Как не попасться при поиске работы
          </Link>
          <Link href="/offline" className="text-brand underline-offset-2 hover:underline">
            Без интернета
          </Link>
          <a
            href={TELEGRAM_CHANNEL_URL}
            className="inline-flex items-center gap-2 text-brand underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="telegram" size="sm" decorative />
            {telegramChannelTitle()}
          </a>
        </div>
        <LayoutSlot>
          <SupportFooterLink />
        </LayoutSlot>
        <div className="max-w-md min-w-0">
          <QualitySwitcher id="tr-quality-footer" />
        </div>
        <p className="text-sm">
          <a href="?mode=ultra" className="text-brand underline-offset-2 hover:underline">
            Экономная версия
          </a>
          <span className="text-muted"> — без картинок и скриптов, открывается на 2G</span>
        </p>
        <p className="text-sm">
          <Link href="/about/lite" className="text-brand underline-offset-2 hover:underline">
            Почему наш сайт работает там, где другие нет
          </Link>
        </p>
        <p className="text-sm text-muted">Региональный агрегатор вакансий</p>
      </div>
    </footer>
  );
}
