import { ApplyButton } from "@/components/vacancy/ApplyButton";
import { FavoriteButton } from "@/components/vacancy/FavoriteButton";
import { ShareButton } from "@/components/vacancy/ShareButton";
import { buttonVariants } from "@/components/ui/button-variants";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/format/cn";
import type { OfflineVacancy } from "@/lib/offline/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";

export function VacancyActions({
  applyHref,
  shareUrl,
  shareTitle,
  vacancyId,
  snapshot,
}: {
  applyHref: string;
  shareUrl: string;
  shareTitle: string;
  vacancyId: string;
  snapshot?: VacancyListItem | OfflineVacancy | null;
}) {
  const href = snapshot && "href" in snapshot ? snapshot.href : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
      <ApplyButton href={applyHref} vacancyId={vacancyId} title={shareTitle} />
      <FavoriteButton vacancyId={vacancyId} title={shareTitle} href={href} snapshot={snapshot} />
      <ShareButton url={shareUrl} title={shareTitle} />
      <a href="#report" className={cn(buttonVariants({ variant: "ghost" }))}>
        <Icon name="flag" size="sm" decorative />
        Пожаловаться
      </a>
    </div>
  );
}
