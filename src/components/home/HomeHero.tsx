import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { chipVariants } from "@/components/ui/chip-variants";
import { cn } from "@/lib/format/cn";
import { cityName, type CityOption, type CitySlug } from "@/lib/geo";
import type { PopularProfession } from "@/lib/repo/professions";
import Link from "next/link";

export function HomeHero({
  citySlug,
  activeCities,
  soonCities,
  professions,
}: {
  citySlug: CitySlug;
  activeCities: CityOption[];
  soonCities: CityOption[];
  professions: PopularProfession[];
}) {
  return (
    <section className="border-b border-border bg-surface-inverse text-text-inverse">
      <div className="mx-auto flex max-w-container flex-col gap-5 px-4 py-6 md:py-8">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-medium break-words md:text-3xl">
            Найди работу в {cityName(citySlug, "loc")}
          </h1>
          <p className="max-w-xl text-md text-text-inverse">
            Свежие вакансии {cityName(citySlug, "gen")} и района
          </p>
        </div>

        <form method="GET" action="/" className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-stretch">
            <label htmlFor="home-q" className="sr-only">
              Поиск вакансий
            </label>
            <Input
              id="home-q"
              type="search"
              name="q"
              placeholder="Должность или ключевое слово"
              autoComplete="off"
              className="min-w-0 flex-1"
            />
            <label htmlFor="home-city" className="sr-only">
              Город
            </label>
            <Select
              id="home-city"
              name="city"
              defaultValue={citySlug}
              autoComplete="off"
              className="min-w-0 w-full sm:w-auto sm:min-w-48"
            >
              {activeCities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}
                </option>
              ))}
              {soonCities.length > 0 ? (
                <optgroup label="Скоро">
                  {soonCities.map((city) => (
                    <option key={city.slug} value={city.slug}>
                      {city.name} · скоро
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
            <Button type="submit" variant="accent" full className="sm:w-auto">
              Найти
            </Button>
          </div>
        </form>

        {professions.length > 0 ? (
          <ul className="flex min-w-0 flex-wrap gap-2">
            {professions.map((profession) => (
              <li key={profession.slug} className="min-w-0">
                <Link
                  href={`/${citySlug}/jobs?q=${encodeURIComponent(profession.name)}`}
                  className={cn(chipVariants({ variant: "outline" }), "bg-surface text-text")}
                >
                  {profession.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
