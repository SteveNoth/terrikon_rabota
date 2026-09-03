import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { isSupportEnabled } from "@/lib/support";
import {
  SUPPORT_DISMISSED_COOKIE,
  SUPPORT_DISMISS_MAX_AGE,
  supportCookieOptions,
} from "@/lib/support/ask";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const fallback = new URL("/", request.url);
  if (!isSupportEnabled()) {
    return NextResponse.redirect(fallback, 303);
  }

  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/");
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(
    SUPPORT_DISMISSED_COOKIE,
    "1",
    supportCookieOptions(SUPPORT_DISMISS_MAX_AGE),
  );
  return response;
}
