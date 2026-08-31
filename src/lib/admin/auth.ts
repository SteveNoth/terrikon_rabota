/**
 * Вход в админку — один общий пароль из ADMIN_PASSWORD и подписанная cookie.
 *
 * Это осознанно простое решение для одного человека. Нет ролей, нет 2FA,
 * нет учётки в базе: кто знает пароль из .env, тот и администратор.
 * Ограничения, с которыми живём:
 * - украденная cookie = доступ до истечения срока (7 дней) или смены пароля;
 * - нет журнала «кто вошёл»: аудита пользователей нет, потому что пользователь один;
 * - пароль в переменной окружения — смена требует правки env и нового деплоя;
 * - без ADMIN_PASSWORD админка закрыта целиком, пустой пароль не принимаем.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ADMIN_PASSWORD_MIN, ADMIN_SESSION_MAX_AGE } from "@/lib/admin/constants";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

type LoginBucket = { hits: number[] };

const globalForAdmin = globalThis as unknown as {
  adminLoginBuckets?: Map<string, LoginBucket>;
};

function buckets(): Map<string, LoginBucket> {
  if (!globalForAdmin.adminLoginBuckets) {
    globalForAdmin.adminLoginBuckets = new Map();
  }
  return globalForAdmin.adminLoginBuckets;
}

export function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD?.trim() ?? "";
  if (value.length < ADMIN_PASSWORD_MIN) {
    return null;
  }
  return value;
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function signAdminSession(now = Date.now()): string | null {
  const secret = adminPassword();
  if (!secret) {
    return null;
  }
  const exp = now + ADMIN_SESSION_MAX_AGE * 1000;
  const payload = `v1.${exp}`;
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifyAdminSession(token: string | null | undefined, now = Date.now()): boolean {
  const secret = adminPassword();
  if (!secret || !token) {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return false;
  }
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now) {
    return false;
  }
  const payload = `v1.${parts[1]}`;
  const expected = hmac(payload, secret);
  return safeEqual(parts[2] ?? "", expected);
}

export function verifyAdminPassword(input: string): boolean {
  const secret = adminPassword();
  if (!secret) {
    return false;
  }
  if (input.length !== secret.length) {
    // Сравниваем с собой, чтобы время ответа не выдавало длину.
    safeEqual(secret, secret);
    return false;
  }
  return safeEqual(input, secret);
}

export function allowLoginAttempt(key: string, now = Date.now()): boolean {
  const store = buckets();
  const bucket = store.get(key) ?? { hits: [] };
  const from = now - LOGIN_WINDOW_MS;
  bucket.hits = bucket.hits.filter((stamp) => stamp > from);
  if (bucket.hits.length >= LOGIN_MAX_ATTEMPTS) {
    store.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  store.set(key, bucket);
  return true;
}

function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function adminCookieOptions(maxAge = ADMIN_SESSION_MAX_AGE) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge,
  };
}

export async function isAdminRequest(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminSession(jar.get(ADMIN_COOKIE)?.value);
}

/** Страницы админки кроме формы входа. Нет сессии — на /admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminRequest())) {
    redirect("/admin");
  }
}
