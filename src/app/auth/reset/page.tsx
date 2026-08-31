import { AuthNotice } from "@/components/auth/AuthNotice";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { resetPasswordAction } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth/guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Новый пароль | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser("/auth/reset");
  const query = await searchParams;
  return (
    <>
      <h1 className="font-display text-2xl font-medium">Новый пароль</h1>
      <p className="text-md text-muted">Придумайте пароль не короче 8 символов.</p>
      <AuthNotice query={query} />
      <form action={resetPasswordAction} className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="reset-password">Пароль</Label>
          <input
            id="reset-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="reset-repeat">Повторите пароль</Label>
          <input
            id="reset-repeat"
            name="passwordRepeat"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={FIELD_CLASS}
          />
        </div>
        <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
          Сохранить пароль
        </button>
      </form>
    </>
  );
}
