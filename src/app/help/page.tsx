import { HELP_COPY } from "@/lib/content/pages";
import { StaticInfoPage, staticPageMetadata } from "@/components/seo/StaticInfoPage";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = staticPageMetadata(HELP_COPY);

export default async function HelpPage() {
  return (
    <StaticInfoPage
      copy={HELP_COPY}
      extra={
        <p className="text-sm">
          <Link href="/safety" className="text-brand underline-offset-2 hover:underline">
            Как не попасться при поиске работы
          </Link>
          <span className="text-muted"> · </span>
          <Link href="/contacts" className="text-brand underline-offset-2 hover:underline">
            Контакты
          </Link>
        </p>
      }
    />
  );
}
