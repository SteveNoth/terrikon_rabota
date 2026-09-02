import { getUser } from "@/lib/adapters/auth";
import { EMPLOYER_ONLY_MESSAGE } from "@/lib/auth/constants";
import { firstQuery } from "@/lib/auth/next-path";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Нет доступа | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const reason = firstQuery(query.reason);
  const user = await getUser();
  const text =
    reason === "employer"
      ? EMPLOYER_ONLY_MESSAGE
      : "У вас нет доступа к этой странице.";

  return (
    <>
      <h1 className="font-display text-2xl font-medium">Нет доступа</h1>
      <p className="text-md text-muted">{text}</p>
      {user?.role === "SEEKER" ? (
        <p className="text-md text-muted">
          Кабинет соискателя — <Link href="/profile">/profile</Link>. Смотреть вакансии можно без ограничений.
        </p>
      ) : null}
      <p>
        <Link href="/" className="text-brand underline-offset-2 hover:underline">
          На главную
        </Link>
      </p>
    </>
  );
}
