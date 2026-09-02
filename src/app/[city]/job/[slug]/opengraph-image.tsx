import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, vacancyOgImage } from "@/lib/seo/og-image";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-dynamic";

export default async function VacancyOpenGraphImage({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  return vacancyOgImage(await params);
}
