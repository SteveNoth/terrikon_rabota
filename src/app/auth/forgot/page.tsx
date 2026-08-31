import { AuthNotice } from "@/components/auth/AuthNotice";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { forgotAction } from "@/app/auth/actions";
import { firstQuery } from "@/lib/auth/next-path";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Сброс пароля | Террикон Работа",
  description: "Восстановить доступ к аккаунту.",
  robots: { index: false, follow: false },
};

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <>
      <h1 className="font-display text-2xl font-medium">Сброс пароля</h1>
      <p className="text-md text-muted">
        Укажите email — если такой аккаунт есть, пришлём ссылку для нового пароля.
      </p>
      <AuthNotice query={query} />
      <form action={forgotAction} className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="forgot-email">Email</Label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={firstQuery(query.email) ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
          Отправить ссылку
        </button>
      </form>
      <p className="text-sm text-muted">
        <Link href="/auth/login" className="text-brand underline-offset-2 hover:underline">
          Вернуться ко входу
        </Link>
      </p>
    </>
  );
}
