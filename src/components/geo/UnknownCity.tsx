import Link from "next/link";
import { cityName, getSelectableCities } from "@/lib/geo";

export function UnknownCity() {
  const cities = getSelectableCities();

  return (
    <div className="mx-auto flex max-w-container flex-col gap-4 px-4 py-8">
      <h1 className="font-display text-2xl font-medium">Такого города у нас нет</h1>
      <p className="text-muted">Можно выбрать город, который уже в списке:</p>
      <ul className="flex flex-col gap-2">
        {cities.map((city) => (
          <li key={city.slug}>
            <Link href={`/${city.slug}`} className="text-brand">
              {cityName(city.slug, "nom")}
              {city.status === "soon" ? " · скоро" : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
