import { TERMS_COPY } from "@/lib/content/pages";
import { StaticInfoPage, staticPageMetadata } from "@/components/seo/StaticInfoPage";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = staticPageMetadata(TERMS_COPY);

export default async function TermsPage() {
  return (
    <StaticInfoPage
      copy={TERMS_COPY}
      extra={
        <p className="text-sm">
          <Link href="/contacts" className="text-brand underline-offset-2 hover:underline">
            Как связаться
          </Link>
          <span className="text-muted"> · </span>
          <Link href="/safety" className="text-brand underline-offset-2 hover:underline">
            Как не попасться
          </Link>
        </p>
      }
    />
  );
}
