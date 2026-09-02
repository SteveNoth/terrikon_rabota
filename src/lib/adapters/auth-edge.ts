/**
 * Часть адаптера авторизации, которую можно звать из middleware (Edge).
 * Здесь нет Prisma и нет Next `cookies()` — только обновление cookie сессии.
 * Страницы по-прежнему ходят в `auth.ts`, не сюда.
 */

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

export function supabaseUrl(): string {
  let raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim();
  }
  raw = raw.replace(/["']+$/g, "");
  if (!raw) {
    return "";
  }
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/auth\/v1$/i, "");
  }
}

export function supabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").trim();
}

export function isAuthConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export async function refreshAuthSession(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  if (!isAuthConfigured()) {
    return response;
  }
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const item of cookiesToSet) {
          request.cookies.set(item.name, item.value);
          response.cookies.set(item.name, item.value, item.options);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
