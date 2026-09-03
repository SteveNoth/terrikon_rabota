"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { CityOption } from "@/lib/geo";

export function CitySelect({
  currentSlug,
  activeCities,
  soonCities,
  id,
}: {
  currentSlug: string;
  activeCities: CityOption[];
  soonCities: CityOption[];
  id: string;
}) {
  const router = useRouter();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const slug = event.target.value;
    if (!slug) {
      return;
    }
    router.push(`/${slug}`);
  }

  return (
    <form method="GET" action="/" className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Город
      </label>
      <Select
        id={id}
        name="city"
        value={currentSlug}
        onChange={onChange}
        size="sm"
        autoComplete="off"
        className="min-w-0 flex-1"
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
      <Button type="submit" variant="outline" size="sm">
        Выбрать
      </Button>
    </form>
  );
}
