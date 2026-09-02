import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";

const ITEMS = [
  { href: "/profile", label: "Данные" },
  { href: "/profile/applications", label: "Отклики" },
  { href: "/profile/favorites", label: "Избранное" },
] as const;

export function ProfileNav({ current }: { current: (typeof ITEMS)[number]["href"] }) {
  return (
    <nav
      aria-label="Кабинет соискателя"
      className="mt-1 flex min-w-0 flex-wrap gap-2 rounded-lg border border-border bg-surface-muted p-1.5"
    >
      {ITEMS.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({ variant: active ? "primary" : "outline", size: "md" }),
              "min-w-28 grow sm:grow-0",
              active && "shadow-1",
            )}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
