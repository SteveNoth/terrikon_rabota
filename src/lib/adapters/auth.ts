/**
 * Переходник авторизации (Закон 6).
 *
 * Страницы и кабинет зовут `signUp` / `signIn` / `signOut` / `getUser`.
 * Они не знают, что за сервисом стоит Supabase Auth. Когда (если) сменим
 * поставщика на свой сервер или Auth.js, правится этот файл и переменная
 * `AUTH_DRIVER` — не формы, не кабинет и не проверка роли.
 *
 * Учётка сайта живёт в таблице `User`. Id в сервисе входа — поле `authId`.
 * Так свой ряд не прибивается гвоздями к UUID Supabase.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { UserRole } from "@prisma/client";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/adapters/db";
import { isAuthConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/adapters/auth-edge";
import { AUTH_NOT_CONFIGURED, authErrorMessage } from "@/lib/auth/messages";
import { LOGIN_BLOCKED_MESSAGE } from "@/lib/auth/blocks";
import { getDefaultCity, isCitySlug } from "@/lib/geo";
import { employerSlug } from "@/lib/parser/slug";

export type AuthUser = {
  id: string;
  authId: string;
  email: string;
  name: string;
  role: UserRole;
  citySlug: string;
  employerId: string | null;
  publishBlocked: boolean;
  applyBlocked: boolean;
  loginBlocked: boolean;
};

export type SignUpInput = {
  email: string;
  password: string;
  name: string;
  role: "SEEKER" | "EMPLOYER";
  citySlug: string;
  emailRedirectTo: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type AuthOk<T> = { ok: true } & T;
export type AuthFail = { ok: false; error: string };
export type AuthResult<T> = AuthOk<T> | AuthFail;

export interface AuthAdapter {
  signUp(input: SignUpInput): Promise<AuthResult<{ needsEmailConfirmation: boolean; user: AuthUser | null }>>;
  signIn(input: SignInInput): Promise<AuthResult<{ user: AuthUser }>>;
  signOut(): Promise<AuthResult<{ signedOut: true }>>;
  getUser(): Promise<AuthUser | null>;
  requestPasswordReset(email: string, redirectTo: string): Promise<AuthResult<{ sent: true }>>;
  updatePassword(password: string): Promise<AuthResult<{ user: AuthUser }>>;
}

export { isAuthConfigured } from "@/lib/adapters/auth-edge";

type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options: CookieOptions) => void;
};

function createClient(store: CookieStore) {
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        for (const item of cookiesToSet) {
          store.set(item.name, item.value, item.options);
        }
      },
    },
  });
}

async function cookieStoreFromNext(): Promise<CookieStore> {
  const jar = await cookies();
  return {
    getAll() {
      return jar.getAll();
    },
    set(name, value, options) {
      try {
        jar.set(name, value, options);
      } catch {
        // Вызов из чистого Server Component: cookie уже проставил Server Action / Route Handler.
      }
    },
  };
}

function roleFromMeta(value: unknown): UserRole {
  return value === "EMPLOYER" ? "EMPLOYER" : "SEEKER";
}

function cityFromMeta(value: unknown): string {
  if (typeof value === "string" && isCitySlug(value)) {
    return value;
  }
  return getDefaultCity().slug;
}

function nameFromMeta(user: SupabaseUser, fallbackEmail: string): string {
  const raw = user.user_metadata?.name;
  if (typeof raw === "string" && raw.trim().length >= 2) {
    return raw.trim().slice(0, 80);
  }
  const local = fallbackEmail.split("@")[0] ?? "Пользователь";
  return local.slice(0, 80) || "Пользователь";
}

function toAuthUser(
  row: {
    id: string;
    authId: string;
    email: string;
    name: string;
    role: UserRole;
    citySlug: string;
    publishBlocked?: boolean;
    applyBlocked?: boolean;
    loginBlocked?: boolean;
    employer?: { id: string } | null;
  },
  employerId?: string | null,
): AuthUser {
  return {
    id: row.id,
    authId: row.authId,
    email: row.email,
    name: row.name,
    role: row.role,
    citySlug: row.citySlug,
    employerId: employerId !== undefined ? employerId : (row.employer?.id ?? null),
    publishBlocked: Boolean(row.publishBlocked),
    applyBlocked: Boolean(row.applyBlocked),
    loginBlocked: Boolean(row.loginBlocked),
  };
}

async function uniqueEmployerSlug(base: string): Promise<string> {
  let slug = base.slice(0, 80) || "employer";
  let n = 2;
  while (await prisma.employer.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base.slice(0, 70)}-${n}`;
    n += 1;
  }
  return slug;
}

async function createEmployerForUser(user: { id: string; name: string; citySlug: string; email: string }) {
  const slug = await uniqueEmployerSlug(employerSlug({ name: user.name, citySlug: user.citySlug }));
  return prisma.employer.create({
    data: {
      slug,
      name: user.name,
      citySlug: user.citySlug,
      sphere: "unknown",
      email: user.email,
      userId: user.id,
    },
  });
}

async function ensureAppUser(authUser: SupabaseUser): Promise<AuthUser | null> {
  const email = authUser.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const existing = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: { employer: { select: { id: true } } },
  });
  if (existing) {
    if (existing.role === "EMPLOYER" && !existing.employer) {
      const employer = await createEmployerForUser(existing);
      return toAuthUser(existing, employer.id);
    }
    if (existing.email !== email) {
      await prisma.user.update({ where: { id: existing.id }, data: { email } });
    }
    return toAuthUser({ ...existing, email }, existing.employer?.id ?? null);
  }

  const byEmail = await prisma.user.findUnique({
    where: { email },
    include: { employer: { select: { id: true } } },
  });
  if (byEmail) {
    const updated = await prisma.user.update({
      where: { id: byEmail.id },
      data: { authId: authUser.id },
      include: { employer: { select: { id: true } } },
    });
    return toAuthUser(updated);
  }

  const role = roleFromMeta(authUser.user_metadata?.role);
  const citySlug = cityFromMeta(authUser.user_metadata?.citySlug);
  const name = nameFromMeta(authUser, email);
  const created = await prisma.user.create({
    data: {
      authId: authUser.id,
      email,
      name,
      role,
      citySlug,
    },
  });
  let employerId: string | null = null;
  if (role === "EMPLOYER") {
    employerId = (await createEmployerForUser(created)).id;
  }
  return toAuthUser(created, employerId);
}

function looksLikeExistingAccount(user: SupabaseUser | null): boolean {
  if (!user) {
    return false;
  }
  const identities = user.identities;
  return Array.isArray(identities) && identities.length === 0;
}

class SupabaseAuth implements AuthAdapter {
  async signUp(
    input: SignUpInput,
  ): Promise<AuthResult<{ needsEmailConfirmation: boolean; user: AuthUser | null }>> {
    if (!isAuthConfigured()) {
      return { ok: false, error: AUTH_NOT_CONFIGURED };
    }
    const supabase = createClient(await cookieStoreFromNext());
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          name: input.name,
          role: input.role,
          citySlug: input.citySlug,
        },
        emailRedirectTo: input.emailRedirectTo,
      },
    });
    if (error) {
      console.error(
        "[auth] signUp",
        error.code ?? "",
        error.status ?? "",
        error.message ?? "",
        "redirect",
        input.emailRedirectTo,
      );
      return { ok: false, error: authErrorMessage(error) };
    }
    if (looksLikeExistingAccount(data.user)) {
      return { ok: false, error: "Такой email уже зарегистрирован" };
    }
    let user: AuthUser | null = null;
    try {
      user = data.user ? await ensureAppUser(data.user) : null;
    } catch (cause) {
      console.error("[auth] signUp ensureAppUser", cause);
      return { ok: false, error: "Не получилось создать аккаунт. Если ошибка повторяется — напишите администратору" };
    }
    const needsEmailConfirmation = !data.session;
    return { ok: true, needsEmailConfirmation, user };
  }

  async signIn(input: SignInInput): Promise<AuthResult<{ user: AuthUser }>> {
    if (!isAuthConfigured()) {
      return { ok: false, error: AUTH_NOT_CONFIGURED };
    }
    const supabase = createClient(await cookieStoreFromNext());
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) {
      return { ok: false, error: authErrorMessage(error, "Неверный email или пароль") };
    }
    if (!data.user) {
      return { ok: false, error: "Неверный email или пароль" };
    }
    const user = await ensureAppUser(data.user);
    if (!user) {
      return { ok: false, error: "Не получилось открыть аккаунт. Попробуйте ещё раз" };
    }
    if (user.loginBlocked) {
      await supabase.auth.signOut();
      return { ok: false, error: LOGIN_BLOCKED_MESSAGE };
    }
    return { ok: true, user };
  }

  async signOut(): Promise<AuthResult<{ signedOut: true }>> {
    if (!isAuthConfigured()) {
      return { ok: true, signedOut: true };
    }
    const supabase = createClient(await cookieStoreFromNext());
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { ok: false, error: authErrorMessage(error) };
    }
    return { ok: true, signedOut: true };
  }

  async getUser(): Promise<AuthUser | null> {
    if (!isAuthConfigured()) {
      return null;
    }
    const supabase = createClient(await cookieStoreFromNext());
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      return null;
    }
    return ensureAppUser(data.session.user);
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<AuthResult<{ sent: true }>> {
    if (!isAuthConfigured()) {
      return { ok: false, error: AUTH_NOT_CONFIGURED };
    }
    const supabase = createClient(await cookieStoreFromNext());
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      return { ok: false, error: authErrorMessage(error) };
    }
    return { ok: true, sent: true };
  }

  async updatePassword(password: string): Promise<AuthResult<{ user: AuthUser }>> {
    if (!isAuthConfigured()) {
      return { ok: false, error: AUTH_NOT_CONFIGURED };
    }
    const supabase = createClient(await cookieStoreFromNext());
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { ok: false, error: authErrorMessage(error) };
    }
    if (!data.user) {
      return { ok: false, error: "Сессия истекла. Войдите снова" };
    }
    const user = await ensureAppUser(data.user);
    if (!user) {
      return { ok: false, error: "Не получилось сохранить пароль. Попробуйте ещё раз" };
    }
    return { ok: true, user };
  }
}

class NoneAuth implements AuthAdapter {
  async signUp(): Promise<AuthResult<{ needsEmailConfirmation: boolean; user: AuthUser | null }>> {
    return { ok: false, error: AUTH_NOT_CONFIGURED };
  }
  async signIn(): Promise<AuthResult<{ user: AuthUser }>> {
    return { ok: false, error: AUTH_NOT_CONFIGURED };
  }
  async signOut(): Promise<AuthResult<{ signedOut: true }>> {
    return { ok: true, signedOut: true };
  }
  async getUser(): Promise<AuthUser | null> {
    return null;
  }
  async requestPasswordReset(): Promise<AuthResult<{ sent: true }>> {
    return { ok: false, error: AUTH_NOT_CONFIGURED };
  }
  async updatePassword(): Promise<AuthResult<{ user: AuthUser }>> {
    return { ok: false, error: AUTH_NOT_CONFIGURED };
  }
}

function createAuth(): AuthAdapter {
  const driver = (process.env.AUTH_DRIVER ?? "supabase").toLowerCase();
  if (driver === "none" || !isAuthConfigured()) {
    return new NoneAuth();
  }
  return new SupabaseAuth();
}

const adapter = createAuth();

export const auth: AuthAdapter = {
  signUp: (input) => adapter.signUp(input),
  signIn: (input) => adapter.signIn(input),
  signOut: () => adapter.signOut(),
  getUser: () => adapter.getUser(),
  requestPasswordReset: (email, redirectTo) => adapter.requestPasswordReset(email, redirectTo),
  updatePassword: (password) => adapter.updatePassword(password),
};

/**
 * Один запрос на отрисовку страницы: шапка, кабинет и гард роли не ходят в Auth трижды.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => adapter.getUser());

export async function exchangeAuthCode(code: string): Promise<AuthResult<{ user: AuthUser | null }>> {
  if (!isAuthConfigured()) {
    return { ok: false, error: AUTH_NOT_CONFIGURED };
  }
  const supabase = createClient(await cookieStoreFromNext());
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return { ok: false, error: authErrorMessage(error) };
  }
  const user = data.user ? await ensureAppUser(data.user) : null;
  return { ok: true, user };
}

export function publicSiteUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv;
  }
  return "http://localhost:3000";
}

function loopbackOrigin(host: string): string | null {
  const port = host.match(/:(\d+)$/)?.[1] ?? "3000";
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (name === "localhost" || name === "127.0.0.1" || name === "::1") {
    return `http://localhost:${port}`;
  }
  return null;
}

/**
 * Ссылка возврата из письма. Без `?next=` — иначе запрос к Auth ломается.
 * Локально всегда localhost, даже если открыли 127.0.0.1.
 * Подтверждение: /auth/callback. Сброс пароля: /auth/callback/reset.
 */
export async function authCallbackUrl(nextPath: "/auth/confirmed" | "/auth/reset"): Promise<string> {
  const fallback = publicSiteUrl();
  let origin = fallback;
  try {
    const headerList = await headers();
    const host = (headerList.get("x-forwarded-host") || headerList.get("host") || "").split(",")[0].trim().toLowerCase();
    if (host) {
      const local = loopbackOrigin(host);
      if (local) {
        origin = local;
      } else {
        const proto = (headerList.get("x-forwarded-proto") || "https").split(",")[0].trim();
        let fallbackHost = "";
        try {
          fallbackHost = new URL(fallback).host.toLowerCase();
        } catch {
          fallbackHost = "";
        }
        const vercel = (process.env.VERCEL_URL ?? "").toLowerCase();
        if (host === fallbackHost || (vercel && host === vercel)) {
          origin = `${proto}://${host}`;
        }
      }
    }
  } catch {
    origin = fallback;
  }
  if (nextPath === "/auth/reset") {
    return `${origin}/auth/callback/reset`;
  }
  return `${origin}/auth/callback`;
}
