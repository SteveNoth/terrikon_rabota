import { ApplyButton } from "@/components/vacancy/ApplyButton";
import { FavoriteButton } from "@/components/vacancy/FavoriteButton";
import { ShareButton } from "@/components/vacancy/ShareButton";
import { buttonVariants } from "@/components/ui/button-variants";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/format/cn";
import type { OfflineVacancy } from "@/lib/offline/types";
import type { ApplyUiState } from "@/lib/seeker/labels";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import { VACANCY_CLOSED_LABEL } from "@/lib/seeker/constants";

export function VacancyActions({
  applyHref,
  shareUrl,
  shareTitle,
  vacancyId,
  snapshot,
  applyState,
  closed,
}: {
  applyHref: string;
  shareUrl: string;
  shareTitle: string;
  vacancyId: string;
  snapshot?: VacancyListItem | OfflineVacancy | null;
  applyState: ApplyUiState;
  closed?: boolean;
}) {
  const href = snapshot && "href" in snapshot ? snapshot.href : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
      {closed ? (
        <p className="text-md text-muted">{VACANCY_CLOSED_LABEL}</p>
      ) : (
        <ApplyButton
          href={applyHref}
          vacancyId={vacancyId}
          title={shareTitle}
          signedIn={applyState.signedIn}
          appliedAt={applyState.appliedAt}
          blocked={applyState.blocked}
          blockedMessage={applyState.blockedMessage}
        />
      )}
      <FavoriteButton vacancyId={vacancyId} title={shareTitle} href={href} snapshot={snapshot} />
      <ShareButton url={shareUrl} title={shareTitle} />
      <a href="#report" className={cn(buttonVariants({ variant: "ghost" }))}>
        <Icon name="flag" size="sm" decorative />
        Пожаловаться
      </a>
    </div>
  );
}
