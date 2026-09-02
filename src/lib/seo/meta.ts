import type { Metadata } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo/brand";
import { canonicalPath, type SearchLike } from "@/lib/seo/canonical";
import { absoluteUrl } from "@/lib/seo/origin";

export function pageMetadata(input: {
  title: string;
  description: string;
  pathname: string;
  search?: SearchLike;
  index?: boolean;
  follow?: boolean;
  ogType?: "website" | "article";
}): Metadata {
  const path = canonicalPath(input.pathname, input.search);
  const url = absoluteUrl(path);
  const index = input.index ?? true;
  const follow = input.follow ?? index;

  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: path },
    robots: index
      ? { index: true, follow }
      : { index: false, follow: false },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: SITE_NAME,
      locale: "ru_RU",
      type: input.ogType ?? "website",
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
    },
  };
}

export function rootMetadataBase(): URL {
  return new URL(absoluteUrl("/"));
}

export function verificationMetadata(): Metadata["verification"] {
  const yandex = process.env.NEXT_PUBLIC_YANDEX_VERIFICATION?.trim();
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  if (!yandex && !google) {
    return undefined;
  }
  return {
    ...(yandex ? { yandex } : {}),
    ...(google ? { google } : {}),
  };
}

export function defaultRootMetadata(): Pick<
  Metadata,
  "title" | "description" | "applicationName" | "metadataBase"
> {
  return {
    metadataBase: rootMetadataBase(),
    title: SITE_NAME,
    description: SITE_TAGLINE,
    applicationName: SITE_NAME,
  };
}
