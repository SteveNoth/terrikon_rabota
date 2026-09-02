import { JsonLd } from "@/components/seo/JsonLd";
import { ViewBeacon } from "@/components/vacancy/ViewBeacon";
import { VacancyPage } from "@/components/vacancy/VacancyPage";
import { getUser } from "@/lib/adapters/auth";
import { isActiveCity, isSelectableCity } from "@/lib/geo";
import { getRequestQuality } from "@/lib/quality/request";
import { getApplyUiState } from "@/lib/repo/seeker";
import { getSimilarVacancies, getVacancyBySlug } from "@/lib/repo/vacancies";
import { jobPostingFromVacancy } from "@/lib/seo/job-posting";
import { pageMetadata } from "@/lib/seo/meta";
import { absoluteUrl, siteOrigin } from "@/lib/seo/origin";
import { deviceClassFromUserAgent, isDoNotTrack } from "@/lib/stats/device";
import { recordVacancyView } from "@/lib/stats/events";
import { SESSION_HEADER, isSessionHash } from "@/lib/stats/session";
import { vacancyPath } from "@/lib/vacancy/path";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}): Promise<Metadata> {
  const { city, slug } = await params;
  if (!isSelectableCity(city)) {
    return { title: "Вакансия", robots: { index: false, follow: false } };
  }

  const record = await getVacancyBySlug(slug, { allowClosed: true });
  if (!record || record.citySlug !== city) {
    return { title: "Вакансия не найдена", robots: { index: false, follow: false } };
  }

  const view = toVacancyView(record);
  const path = vacancyPath(city, slug);
  const title = vacancyMetaTitle(view);
  const description = vacancyMetaDescription(view);

  return pageMetadata({
    title,
    description,
    pathname: path,
    index: view.isClosed ? false : true,
    ogType: "article",
  });
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

  const record = await getVacancyBySlug(slug, { allowClosed: true });
  if (!record || record.citySlug !== city) {
    notFound();
  }

  const user = await getUser();
  const [{ mode, features }, similar, headerList, query, applyState] = await Promise.all([
    getRequestQuality(),
    getSimilarVacancies(slug, 3),
    headers(),
    searchParams,
    getApplyUiState(user?.id ?? null, record.id),
  ]);

  const view = toVacancyView(record);
  const path = vacancyPath(city, slug);
  const shareUrl = `${siteOrigin()}${path}`;
  const reportStatus = reportStatusFrom(query.report);
  const jobPosting = jobPostingFromVacancy(record, view, absoluteUrl(path));

  const sessionHash = headerList.get(SESSION_HEADER);
  const skipTrack = isDoNotTrack(headerList.get("dnt") ?? headerList.get("DNT"));

  if (!view.isClosed && !skipTrack && isSessionHash(sessionHash) && !features.analytics) {
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
      <JsonLd data={jobPosting} />
      {features.analytics && !skipTrack && !view.isClosed ? <ViewBeacon vacancyId={view.id} /> : null}
      <VacancyPage
        view={view}
        similar={similar}
        features={features}
        shareUrl={shareUrl}
        reportStatus={reportStatus}
        applyState={applyState}
      />
    </>
  );
}
