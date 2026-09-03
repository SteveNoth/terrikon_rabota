"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";

const GROUPS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: "Каждый день",
    items: [
      { href: "/admin/queue", label: "Очередь одобрения" },
      { href: "/admin/employers/queue", label: "Очередь кабинета" },
      { href: "/admin/reports", label: "Жалобы" },
    ],
  },
  {
    heading: "База",
    items: [
      { href: "/admin/vacancies", label: "Вакансии" },
      { href: "/admin/blocked", label: "Заблокировано" },
      { href: "/admin/employers", label: "Работодатели" },
      { href: "/admin/users", label: "Аккаунты" },
      { href: "/admin/posts", label: "Модерация постов" },
    ],
  },
  {
    heading: "Система",
    items: [
      { href: "/admin", label: "Обзор" },
      { href: "/admin/quality", label: "Качество объявлений" },
      { href: "/admin/health", label: "Наблюдаемость" },
      { href: "/admin/parsers", label: "Статистика парсеров" },
      { href: "/admin/cities", label: "Города" },
    ],
  },
];

function isCurrent(path: string, href: string): boolean {
  if (href === "/admin") {
    return path === "/admin";
  }
  if (href === "/admin/employers") {
    if (path === "/admin/employers") {
      return true;
    }
    if (path.startsWith("/admin/employers/queue")) {
      return false;
    }
    return path.startsWith("/admin/employers/");
  }
  return path === href || path.startsWith(`${href}/`);
}

export function AdminNav({
  queueSize,
  employerQueueSize,
}: {
  queueSize: number;
  employerQueueSize: number;
}) {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Админка">
      <p className="mb-3 text-xs text-muted">Террикон · внутренний инструмент</p>
      {GROUPS.map((group) => (
        <div key={group.heading} className="admin-nav-group">
          <p className="admin-nav-heading">{group.heading}</p>
          {group.items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isCurrent(path, item.href) ? "page" : undefined}>
              <span>{item.label}</span>
              {item.href === "/admin/queue" ? <span className="admin-badge">{queueSize}</span> : null}
              {item.href === "/admin/employers/queue" ? <span className="admin-badge">{employerQueueSize}</span> : null}
            </Link>
          ))}
        </div>
      ))}
      <form action={logoutAction} className="mt-5">
        <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Выйти
        </button>
      </form>
    </nav>
  );
}
