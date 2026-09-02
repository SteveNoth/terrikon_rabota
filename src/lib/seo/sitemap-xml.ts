export const SITEMAP_CHUNK_SIZE = 5000;

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

export type SitemapDocument =
  | { kind: "urlset"; entries: SitemapEntry[] }
  | { kind: "index"; chunks: SitemapEntry[][] };

export function chunkEntries(entries: SitemapEntry[], size = SITEMAP_CHUNK_SIZE): SitemapEntry[][] {
  if (size < 1) {
    return [entries];
  }
  const chunks: SitemapEntry[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

export function sitemapDocument(entries: SitemapEntry[], size = SITEMAP_CHUNK_SIZE): SitemapDocument {
  if (entries.length <= size) {
    return { kind: "urlset", entries };
  }
  return { kind: "index", chunks: chunkEntries(entries, size) };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function urlsetXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function sitemapIndexXml(locs: string[]): string {
  const items = locs
    .map(
      (loc) => `  <sitemap>
    <loc>${xmlEscape(loc)}</loc>
  </sitemap>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>
`;
}

export function lastmodIso(value: Date): string {
  return value.toISOString();
}
