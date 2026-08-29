import { FavoriteButton } from "@/components/vacancy/FavoriteButton";
import { ShareButton } from "@/components/vacancy/ShareButton";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import Link from "next/link";

export function VacancyActions({
  applyHref,
  shareUrl,
  shareTitle,
  vacancyId,
}: {
  applyHref: string;
  shareUrl: string;
  shareTitle: string;
  vacancyId: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Link href={applyHref} className={cn(buttonVariants({ variant: "primary" }))}>
        Откликнуться
      </Link>
      <FavoriteButton vacancyId={vacancyId} />
      <ShareButton url={shareUrl} title={shareTitle} />
      <a href="#report" className={cn(buttonVariants({ variant: "ghost" }))}>
        Пожаловаться
      </a>
    </div>
  );
}
