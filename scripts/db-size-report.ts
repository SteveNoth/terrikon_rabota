/**
 * Отчёт о размере базы. Без --apply только печатает, в Telegram не шлёт.
 *
 *   npx tsx scripts/db-size-report.ts --dry-run
 *   npx tsx scripts/db-size-report.ts --apply
 */
import "./load-env";
import { parseReportArgs } from "../src/lib/hygiene/args";
import { runSizeReport } from "../src/lib/hygiene/report";

async function main() {
  const mode = parseReportArgs(process.argv.slice(2));
  const result = await runSizeReport({ dryRun: mode.dryRun });
  console.log(result.report.text);
  if (mode.dryRun) {
    console.log("\nрежим: --dry-run — снимок не записан, Telegram молчит.");
    return;
  }
  if (result.sent) {
    console.log("\nОтчёт ушёл в Telegram.");
    return;
  }
  console.log(`\nСнимок ${result.saved ? "записан" : "не записан"}. Telegram: ${result.reason ?? "не отправлен"}.`);
}

main().catch((cause) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(message);
  process.exit(1);
});
