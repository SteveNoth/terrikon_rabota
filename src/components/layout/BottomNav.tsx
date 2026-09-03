"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { LayoutSlot } from "@/components/layout/LayoutSlot";
import { cn } from "@/lib/format/cn";

type NavItem = {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
};

export function BottomNav({
  citySlug,
  accountHref,
  favoritesHref,
  extraHref,
  extraLabel,
}: {
  citySlug: string;
  accountHref: string;
  favoritesHref: string;
  extraHref?: string | null;
  extraLabel?: string | null;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { id: "home", label: "Главная", icon: "home", href: `/${citySlug}` },
    { id: "search", label: "Поиск", icon: "search", href: `/${citySlug}/jobs` },
    { id: "map", label: "Карта", icon: "map", href: `/${citySlug}/map` },
    { id: "saved", label: "Избранное", icon: "star", href: favoritesHref },
    { id: "profile", label: "Профиль", icon: "profile", href: accountHref },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface md:hidden"
      aria-label="Основное меню"
    >
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
                : item.id === "profile"
                  ? pathname === hrefPath ||
                    pathname.startsWith("/employer/") ||
                    pathname.startsWith("/profile") ||
                    pathname.startsWith("/auth/")
                  : item.id === "saved"
                    ? pathname.startsWith("/profile/favorites") || pathname === "/offline"
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
        <li className="min-w-0">
          {extraHref && extraLabel ? (
            <Link
              href={extraHref}
              className={cn(
                "flex h-full min-h-tap flex-col items-center justify-center gap-1 px-1 text-xs",
                pathname === extraHref || pathname.startsWith(`${extraHref}/`)
                  ? "text-brand"
                  : "text-muted",
              )}
              aria-current={
                pathname === extraHref || pathname.startsWith(`${extraHref}/`) ? "page" : undefined
              }
            >
              <Icon name="heart" size="sm" decorative />
              <span className="truncate">{extraLabel}</span>
            </Link>
          ) : (
            <span className="flex h-full min-h-tap flex-col items-center justify-center" aria-hidden="true">
              <LayoutSlot />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
