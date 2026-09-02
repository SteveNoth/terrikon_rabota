import { collectSitemapEntries } from "@/lib/seo/sitemap";
import { absoluteUrl } from "@/lib/seo/origin";
import { sitemapDocument, sitemapIndexXml, urlsetXml } from "@/lib/seo/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 600;

export async function GET() {
  const entries = await collectSitemapEntries();
  const document = sitemapDocument(entries);
  if (document.kind === "urlset") {
    return new Response(urlsetXml(document.entries), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      },
    });
  }

  const locs = document.chunks.map((_, index) => absoluteUrl(`/sitemaps/${index}`));
  return new Response(sitemapIndexXml(locs), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}
