import { CONTACTS_COPY } from "@/lib/content/pages";
import { StaticInfoPage, staticPageMetadata } from "@/components/seo/StaticInfoPage";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = staticPageMetadata(CONTACTS_COPY);

export default async function ContactsPage() {
  return (
    <StaticInfoPage
      copy={CONTACTS_COPY}
      extra={
        <p className="text-sm">
          <Link href="/help" className="text-brand underline-offset-2 hover:underline">
            Помощь
          </Link>
          <span className="text-muted"> · </span>
          <Link href="/terms" className="text-brand underline-offset-2 hover:underline">
            Правила
          </Link>
        </p>
      }
    />
  );
}
