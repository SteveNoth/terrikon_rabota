import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { isSupportEnabled } from "@/lib/support";
import { SUPPORT_HEADER_LABEL } from "@/lib/support/copy";

export function SupportHeaderButton() {
  if (!isSupportEnabled()) {
    return null;
  }

  return (
    <Link
      href="/support"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "tr-support-flame min-w-tap px-2 text-support",
      )}
      aria-label={SUPPORT_HEADER_LABEL}
      title={SUPPORT_HEADER_LABEL}
    >
      <Icon name="heart" decorative />
    </Link>
  );
}
