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

function placeLine(vacancy: VacancyListItem): string {
  const city = cityLabel(vacancy.citySlug);
  const district = districtName(vacancy.citySlug, vacancy.districtSlug);
  if (vacancy.workFormat === "VAHTA" && vacancy.workLocationText) {
    return `${vacancy.workLocationText} · набор: ${city}`;
  }
  return district ? `${city} · ${district}` : city;
}

export function VacancyCard({
  vacancy,
  features,
}: {
  vacancy: VacancyListItem;
  features: Pick<QualityFeatures, "descriptionPreview" | "images">;
}) {
  const compact = features.images === "none" && features.descriptionPreview === 0;
  const previewLines = features.descriptionPreview;
  const preview =
    previewLines > 0 && vacancy.summaryLine ? vacancy.summaryLine.trim() : "";
  const salary = formatMoney(vacancy);
  const published = formatDate(vacancy.publishedAt);
  const publishedIso = isoDate(vacancy.publishedAt);
  const source = formatSource(vacancy.source, vacancy.sourceName);
  const place = placeLine(vacancy);

  return (
    <article className="min-w-0">
      <Card className="flex h-full min-w-0 flex-col gap-2" padding={compact ? "sm" : "md"}>
        <h3 className="break-words font-medium text-lg leading-tight">{vacancy.title}</h3>

        {compact ? null : (
          <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
            <span className="break-words text-text">{vacancy.employer?.name ?? "Работодатель не указан"}</span>
            {vacancy.employer?.isVerified ? (
              <Badge tone="success" className="inline-flex items-center gap-1">
                <Icon name="check" size="sm" decorative />
                Проверено
              </Badge>
            ) : null}
          </p>
        )}

        <p className="flex min-w-0 items-start gap-2 text-sm text-muted">
          {compact ? null : <Icon name="location" size="sm" decorative />}
          <span className="min-w-0 break-words">{place}</span>
        </p>

        <p className="flex min-w-0 items-start gap-2 text-md font-medium">
          {compact ? null : <Icon name="wallet" size="sm" decorative />}
          <span className="min-w-0 break-words">{salary}</span>
        </p>

        {compact || !vacancy.schedule ? null : (
          <p className="flex min-w-0 items-start gap-2 text-sm text-muted">
            <Icon name="clock" size="sm" decorative />
            <span className="min-w-0 break-words">{vacancy.schedule}</span>
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
    </article>
  );
}
