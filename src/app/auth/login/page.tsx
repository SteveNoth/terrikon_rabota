import { AuthNotice } from "@/components/auth/AuthNotice";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { firstQuery, safeNextPath } from "@/lib/auth/next-path";
import { getDefaultCity } from "@/lib/geo";
import { signInAction } from "@/app/auth/actions";
import { getUser } from "@/lib/adapters/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Вход | Террикон Работа",
  description: "Войти, чтобы откликнуться или управлять вакансиями.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  const query = await searchParams;
  const next = safeNextPath(firstQuery(query.next), `/${getDefaultCity().slug}`);
  if (user && !firstQuery(query.error)) {
    redirect(user.role === "EMPLOYER" ? "/employer/dashboard" : next);
  }

  return (
    <>
      <h1 className="font-display text-2xl font-medium">Вход</h1>
      <p className="text-md text-muted">Смотреть вакансии можно без регистрации.</p>
      <AuthNotice query={query} />
      <form action={signInAction} className="flex min-w-0 flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="login-email">Email</Label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={firstQuery(query.email) ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="login-password">Пароль</Label>
          <input
            id="login-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={FIELD_CLASS}
          />
        </div>
        <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
          Войти
        </button>
      </form>
      <p className="text-sm text-muted">
        <Link href="/auth/forgot" className="text-brand underline-offset-2 hover:underline">
          Забыли пароль?
        </Link>
      </p>
      <p className="text-sm text-muted">
        Нет аккаунта?{" "}
        <Link href={`/auth/register?next=${encodeURIComponent(next)}`} className="text-brand underline-offset-2 hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </>
  );
}
