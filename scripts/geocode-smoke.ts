/**
 * Проверка: повтор resolveVacancyCoordinates того же адреса не идёт в сеть.
 * Запуск: npx tsx scripts/geocode-smoke.ts
 */
import { config as loadEnv } from "dotenv";
import {
  geocodeExternalCallCount,
  resetGeocodeExternalCallCount,
} from "../src/lib/adapters/maps";
import { resolveVacancyCoordinates } from "../src/lib/geo/geocode";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });

async function main() {
  resetGeocodeExternalCallCount();
  const input = {
    citySlug: "gorlovka",
    address: "ул. Заводская, 12",
    districtSlug: "centr",
  };

  const first = await resolveVacancyCoordinates(input);
  const afterFirst = geocodeExternalCallCount();
  const second = await resolveVacancyCoordinates(input);
  const afterSecond = geocodeExternalCallCount();

  const donetsk = await resolveVacancyCoordinates({
    citySlug: "donetsk",
    address: "ул. Артёма, 1",
    districtSlug: null,
  });

  console.log(
    JSON.stringify(
      {
        first: first
          ? { accuracy: first.accuracy, cached: first.cached, external: first.external, skipped: first.skipped }
          : null,
        second: second
          ? { accuracy: second.accuracy, cached: second.cached, external: second.external }
          : null,
        externalAfterFirst: afterFirst,
        externalAfterSecond: afterSecond,
        repeatDidNotCallNetwork: afterSecond === afterFirst,
        donetskSkipped: donetsk?.skipped === "city-inactive",
        donetskExternal: donetsk?.external === false,
      },
      null,
      2,
    ),
  );

  if (afterSecond !== afterFirst) {
    throw new Error("Повторное геокодирование того же адреса сделало внешний запрос");
  }
  if (donetsk?.skipped !== "city-inactive" || donetsk.external) {
    throw new Error("Для города soon ушёл внешний запрос геокодера");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
