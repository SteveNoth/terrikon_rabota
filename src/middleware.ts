import { NextResponse, type NextRequest } from "next/server";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import { resolveMode } from "@/lib/quality/server";
import {
  MODE_COOKIE,
  MODE_COOKIE_MAX_AGE,
  MODE_HEADER,
  PREFERENCE_HEADER,
} from "@/lib/quality/types";

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
    response.cookies.set(MODE_COOKIE, resolved.preference, {
      path: "/",
      maxAge: MODE_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: cookieSecure(),
    });
  }

  return response;
}

function passQuality(request: NextRequest): NextResponse {
  const resolved = resolveMode(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(MODE_HEADER, resolved.mode);
  requestHeaders.set(PREFERENCE_HEADER, resolved.preference);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  return applyQuality(response, request, resolved);
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // API само читает ?city= как фильтр. Иначе /api/vacancies?city=gorlovka
  // уехало бы редиректом на страницу города.
  if (url.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const selected = url.searchParams.get("city");

  if (selected && isSelectableCity(selected)) {
    const target = url.clone();
    const isSearch = url.searchParams.has("q");
    target.pathname = isSearch ? `/${selected}/jobs` : `/${selected}`;
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

  const segment = url.pathname.split("/").filter(Boolean)[0];
  if (segment && isSelectableCity(segment)) {
    return withCityCookie(passQuality(request), segment, request);
  }

  return passQuality(request);
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|icons/|api/).*)"],
};
