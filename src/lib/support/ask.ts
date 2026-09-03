import { cookies } from "next/headers";
import { safeNextPath } from "@/lib/auth/next-path";
import { isSupportEnabled } from "@/lib/support";

/** Закрытие просьбы. 30 дней. Имя задано разделом 12.4 ядра. */
export const SUPPORT_DISMISSED_COOKIE = "tr_support_dismissed";
/** Когда в последний раз показали просьбу (unix-секунды). 7 дней. */
export const SUPPORT_ASK_COOKIE = "tr_support_ask";
/** Уже показали в этом посещении. Сессионная, без maxAge. */
export const SUPPORT_ASK_VISIT_COOKIE = "tr_support_ask_visit";

export const SUPPORT_DISMISS_PATH = "/api/hosting/dismiss";
export const SUPPORT_SHOWN_PATH = "/api/hosting/shown";

const DAY = 60 * 60 * 24;
export const SUPPORT_DISMISS_MAX_AGE = 30 * DAY;
export const SUPPORT_ASK_MAX_AGE = 7 * DAY;

export type CookieReader = (name: string) => string | undefined;

function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function supportCookieOptions(maxAge?: number) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: cookieSecure(),
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

function shownTooRecently(raw: string | undefined, nowSec: number): boolean {
  if (!raw) {
    return false;
  }
  const ts = Number(raw);
  if (Number.isFinite(ts) && ts > 0) {
    return nowSec - ts < SUPPORT_ASK_MAX_AGE;
  }
  return true;
}

/** Общая проверка частоты. Компоненты сами её не дублируют. */
export function canShowSupportAskFrom(
  read: CookieReader,
  now = new Date(),
): boolean {
  if (!isSupportEnabled()) {
    return false;
  }
  if (read(SUPPORT_DISMISSED_COOKIE)) {
    return false;
  }
  if (read(SUPPORT_ASK_VISIT_COOKIE)) {
    return false;
  }
  const nowSec = Math.floor(now.getTime() / 1000);
  return !shownTooRecently(read(SUPPORT_ASK_COOKIE), nowSec);
}

export async function canShowSupportAsk(): Promise<boolean> {
  if (!isSupportEnabled()) {
    return false;
  }
  const jar = await cookies();
  return canShowSupportAskFrom((name) => jar.get(name)?.value);
}

export function supportDismissHref(nextPath: string): string {
  const next = safeNextPath(nextPath, "/");
  return `${SUPPORT_DISMISS_PATH}?next=${encodeURIComponent(next)}`;
}

export function supportShownCookieValues(now = new Date()): {
  ask: string;
  visit: string;
} {
  return {
    ask: String(Math.floor(now.getTime() / 1000)),
    visit: "1",
  };
}
