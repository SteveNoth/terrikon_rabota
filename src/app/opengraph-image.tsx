import { defaultOgImage, OG_ALT, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-dynamic";

export default async function OpenGraphImage() {
  return defaultOgImage();
}
