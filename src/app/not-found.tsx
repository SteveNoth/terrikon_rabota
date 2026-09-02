import { UnknownCity } from "@/components/geo/UnknownCity";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { getDefaultCity } from "@/lib/geo";

export default function RootNotFound() {
  return (
    <SiteChrome citySlug={getDefaultCity().slug}>
      <UnknownCity />
    </SiteChrome>
  );
}
