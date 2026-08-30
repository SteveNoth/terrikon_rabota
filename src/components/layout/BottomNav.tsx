"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { LayoutSlot } from "@/components/layout/LayoutSlot";
import { QualitySwitcher } from "@/components/quality/QualitySwitcher";
import { cn } from "@/lib/format/cn";

type NavItem = {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
};

export function BottomNav({ citySlug }: { citySlug: string }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { id: "home", label: "Главная", icon: "home", href: `/${citySlug}` },
    { id: "search", label: "Поиск", icon: "search", href: `/${citySlug}/jobs` },
    { id: "map", label: "Карта", icon: "map", href: `/${citySlug}/map` },
    { id: "saved", label: "Избранное", icon: "star", href: "/offline#favorites" },
    { id: "profile", label: "Профиль", icon: "profile" },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface md:hidden"
      aria-label="Основное меню"
    >
      <div className="border-b border-border px-3 py-2">
        <QualitySwitcher id="tr-quality-nav" compact />
      </div>
      <ul className="grid h-bottomnav grid-cols-6">
        {items.map((item) => {
          const hrefPath = item.href ? item.href.split("#")[0] : undefined;
          const current = hrefPath
            ? item.id === "home"
              ? pathname === hrefPath
              : item.id === "search"
                ? pathname === hrefPath ||
                  pathname.startsWith(`${hrefPath}/`) ||
                  pathname === `/${citySlug}/vahta` ||
                  pathname.startsWith(`/${citySlug}/vahta/`)
                : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`)
            : false;
          const className = cn(
            "flex h-full min-h-tap flex-col items-center justify-center gap-1 px-1 text-xs",
            current ? "text-brand" : "text-muted",
            !item.href && "opacity-60",
          );

          return (
            <li key={item.id} className="min-w-0">
              {item.href ? (
                <Link
                  href={item.href}
                  className={className}
                  aria-current={current ? "page" : undefined}
                  prefetch={item.id === "map" ? false : undefined}
                >
                  <Icon name={item.icon} size="sm" decorative />
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span className={className} aria-disabled="true">
                  <Icon name={item.icon} size="sm" decorative />
                  <span className="truncate">{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
        <li className="min-w-0" aria-hidden="true">
          <LayoutSlot />
        </li>
      </ul>
    </nav>
  );
}
