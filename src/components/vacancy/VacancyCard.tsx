import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/format/cn";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { formatSource } from "@/lib/format/source";
import { cityName, districtName, isCitySlug } from "@/lib/geo";
import type { QualityFeatures } from "@/lib/quality/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import { vacancyPath } from "@/lib/vacancy/path";
import Link from "next/link";

function isoDate(value: Date | string): string | undefined {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function cityLabel(slug: string): string {
  return isCitySlug(slug) ? cityName(slug, "nom") : slug;
}

function Place({ vacancy, compact }: { vacancy: VacancyListItem; compact: boolean }) {
  const city = cityLabel(vacancy.citySlug);
  const district = districtName(vacancy.citySlug, vacancy.districtSlug);

  if (vacancy.workFormat === "VAHTA") {
    const work = vacancy.workLocationText?.trim();
    const hiringClass = work && compact === false ? "pl-6" : undefined;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        {work ? (
          <p className="flex min-w-0 items-start gap-2 text-md font-medium text-text">
            {compact ? null : <Icon name="location" size="sm" decorative />}
            <span className="min-w-0 break-words">Работа: {work}</span>
          </p>
        ) : null}
        <p className={cn("text-sm text-muted", hiringClass)}>Набор: {city}</p>
      </div>
    );
  }

  const place = district ? `${city} · ${district}` : city;
  return (
    <p className="flex min-w-0 items-start gap-2 text-sm text-muted">
      {compact ? null : <Icon name="location" size="sm" decorative />}
      <span className="min-w-0 break-words">{place}</span>
    </p>
  );
}

export function VacancyCard({
  vacancy,
  features,
  safetyLink = false,
}: {
  vacancy: VacancyListItem;
  features: Pick<QualityFeatures, "descriptionPreview" | "images">;
  safetyLink?: boolean;
}) {
  const compact = features.images === "none" && features.descriptionPreview === 0;
  const previewLines = features.descriptionPreview;
  const preview =
    previewLines > 0 && vacancy.summaryLine ? vacancy.summaryLine.trim() : "";
  const salary = formatMoney(vacancy);
  const published = formatDate(vacancy.publishedAt);
  const publishedIso = isoDate(vacancy.publishedAt);
  const source = formatSource(vacancy.source, vacancy.sourceName);
  const rhythm =
    vacancy.workFormat === "VAHTA" ? vacancy.rotationPattern : vacancy.schedule;

  const href = vacancyPath(vacancy.citySlug, vacancy.slug);

  return (
    <article className="min-w-0">
      <Link
        href={href}
        className="group block min-w-0 rounded-lg text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Card
          variant="interactive"
          className="flex h-full min-w-0 flex-col gap-2"
          padding={compact ? "sm" : "md"}
        >
          <h3 className="break-words font-medium text-lg leading-tight">{vacancy.title}</h3>

          {compact || !vacancy.employer ? null : (
            <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
              <span className="break-words text-text">{vacancy.employer.name}</span>
              {vacancy.employer.isVerified ? (
                <Badge tone="success" className="inline-flex items-center gap-1">
                  <Icon name="check" size="sm" decorative />
                  Проверено
                </Badge>
              ) : null}
            </p>
          )}

          <Place vacancy={vacancy} compact={compact} />

          <p className="flex min-w-0 items-start gap-2 text-md font-medium">
            {compact ? null : <Icon name="wallet" size="sm" decorative />}
            <span className="min-w-0 break-words">{salary}</span>
          </p>

          {compact || !rhythm ? null : (
            <p className="flex min-w-0 items-start gap-2 text-sm text-muted">
              <Icon name="clock" size="sm" decorative />
              <span className="min-w-0 break-words">{rhythm}</span>
            </p>
          )}

          {preview ? (
            <p
              className={cn(
                "min-w-0 break-words text-sm text-muted",
                previewLines >= 2 ? "line-clamp-2" : "line-clamp-1",
              )}
            >
              {preview}
            </p>
          ) : null}

          <p className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-1 text-xs text-muted">
            <time dateTime={publishedIso}>{published}</time>
            {compact ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span className="min-w-0 break-words">{source}</span>
              </>
            )}
          </p>
        </Card>
      </Link>
      {safetyLink ? (
        <p className="pt-2 text-xs">
          <Link href="/safety" className="text-brand underline-offset-2 hover:underline">
            Как не попасться при поиске работы
          </Link>
        </p>
      ) : null}
    </article>
  );
}
