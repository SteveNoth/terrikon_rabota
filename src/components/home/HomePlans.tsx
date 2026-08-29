import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { City } from "@/lib/geo";
import Link from "next/link";

function CityList({ title, cities }: { title: string; cities: City[] }) {
  if (cities.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      <ul className="flex min-w-0 flex-wrap gap-2">
        {cities.map((city) => (
          <li key={city.slug} className="min-w-0">
            <Link
              href="/about#plans"
              className="inline-flex min-h-tap items-center rounded-pill border border-border bg-surface px-3 text-sm"
            >
              {city.name.nom}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HomePlans({ soon, planned }: { soon: City[]; planned: City[] }) {
  if (soon.length === 0 && planned.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto flex w-full max-w-container min-w-0 flex-col gap-4 px-4 py-6">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl font-medium">Планы развития</h2>
        <Link href="/about#plans" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          Подробнее
        </Link>
      </div>
      <p className="max-w-xl text-sm text-muted">
        Сначала один город, затем соседи. Список берётся из справочника географии, а не из кода
        страницы.
      </p>
      <CityList title="Скоро" cities={soon} />
      <CityList title="В планах" cities={planned} />
    </section>
  );
}
