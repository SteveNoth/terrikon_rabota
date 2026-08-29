import { Icon, type IconName } from "@/components/ui/icon";
import { pluralVacancies } from "@/lib/format/plural";
import type { CitySlug } from "@/lib/geo";
import Link from "next/link";

export type HomeSphereTile = {
  slug: string;
  name: string;
  icon: string;
  count: number;
};

const SPHERE_ICONS: ReadonlySet<string> = new Set([
  "sphere-production",
  "sphere-construction",
  "sphere-trade",
  "sphere-transport",
  "sphere-medicine",
  "sphere-education",
  "sphere-it",
  "sphere-services",
  "sphere-food",
  "sphere-security",
]);

function asSphereIcon(icon: string): IconName {
  return SPHERE_ICONS.has(icon) ? (icon as IconName) : "sphere-services";
}

export function HomeSpheres({
  citySlug,
  tiles,
}: {
  citySlug: CitySlug;
  tiles: HomeSphereTile[];
}) {
  return (
    <section className="mx-auto flex w-full max-w-container min-w-0 flex-col gap-4 px-4 py-6">
      <h2 className="font-display text-xl font-medium">Сферы</h2>
      <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.slug} className="min-w-0">
            <Link
              href={`/${citySlug}/jobs?sphere=${encodeURIComponent(tile.slug)}`}
              className="flex h-full min-h-tap min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-1 transition duration-normal hover:border-brand hover:bg-surface-muted hover:shadow-2"
            >
              <Icon name={asSphereIcon(tile.icon)} decorative />
              <span className="break-words font-medium">{tile.name}</span>
              <span className="text-sm text-muted">{pluralVacancies(tile.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
