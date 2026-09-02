import type { ReactNode } from "react";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import { TELEGRAM_CHANNEL_URL, telegramChannelTitle } from "@/lib/site";
import type { StaticPageCopy } from "@/lib/content/pages";
import { pageMetadata } from "@/lib/seo/meta";
import { cookies } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";

export function staticPageMetadata(copy: StaticPageCopy): Metadata {
  return pageMetadata({
    title: copy.title,
    description: copy.description,
    pathname: copy.path,
  });
}

async function cityFromCookie(): Promise<string> {
  const jar = await cookies();
  const value = jar.get(CITY_COOKIE)?.value;
  if (value && isSelectableCity(value)) {
    return value;
  }
  return getDefaultCity().slug;
}

export async function StaticInfoPage({
  copy,
  extra,
}: {
  copy: StaticPageCopy;
  extra?: ReactNode;
}) {
  const citySlug = await cityFromCookie();

  return (
    <SiteChrome citySlug={citySlug}>
      <article className="mx-auto flex max-w-container min-w-0 flex-col gap-6 px-4 py-8">
        <header className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-medium">{copy.heading}</h1>
          <p className="max-w-xl text-md text-muted">{copy.description}</p>
        </header>
        {copy.sections.map((section) => (
          <section
            key={section.title}
            id={section.id}
            className="flex min-w-0 flex-col gap-3"
          >
            <h2 className="font-display text-xl font-medium">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="max-w-xl min-w-0 break-words">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        {extra}
        <p className="text-sm">
          <Link href={`/${citySlug}/jobs`} className="text-brand underline-offset-2 hover:underline">
            К вакансиям
          </Link>
          <span className="text-muted"> · </span>
          <a
            href={TELEGRAM_CHANNEL_URL}
            className="text-brand underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {telegramChannelTitle()}
          </a>
        </p>
      </article>
    </SiteChrome>
  );
}
