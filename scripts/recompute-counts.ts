/**
 * Пересчёт vacancyCount у сфер и городов.
 *
 *   npx tsx scripts/recompute-counts.ts
 */
import "./load-env";
import { recomputeVacancyCounts } from "../src/lib/hygiene/counters";

async function main() {
  const result = await recomputeVacancyCounts();
  console.log(
    `Счётчики записаны: городов ${result.cities}, пар город+сфера ${result.spheres}, сфер ${result.categories}.`,
  );
}

main().catch((cause) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(message);
  process.exit(1);
});
