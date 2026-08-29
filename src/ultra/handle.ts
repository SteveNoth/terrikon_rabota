import { after, type NextRequest, NextResponse } from "next/server";
import { CITY_COOKIE, isSelectableCity } from "@/lib/geo";
import { SEARCH_COOKIE } from "@/lib/jobs/search-cookie";
import { ULTRA_PATH_HEADER, PREFERENCE_HEADER, isQualityPreference } from "@/lib/quality/types";
import { deviceClassFromUserAgent, isDoNotTrack } from "@/lib/stats/device";
import { recordVacancyView } from "@/lib/stats/events";
import { SESSION_HEADER, isSessionHash } from "@/lib/stats/session";
import { criticalCss } from "@/ultra/css";
import { citySlugFromRequest, dispatchUltra } from "@/ultra/dispatch";
import { documentPage, htmlHeaders, publicOrigin } from "@/ultra/html";
import { renderChrome } from "@/ultra/chrome";

export function publicPathname(request: NextRequest): string {
  const fromHeader = request.headers.get(ULTRA_PATH_HEADER);
  if (fromHeader && fromHeader.startsWith("/")) {
    return fromHeader;
  }
  const path = request.nextUrl.pathname;
  if (path === "/u") {
    return "/";
  }
  if (path.startsWith("/u/")) {
    return path.slice(2);
  }
  return path;
}

function htmlResponse(html: string, status: number, cache: "page" | "none"): Response {
  return new Response(html, { status, headers: htmlHeaders(cache) });
}

export async function handleUltraGet(request: NextRequest): Promise<Response> {
  const pathname = publicPathname(request);
  const cityCookie = request.cookies.get(CITY_COOKIE)?.value;
  const page = await dispatchUltra({
    pathname,
    search: request.nextUrl.searchParams,
    cityCookie,
    searchCookie: request.cookies.get(SEARCH_COOKIE)?.value,
  });

  const css = criticalCss();
  const origin = publicOrigin(request);
  const preferenceHeader = request.headers.get(PREFERENCE_HEADER);
  const html = documentPage({
    title: page.title,
    description: page.description,
    canonical: `${origin}${pathname}${request.nextUrl.search}`,
    css,
    body: renderChrome({
      citySlug: page.citySlug,
      currentPath: pathname,
      body: page.body,
      preference: isQualityPreference(preferenceHeader) ? preferenceHeader : "ultra",
    }),
  });

  if (page.view) {
    const sessionHash = request.headers.get(SESSION_HEADER);
    const skipTrack = isDoNotTrack(request.headers.get("dnt") ?? request.headers.get("DNT"));
    if (!skipTrack && isSessionHash(sessionHash)) {
      const view = page.view;
      const deviceClass = deviceClassFromUserAgent(request.headers.get("user-agent"));
      after(() =>
        recordVacancyView({
          vacancyId: view.id,
          citySlug: view.citySlug,
          districtSlug: view.districtSlug,
          sphere: view.sphere,
          professionSlug: view.professionSlug,
          sessionHash,
          deviceClass,
          qualityMode: "ultra",
        }),
      );
    }
  }

  return htmlResponse(html, page.status, page.cache);
}

export async function handleUltraPost(request: NextRequest): Promise<Response> {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent !== "notify-city") {
    return new Response("Not Found", { status: 404 });
  }

  const city = String(form.get("city") ?? "");
  const contact = String(form.get("contact") ?? "").trim();
  console.log("[notify-city-open]", { city, contact });

  const origin = publicOrigin(request);
  if (isSelectableCity(city)) {
    return NextResponse.redirect(new URL(`/${city}?notified=1`, origin), 303);
  }

  const fallback = citySlugFromRequest(publicPathname(request), request.cookies.get(CITY_COOKIE)?.value);
  return NextResponse.redirect(new URL(`/${fallback}`, origin), 303);
}
