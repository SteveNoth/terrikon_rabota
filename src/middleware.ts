import { NextResponse, type NextRequest } from "next/server";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import {
  encodeSearchCookie,
  hasStoredFilters,
  jobsSectionFromPath,
  queryForCookie,
  SEARCH_COOKIE,
  SEARCH_COOKIE_MAX_AGE,
} from "@/lib/jobs/search-cookie";
import { resolveMode } from "@/lib/quality/server";
import {
  MODE_COOKIE,
  MODE_COOKIE_MAX_AGE,
  MODE_HEADER,
  PREFERENCE_HEADER,
  ULTRA_PATH_HEADER,
} from "@/lib/quality/types";
import { refreshAuthSession } from "@/lib/adapters/auth-edge";
import { SESSION_COOKIE, SESSION_HEADER, SESSION_MAX_AGE, isSessionHash } from "@/lib/stats/session";

function randomSessionHash(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function resolveCity(request: NextRequest): string {
  const fromCookie = request.cookies.get(CITY_COOKIE)?.value;
  if (fromCookie && isSelectableCity(fromCookie)) {
    return fromCookie;
  }
  return getDefaultCity().slug;
}

function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAge: number) {
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: cookieSecure(),
  };
}

function withCityCookie(response: NextResponse, slug: string, request: NextRequest) {
  if (request.cookies.get(CITY_COOKIE)?.value === slug) {
    return response;
  }

  response.cookies.set(CITY_COOKIE, slug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: cookieSecure(),
  });

  return response;
}

/**
 * Middleware работает раньше любой страницы: до layout, до React, до базы.
 * Здесь можно только дешёвое: прочитать cookie и заголовки, прокинуть решение дальше.
 * Нельзя ходить в БД, мерять пинг и тянуть файлы — пользователь будет ждать HTML.
 */
function applyQuality(
  response: NextResponse,
  request: NextRequest,
  resolved = resolveMode(request),
): NextResponse {
  response.headers.set(MODE_HEADER, resolved.mode);
  response.headers.set(PREFERENCE_HEADER, resolved.preference);

  if (resolved.rememberPreference) {
    response.cookies.set(MODE_COOKIE, resolved.preference, cookieOptions(MODE_COOKIE_MAX_AGE));
  }

  return response;
}

function passQuality(request: NextRequest): NextResponse {
  const resolved = resolveMode(request);
  const session = resolveSession(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(MODE_HEADER, resolved.mode);
  requestHeaders.set(PREFERENCE_HEADER, resolved.preference);
  requestHeaders.set(SESSION_HEADER, session.hash);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  return withSession(applyQuality(response, request, resolved), session);
}

function resolveSession(request: NextRequest): { hash: string; isNew: boolean } {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (isSessionHash(existing)) {
    return { hash: existing, isNew: false };
  }
  return { hash: randomSessionHash(), isNew: true };
}

function withSession(
  response: NextResponse,
  session: { hash: string; isNew: boolean },
): NextResponse {
  response.headers.set(SESSION_HEADER, session.hash);
  if (session.isNew) {
    response.cookies.set(SESSION_COOKIE, session.hash, cookieOptions(SESSION_MAX_AGE));
  }
  return response;
}

function withLastSearch(request: NextRequest, response: NextResponse): NextResponse {
  const url = request.nextUrl;
  const section = jobsSectionFromPath(url.pathname);
  if (!section) {
    return response;
  }
  const city = url.pathname.split("/").filter(Boolean)[0];
  if (!city || !isSelectableCity(city)) {
    return response;
  }

  if (url.searchParams.get("reset") === "1") {
    const target = url.clone();
    target.search = "";
    const redirect = NextResponse.redirect(target);
    redirect.cookies.set(SEARCH_COOKIE, "", cookieOptions(0));
    return applyQuality(withCityCookie(redirect, city, request), request);
  }

  if (hasStoredFilters(url.searchParams)) {
    const query = queryForCookie(url.searchParams);
    if (query) {
      response.cookies.set(
        SEARCH_COOKIE,
        encodeSearchCookie(city, section, query),
        cookieOptions(SEARCH_COOKIE_MAX_AGE),
      );
    }
  }

  return response;
}

function shouldRewriteToUltra(pathname: string): boolean {
  if (pathname === "/u" || pathname.startsWith("/u/")) {
    return false;
  }
    if (pathname.startsWith("/dev")) {
      return false;
    }
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return false;
    }
    if (pathname === "/auth" || pathname.startsWith("/auth/")) {
      return false;
    }
    if (pathname === "/employer" || pathname.startsWith("/employer/")) {
      return false;
    }
    if (pathname === "/login") {
      return false;
    }
  if (pathname.startsWith("/api/")) {
    return false;
  }
  return true;
}

