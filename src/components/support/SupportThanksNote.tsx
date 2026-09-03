import Link from "next/link";
import { isSupportEnabled } from "@/lib/support";
import { canShowSupportAsk, supportDismissHref } from "@/lib/support/ask";
import { SUPPORT_DISMISS_LABEL, SUPPORT_HEADER_LABEL, SUPPORT_THANKS_TEXT } from "@/lib/support/copy";
import { SupportAskBeacon } from "@/components/support/SupportAskBeacon";

export async function SupportThanksNote({ nextPath }: { nextPath: string }) {
  if (!isSupportEnabled()) {
    return null;
  }
  if (!(await canShowSupportAsk())) {
    return null;
  }

  return (
    <p className="max-w-xl text-sm text-muted">
      <SupportAskBeacon />
      {SUPPORT_THANKS_TEXT}{" "}
      <Link href="/support" className="text-brand underline-offset-2 hover:underline">
        {SUPPORT_HEADER_LABEL}
      </Link>
      <span className="text-muted"> · </span>
      <Link href={supportDismissHref(nextPath)} className="text-brand underline-offset-2 hover:underline">
        {SUPPORT_DISMISS_LABEL}
      </Link>
    </p>
  );
}
