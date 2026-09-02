"use server";

import { redirect } from "next/navigation";
import { auth, authCallbackUrl } from "@/lib/adapters/auth";
import { forgotSchema, loginSchema, registerSchema, resetPasswordSchema, firstZodMessage } from "@/lib/auth/schemas";
import { cityMustBeKnown } from "@/lib/auth/schemas";
import { getDefaultCity } from "@/lib/geo";
import { safeNextPath } from "@/lib/auth/next-path";

function fail(path: string, error: string, extra?: Record<string, string>): never {
  const params = new URLSearchParams({ error });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) {
        params.set(key, value);
      }
    }
  }
  redirect(`${path}?${params.toString()}`);
}

function notice(path: string, text: string, extra?: Record<string, string>): never {
  const params = new URLSearchParams({ notice: text });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) {
        params.set(key, value);
      }
    }
  }
  redirect(`${path}?${params.toString()}`);
}

function formString(form: FormData, name: string): string {
  const raw = form.get(name);
  return typeof raw === "string" ? raw : "";
}

function afterLoginPath(userRole: string, next: string): string {
  if (next && next !== "/") {
    return next;
  }
  if (userRole === "EMPLOYER") {
    return "/employer/dashboard";
  }
  if (userRole === "SEEKER") {
    return "/profile";
  }
  return next || "/";
}

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    name: formString(formData, "name"),
    role: formString(formData, "role"),
    citySlug: formString(formData, "citySlug"),
    next: formString(formData, "next"),
  });
  if (!parsed.success) {
    fail("/auth/register", firstZodMessage(parsed.error), {
      email: formString(formData, "email"),
      role: formString(formData, "role"),
      next: formString(formData, "next"),
    });
  }
  const cityError = cityMustBeKnown(parsed.data.citySlug);
  if (cityError) {
    fail("/auth/register", cityError, {
      email: parsed.data.email,
      role: parsed.data.role,
      next: parsed.data.next ?? "",
    });
  }

  const next = safeNextPath(parsed.data.next, parsed.data.role === "EMPLOYER" ? "/employer/dashboard" : "/");
  const result = await auth.signUp({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
    name: parsed.data.name,
    role: parsed.data.role,
    citySlug: parsed.data.citySlug,
    emailRedirectTo: await authCallbackUrl("/auth/confirmed"),
  });
  if (!result.ok) {
    fail("/auth/register", result.error, {
      email: parsed.data.email,
      role: parsed.data.role,
      next,
    });
  }
  if (result.needsEmailConfirmation) {
    notice("/auth/confirm", "Мы отправили письмо со ссылкой. Перейдите по ней, чтобы подтвердить почту.", {
      email: parsed.data.email,
    });
  }
  redirect(afterLoginPath(parsed.data.role, next));
}

export async function signInAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    next: formString(formData, "next"),
  });
  if (!parsed.success) {
    fail("/auth/login", firstZodMessage(parsed.error), { email: formString(formData, "email") });
  }
  const fallbackCity = getDefaultCity().slug;
  const next = safeNextPath(parsed.data.next, `/${fallbackCity}`);
  const result = await auth.signIn({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
  });
  if (!result.ok) {
    fail("/auth/login", result.error, {
      email: parsed.data.email,
      next,
    });
  }
  redirect(afterLoginPath(result.user.role, next));
}

export async function signOutAction(formData: FormData) {
  await auth.signOut();
  const next = safeNextPath(formString(formData, "next"), "/");
  redirect(next);
}

export async function forgotAction(formData: FormData) {
  const parsed = forgotSchema.safeParse({ email: formString(formData, "email") });
  if (!parsed.success) {
    fail("/auth/forgot", firstZodMessage(parsed.error), { email: formString(formData, "email") });
  }
  const result = await auth.requestPasswordReset(
    parsed.data.email.trim().toLowerCase(),
    await authCallbackUrl("/auth/reset"),
  );
  if (!result.ok) {
    fail("/auth/forgot", result.error, { email: parsed.data.email });
  }
  notice(
    "/auth/forgot",
    "Если такой email есть в системе, мы отправили письмо со ссылкой для смены пароля.",
    { email: parsed.data.email },
  );
}

export async function resetPasswordAction(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    password: formString(formData, "password"),
    passwordRepeat: formString(formData, "passwordRepeat"),
  });
  if (!parsed.success) {
    fail("/auth/reset", firstZodMessage(parsed.error));
  }
  const result = await auth.updatePassword(parsed.data.password);
  if (!result.ok) {
    fail("/auth/reset", result.error);
  }
  notice("/auth/login", "Пароль обновлён. Войдите с новым паролем.");
}
