/**
 * Очистка базы. Без --apply только показывает, что будет удалено.
 *
 *   npx tsx scripts/cleanup.ts --dry-run
 *   npx tsx scripts/cleanup.ts --apply
 */
import "./load-env";
import { parseCleanupArgs } from "../src/lib/hygiene/args";
import { formatCleanupReport, runCleanup } from "../src/lib/hygiene/cleanup";

async function main() {
  const mode = parseCleanupArgs(process.argv.slice(2));
  const result = await runCleanup({ dryRun: mode.dryRun });
  console.log(formatCleanupReport(result, mode.dryRun));
  if (!mode.dryRun) {
    console.log("Готово: удаление применено, счётчики пересчитаны.");
  }
}

main().catch((cause) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(message);
  process.exit(1);
});
