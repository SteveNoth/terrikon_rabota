"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";

const NAV = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/queue", label: "Очередь одобрения" },
  { href: "/admin/employers/queue", label: "Очередь кабинета" },
  { href: "/admin/vacancies", label: "Вакансии" },
  { href: "/admin/blocked", label: "Заблокировано" },
  { href: "/admin/posts", label: "Модерация постов" },
  { href: "/admin/quality", label: "Качество объявлений" },
  { href: "/admin/health", label: "Наблюдаемость" },
  { href: "/admin/parsers", label: "Статистика парсеров" },
  { href: "/admin/reports", label: "Жалобы" },
  { href: "/admin/cities", label: "Города" },
  { href: "/admin/employers", label: "Работодатели" },
  { href: "/admin/users", label: "Аккаунты" },
];

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
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} aria-current={path === item.href ? "page" : undefined}>
          <span>{item.label}</span>
          {item.href === "/admin/queue" ? <span className="admin-badge">{queueSize}</span> : null}
          {item.href === "/admin/employers/queue" ? <span className="admin-badge">{employerQueueSize}</span> : null}
        </Link>
      ))}
      <form action={logoutAction} className="mt-5">
        <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Выйти
        </button>
      </form>
    </nav>
  );
}
