import Link from "next/link";
import { isSupportEnabled } from "@/lib/support";
import { SUPPORT_FOOTER_LEAD, SUPPORT_FOOTER_LINK } from "@/lib/support/copy";

export function SupportFooterLink() {
  if (!isSupportEnabled()) {
    return null;
  }

  return (
    <p className="text-sm">
      {SUPPORT_FOOTER_LEAD}{" "}
      <Link href="/support" className="text-brand underline-offset-2 hover:underline">
        {SUPPORT_FOOTER_LINK}
      </Link>
    </p>
  );
}
