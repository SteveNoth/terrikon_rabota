import { AuthNotice } from "@/components/auth/AuthNotice";
import type { Metadata } from "next";
import Link from "next/link";
import { firstQuery } from "@/lib/auth/next-path";

export const metadata: Metadata = {
  title: "Подтвердите почту | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const email = firstQuery(query.email);
  return (
    <>
      <h1 className="font-display text-2xl font-medium">Подтвердите почту</h1>
      <AuthNotice query={query} />
      <p className="text-md text-muted">
        {email
          ? `Письмо отправлено на ${email}. Откройте его и перейдите по ссылке — после этого можно войти.`
          : "Откройте письмо и перейдите по ссылке — после этого можно войти."}
      </p>
      <p className="text-sm text-muted">Если письма нет, проверьте папку «Спам».</p>
      <p>
        <Link href="/auth/login" className="text-brand underline-offset-2 hover:underline">
          Перейти ко входу
        </Link>
      </p>
    </>
  );
}