function ultraPath(pathname: string): string {
  return pathname === "/" ? "/u" : `/u${pathname}`;
}

function publicFromUltra(pathname: string): string {
  if (pathname === "/u") {
    return "/";
  }
  if (pathname.startsWith("/u/")) {
    return pathname.slice(2);
  }
  return pathname;
}

function qualityRequestHeaders(
  request: NextRequest,
  resolved: ReturnType<typeof resolveMode>,
  session: { hash: string },
  extra?: Record<string, string>,
): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(MODE_HEADER, resolved.mode);
  requestHeaders.set(PREFERENCE_HEADER, resolved.preference);
  requestHeaders.set(SESSION_HEADER, session.hash);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      requestHeaders.set(key, value);
    }
  }
  return requestHeaders;
}

function passAdmin(request: NextRequest): NextResponse {
  const session = resolveSession(request);
  const forced = { mode: "lite" as const, preference: "lite" as const, rememberPreference: false };
  const response = NextResponse.next({
    request: { headers: qualityRequestHeaders(request, forced, session) },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return withSession(applyQuality(response, request, forced), session);
}

function isAccountPath(pathname: string): boolean {
  return (
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/employer" ||
    pathname.startsWith("/employer/") ||
    pathname === "/login"
  );
}

async function passAccount(request: NextRequest): Promise<NextResponse> {
  const session = resolveSession(request);
  const forced = { mode: "lite" as const, preference: "lite" as const, rememberPreference: false };
  const response = NextResponse.next({
    request: { headers: qualityRequestHeaders(request, forced, session) },
  });
  response.headers.set("Cache-Control", "private, no-store");
  const next = withSession(applyQuality(response, request, forced), session);
  return refreshAuthSession(request, next);
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // API само читает ?city= как фильтр. Иначе /api/vacancies?city=gorlovka
  // уехало бы редиректом на страницу города.
  if (url.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    return passAdmin(request);
  }

  if (isAccountPath(url.pathname)) {
    return passAccount(request);
  }

  const selected = url.searchParams.get("city");

  if (selected && isSelectableCity(selected)) {
    const target = url.clone();
    const section = jobsSectionFromPath(url.pathname);
    if (section) {
      target.pathname = `/${selected}/${section}`;
    } else if (hasStoredFilters(url.searchParams)) {
      target.pathname = `/${selected}/jobs`;
    } else {
      target.pathname = `/${selected}`;
    }
    target.searchParams.delete("city");
    return applyQuality(
      withCityCookie(NextResponse.redirect(target), selected, request),
      request,
    );
  }

  if (url.pathname === "/") {
    const city = resolveCity(request);
    const target = url.clone();
    target.pathname = `/${city}`;
    return applyQuality(withCityCookie(NextResponse.redirect(target), city, request), request);
  }

  const resolved = resolveMode(request);

  if (resolved.mode === "ultra" && shouldRewriteToUltra(url.pathname)) {
    const session = resolveSession(request);
    const dest = url.clone();
    dest.pathname = ultraPath(url.pathname);
    const response = NextResponse.rewrite(dest, {
      request: {
        headers: qualityRequestHeaders(request, resolved, session, {
          [ULTRA_PATH_HEADER]: url.pathname,
        }),
      },
    });
    const segment = url.pathname.split("/").filter(Boolean)[0];
    let next = withSession(applyQuality(response, request, resolved), session);
    if (segment && isSelectableCity(segment)) {
      next = withLastSearch(request, withCityCookie(next, segment, request));
    }
    return next;
  }

  if ((url.pathname === "/u" || url.pathname.startsWith("/u/")) && resolved.mode !== "ultra") {
    const dest = url.clone();
    dest.pathname = publicFromUltra(url.pathname);
    return applyQuality(NextResponse.redirect(dest), request, resolved);
  }

  const segment = url.pathname.split("/").filter(Boolean)[0];
  if (segment && isSelectableCity(segment)) {
    return withLastSearch(request, withCityCookie(passQuality(request), segment, request));
  }

  return passQuality(request);
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|icons/|api/|sw.js|manifest.webmanifest).*)"],
};
