import { NextResponse, type NextRequest } from "next/server";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";

function resolveCity(request: NextRequest): string {
  const fromCookie = request.cookies.get(CITY_COOKIE)?.value;
  if (fromCookie && isSelectableCity(fromCookie)) {
    return fromCookie;
  }
  return getDefaultCity().slug;
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
    secure: process.env.NODE_ENV === "production",
  });

  return response;
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
    target.pathname = `/${selected}`;
    target.searchParams.delete("city");
    return withCityCookie(NextResponse.redirect(target), selected, request);
  }

  if (url.pathname === "/") {
    const city = resolveCity(request);
    const target = url.clone();
    target.pathname = `/${city}`;
    return withCityCookie(NextResponse.redirect(target), city, request);
  }

  const segment = url.pathname.split("/").filter(Boolean)[0];
  if (segment && isSelectableCity(segment)) {
    return withCityCookie(NextResponse.next(), segment, request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|icons/|api/).*)"],
};
