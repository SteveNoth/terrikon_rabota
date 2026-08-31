import { safeNextPath } from "@/lib/auth/next-path";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Вход | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function LoginRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeNextPath(query.next, "");
  redirect(next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login");
}
