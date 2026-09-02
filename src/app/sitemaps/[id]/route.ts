import { collectSitemapEntries } from "@/lib/seo/sitemap";
import { chunkEntries, urlsetXml } from "@/lib/seo/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 600;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const index = Number.parseInt(id, 10);
  if (!Number.isFinite(index) || index < 0 || String(index) !== id) {
    return new Response("Not Found", { status: 404 });
  }

  const entries = await collectSitemapEntries();
  const chunks = chunkEntries(entries);
  const chunk = chunks[index];
  if (!chunk) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(urlsetXml(chunk), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}
