import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Почта подтверждена | Террикон Работа",
  robots: { index: false, follow: false },
};

export default function ConfirmedPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-medium">Почта подтверждена</h1>
      <p className="text-md text-muted">Теперь можно войти и пользоваться кабинетом.</p>
      <p>
        <Link href="/auth/login" className={cn(buttonVariants({ variant: "primary" }))}>
          Войти
        </Link>
      </p>
    </>
  );
}
