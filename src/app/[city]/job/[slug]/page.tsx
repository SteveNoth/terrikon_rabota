import { ViewBeacon } from "@/components/vacancy/ViewBeacon";
import { VacancyPage } from "@/components/vacancy/VacancyPage";
import { isActiveCity, isSelectableCity } from "@/lib/geo";
import { getRequestQuality } from "@/lib/quality/request";
import { getSimilarVacancies, getVacancyBySlug } from "@/lib/repo/vacancies";
import { deviceClassFromUserAgent, isDoNotTrack } from "@/lib/stats/device";
import { recordVacancyView } from "@/lib/stats/events";
import { SESSION_HEADER, isSessionHash } from "@/lib/stats/session";
import { toVacancyView, vacancyMetaDescription, vacancyMetaTitle } from "@/lib/vacancy/view";
import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function reportStatusFrom(value: string | string[] | undefined): "ok" | "error" | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "ok" || raw === "error") {
    return raw;
  }
  return undefined;
}

function publicOrigin(headerList: Headers): string {
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}): Promise<Metadata> {
  const { city, slug } = await params;
  if (!isSelectableCity(city)) {
    return { title: "Вакансия" };
  }

  const record = await getVacancyBySlug(slug);
  if (!record || record.citySlug !== city) {
    return { title: "Вакансия не найдена" };
  }

  const view = toVacancyView(record);
  const title = vacancyMetaTitle(view);
  const description = vacancyMetaDescription(view);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      locale: "ru_RU",
    },
  };
}

export default async function VacancyJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { city, slug } = await params;
  if (!isSelectableCity(city) || !isActiveCity(city)) {
    notFound();
  }

  const record = await getVacancyBySlug(slug);
  if (!record || record.citySlug !== city) {
    notFound();
  }

  const [{ mode, features }, similar, headerList, query] = await Promise.all([
    getRequestQuality(),
    getSimilarVacancies(slug, 3),
    headers(),
    searchParams,
  ]);

  const view = toVacancyView(record);
  const shareUrl = `${publicOrigin(headerList)}${view.href}`;
  const reportStatus = reportStatusFrom(query.report);

  const sessionHash = headerList.get(SESSION_HEADER);
  const skipTrack = isDoNotTrack(headerList.get("dnt") ?? headerList.get("DNT"));

  if (!skipTrack && isSessionHash(sessionHash) && !features.analytics) {
    const deviceClass = deviceClassFromUserAgent(headerList.get("user-agent"));
    after(() =>
      recordVacancyView({
        vacancyId: view.id,
        citySlug: view.citySlug,
        districtSlug: view.districtSlug,
        sphere: view.sphere,
        professionSlug: view.professionSlug,
        sessionHash,
        deviceClass,
        qualityMode: mode,
      }),
    );
  }

  return (
    <>
      {features.analytics && !skipTrack ? <ViewBeacon vacancyId={view.id} /> : null}
      <VacancyPage
        view={view}
        similar={similar}
        features={features}
        shareUrl={shareUrl}
        reportStatus={reportStatus}
      />
    </>
  );
}
