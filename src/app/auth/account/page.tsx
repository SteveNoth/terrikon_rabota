import { getUser } from "@/lib/adapters/auth";
import { signOutAction } from "@/app/auth/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Аккаунт | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getUser();
  if (!user) {
    redirect("/auth/login?next=/auth/account");
  }
  if (user.role === "EMPLOYER") {
    redirect("/employer/dashboard");
  }

  return (
    <>
      <h1 className="font-display text-2xl font-medium">Аккаунт</h1>
      <p className="text-md">
        Вы вошли как {user.name} ({user.email}).
      </p>
      <p className="text-md text-muted">
        Кабинет соискателя — резюме, отклики и избранное в аккаунте — появится на следующем этапе. Смотреть
        вакансии можно и сейчас.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={cn(buttonVariants({ variant: "primary" }))}>
          К вакансиям
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={cn(buttonVariants({ variant: "outline" }))}>
            Выйти
          </button>
        </form>
      </div>
    </>
  );
}
