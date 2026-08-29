import { Icon } from "@/components/ui/icon";
import { sourceIconName } from "@/lib/format/source";
import type { Source } from "@prisma/client";
import type { VacancyDuplicateGroupView } from "@/lib/vacancy/view";

export function VacancySource({
  source,
  sourceLabel,
  originalHref,
  postedByEmployer,
  autoNormalized,
  originalText,
  duplicateGroup,
}: {
  source: Source;
  sourceLabel: string;
  originalHref: string | null;
  postedByEmployer: boolean;
  autoNormalized: boolean;
  originalText: string | null;
  duplicateGroup: VacancyDuplicateGroupView | null;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 text-sm">
      <h2 className="font-display text-xl font-medium">Источник</h2>
      <p className="flex min-w-0 flex-wrap items-center gap-2 text-md">
        {postedByEmployer ? null : <Icon name={sourceIconName(source)} size="sm" decorative />}
        <span className="min-w-0 break-words">{postedByEmployer ? "Размещено работодателем" : sourceLabel}</span>
      </p>
      {originalHref ? (
        <p>
          <a
            href={originalHref}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-brand underline-offset-2 hover:underline"
          >
            <Icon name="website" size="sm" decorative />
            Открыть оригинал
          </a>
        </p>
      ) : null}
      {autoNormalized ? (
        <p className="text-muted">Объявление приведено к единому виду автоматически</p>
      ) : null}
      {autoNormalized && originalText ? (
        <details className="min-w-0 rounded-md border border-border bg-surface-muted p-3">
          <summary className="cursor-pointer font-medium">Показать оригинал</summary>
          <pre className="mt-3 min-w-0 whitespace-pre-wrap break-words font-sans text-sm text-text">
            {originalText}
          </pre>
        </details>
      ) : null}
      {duplicateGroup ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p>{duplicateGroup.line}</p>
          {duplicateGroup.sources.length > 0 ? (
            <ul className="flex min-w-0 list-disc flex-col gap-1 pl-5 text-muted">
              {duplicateGroup.sources.map((item) => (
                <li key={item} className="min-w-0 break-words">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}