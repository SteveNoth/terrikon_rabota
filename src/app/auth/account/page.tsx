import { getUser } from "@/lib/adapters/auth";
import { LOGIN_BLOCKED_MESSAGE } from "@/lib/auth/blocks";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Аккаунт | Террикон Работа",
  robots: { index: false, follow: false },
};

/** Старый адрес. Кабинет соискателя — /profile, работодателя — /employer/dashboard. */
export default async function AccountPage() {
  const user = await getUser();
  if (!user || user.loginBlocked) {
    redirect(
      user?.loginBlocked
        ? `/auth/login?error=${encodeURIComponent(LOGIN_BLOCKED_MESSAGE)}&next=/profile`
        : "/auth/login?next=/profile",
    );
  }
  if (user.role === "EMPLOYER") {
    redirect("/employer/dashboard");
  }
  redirect("/profile");
}
