import { SiteChrome } from "@/components/layout/SiteChrome";
import MissingPage from "@/components/feedback/MissingPage";
import { getDefaultCity } from "@/lib/geo";

export default function RootNotFound() {
  const citySlug = getDefaultCity().slug;
  return (
    <SiteChrome citySlug={citySlug}>
      <MissingPage homeHref={`/${citySlug}`} />
    </SiteChrome>
  );
}
