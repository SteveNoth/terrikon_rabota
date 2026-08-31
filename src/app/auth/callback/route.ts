import { exchangeAuthCode } from "@/lib/adapters/auth";
import { safeNextPath } from "@/lib/auth/next-path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/auth/confirmed");
  const errorDescription = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (errorDescription) {
    const target = new URL("/auth/login", url.origin);
    target.searchParams.set("error", "Ссылка не сработала. Запросите письмо ещё раз.");
    return NextResponse.redirect(target);
  }

  if (!code) {
    const target = new URL("/auth/login", url.origin);
    target.searchParams.set("error", "В ссылке нет кода подтверждения. Запросите письмо ещё раз.");
    return NextResponse.redirect(target);
  }

  const result = await exchangeAuthCode(code);
  if (!result.ok) {
    const target = new URL("/auth/login", url.origin);
    target.searchParams.set("error", result.error);
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
