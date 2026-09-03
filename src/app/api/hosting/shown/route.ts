import { NextResponse } from "next/server";
import { isSupportEnabled } from "@/lib/support";
import {
  SUPPORT_ASK_COOKIE,
  SUPPORT_ASK_MAX_AGE,
  SUPPORT_ASK_VISIT_COOKIE,
  supportCookieOptions,
  supportShownCookieValues,
} from "@/lib/support/ask";

export const dynamic = "force-dynamic";

export function GET() {
  if (!isSupportEnabled()) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const response = new NextResponse("ok", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
  const values = supportShownCookieValues();
  response.cookies.set(SUPPORT_ASK_COOKIE, values.ask, supportCookieOptions(SUPPORT_ASK_MAX_AGE));
  response.cookies.set(SUPPORT_ASK_VISIT_COOKIE, values.visit, supportCookieOptions());
  return response;
}
