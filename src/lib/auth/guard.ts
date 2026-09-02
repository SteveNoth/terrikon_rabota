import type { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { getUser, type AuthUser, auth } from "@/lib/adapters/auth";
import { EMPLOYER_ONLY_MESSAGE } from "@/lib/auth/constants";
import { LOGIN_BLOCKED_MESSAGE } from "@/lib/auth/blocks";

function loginHref(next?: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/auth/login";
  }
  return `/auth/login?next=${encodeURIComponent(next)}`;
}

/** Нужен любой вошедший. Нет сессии — на форму входа. LOGIN-блок снимает сессию. */
export async function requireUser(next?: string): Promise<AuthUser> {
  const user = await getUser();
  if (!user) {
    redirect(loginHref(next));
  }
  if (user.loginBlocked) {
    await auth.signOut();
    redirect(`/auth/login?error=${encodeURIComponent(LOGIN_BLOCKED_MESSAGE)}`);
  }
  return user;
}

/**
 * Один общий замок по роли. Страницы кабинета его вызывают из layout,
 * серверные действия — из себя. Отдельных `if (role !== …)` по файлам нет.
 */
export async function requireRole(role: UserRole | UserRole[], next?: string): Promise<AuthUser> {
  const user = await requireUser(next);
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(user.role)) {
    if (role === "EMPLOYER" || (Array.isArray(role) && role.length === 1 && role[0] === "EMPLOYER")) {
      redirect(`/auth/forbidden?reason=employer`);
    }
    redirect(`/auth/forbidden?reason=role`);
  }
  return user;
}

export async function requireEmployer(next = "/employer/dashboard"): Promise<AuthUser & { employerId: string }> {
  const user = await requireRole("EMPLOYER", next);
  if (!user.employerId) {
    redirect(`/auth/forbidden?reason=employer`);
  }
  return user as AuthUser & { employerId: string };
}

export function employerOnlyMessage(): string {
  return EMPLOYER_ONLY_MESSAGE;
}
