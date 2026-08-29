import { OfflineCapture } from "@/components/offline/OfflineCapture";
import { VacancyActions } from "@/components/vacancy/VacancyActions";
import { VacancyCard } from "@/components/vacancy/VacancyCard";
import { offlineVacancyFromView } from "@/lib/offline/vacancy";
import { VacancyContacts } from "@/components/vacancy/VacancyContacts";
import { VacancyDescription } from "@/components/vacancy/VacancyDescription";
import { VacancyEmployer } from "@/components/vacancy/VacancyEmployer";
import { VacancyHero } from "@/components/vacancy/VacancyHero";
import { VacancyMap } from "@/components/vacancy/VacancyMap";
import { VacancyReport } from "@/components/vacancy/VacancyReport";
import { VacancySource } from "@/components/vacancy/VacancySource";
import type { QualityFeatures } from "@/lib/quality/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import type { VacancyView } from "@/lib/vacancy/view";
import Link from "next/link";

export function VacancyPage({
  view,
  similar,
  features,
  shareUrl,
  reportStatus,
}: {
  view: VacancyView;
  similar: VacancyListItem[];
  features: QualityFeatures;
  shareUrl: string;
  reportStatus?: "ok" | "error";
}) {
  const snapshot = offlineVacancyFromView(view);

  return (
    <article className="mx-auto flex w-full max-w-container min-w-0 flex-col gap-8 px-4 py-8">
      <OfflineCapture records={[snapshot]} vacancies={similar} />
      <p className="text-sm">
        <Link href={`/${view.citySlug}/jobs`} className="text-brand underline-offset-2 hover:underline">
          К вакансиям
        </Link>
        {view.isVahta ? (
          <>
            <span className="text-muted"> · </span>
            <Link href={`/${view.citySlug}/vahta`} className="text-brand underline-offset-2 hover:underline">
              К вахте
            </Link>
          </>
        ) : null}
      </p>

      <VacancyHero view={view} />
      <VacancyActions
        applyHref={view.applyHref}
        shareUrl={shareUrl}
        shareTitle={view.title}
        vacancyId={view.id}
        snapshot={snapshot}
      />
      <VacancyContacts
        phone={view.phone}
        telegramHref={view.telegramHref}
        telegramLabel={view.telegramLabel}
        emailHref={view.emailHref}
        emailLabel={view.emailLabel}
      />
      <VacancyDescription
        descriptionSections={view.descriptionSections}
        descriptionParagraphs={view.descriptionParagraphs}
      />
      <VacancySource
        source={view.source}
        sourceLabel={view.sourceLabel}
        originalHref={view.originalHref}
        postedByEmployer={view.postedByEmployer}
        autoNormalized={view.autoNormalized}
        originalText={view.originalText}
        duplicateGroup={view.duplicateGroup}
      />
      {view.employer ? <VacancyEmployer employer={view.employer} /> : null}
      <VacancyMap
        address={view.address}
        latitude={view.latitude}
        longitude={view.longitude}
        mapMode={features.map}
      />
      {view.missingInfo.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="font-display text-xl font-medium">Что уточнить у работодателя</h2>
          <ul className="flex min-w-0 list-disc flex-col gap-1 pl-5">
            {view.missingInfo.map((item) => (
              <li key={item} className="min-w-0 break-words">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {similar.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Похожие вакансии</h2>
          <ul className="flex min-w-0 flex-col gap-3">
            {similar.map((vacancy) => (
              <li key={vacancy.id} className="min-w-0">
                <VacancyCard vacancy={vacancy} features={features} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <VacancyReport
        vacancyId={view.id}
        citySlug={view.citySlug}
        slug={view.slug}
        status={reportStatus}
      />
    </article>
  );
}
