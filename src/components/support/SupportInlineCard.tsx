import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { isSupportEnabled } from "@/lib/support";
import { canShowSupportAsk, supportDismissHref } from "@/lib/support/ask";
import {
  SUPPORT_DISMISS_LABEL,
  SUPPORT_INLINE_BUTTON,
  SUPPORT_INLINE_TEXT,
} from "@/lib/support/copy";
import { SupportAskBeacon } from "@/components/support/SupportAskBeacon";

export async function SupportInlineCard({ nextPath }: { nextPath: string }) {
  if (!isSupportEnabled()) {
    return null;
  }
  if (!(await canShowSupportAsk())) {
    return null;
  }

  return (
    <Card variant="outline" className="flex min-w-0 flex-col gap-3">
      <SupportAskBeacon />
      <p className="max-w-xl text-md">{SUPPORT_INLINE_TEXT}</p>
      <p className="flex min-w-0 flex-wrap gap-3">
        <Link href="/support" className={cn(buttonVariants({ variant: "outline" }))}>
          {SUPPORT_INLINE_BUTTON}
        </Link>
        <Link
          href={supportDismissHref(nextPath)}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          {SUPPORT_DISMISS_LABEL}
        </Link>
      </p>
    </Card>
  );
}
