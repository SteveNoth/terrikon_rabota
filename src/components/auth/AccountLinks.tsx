import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { AuthUser } from "@/lib/adapters/auth";
import { signOutAction } from "@/app/auth/actions";

export function AccountLinks({
  citySlug,
  user,
  compact = false,
}: {
  citySlug: string;
  user: AuthUser | null;
  compact?: boolean;
}) {
  const size = compact ? "sm" : "sm";
  if (!user) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link href="/auth/login" className={cn(buttonVariants({ variant: "ghost", size }))}>
          Войти
        </Link>
        <Link
          href="/auth/register?role=employer"
          className={cn(buttonVariants({ variant: compact ? "outline" : "accent", size }), "hidden md:inline-flex")}
        >
          Разместить вакансию
        </Link>
      </div>
    );
  }

  const cabinetHref = user.role === "EMPLOYER" ? "/employer/dashboard" : "/profile";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Link href={cabinetHref} className={cn(buttonVariants({ variant: "ghost", size }))}>
        Кабинет
      </Link>
      {user.role === "EMPLOYER" ? (
        <Link
          href="/employer/vacancies/new"
          className={cn(buttonVariants({ variant: "accent", size }), "hidden md:inline-flex")}
        >
          Разместить вакансию
        </Link>
      ) : null}
      <form action={signOutAction}>
        <input type="hidden" name="next" value={`/${citySlug}`} />
        <button type="submit" className={cn(buttonVariants({ variant: "outline", size }))}>
          Выйти
        </button>
      </form>
    </div>
  );
}
