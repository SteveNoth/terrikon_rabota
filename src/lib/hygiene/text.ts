import { Source } from "@prisma/client";
import { formatBytes, formatPercent } from "@/lib/admin/format";
import { plural } from "@/lib/format/plural";
import {
  DB_LIMIT_BYTES,
  DB_MIGRATE_BYTES,
  DEACTIVATE_SKIP_SOURCES,
  DELETE_INACTIVE_AFTER_DAYS,
  INACTIVE_AFTER_DAYS,
  PARSER_RUN_DAYS,
  REJECTED_POST_DAYS,
} from "@/lib/hygiene/constants";
import { formatHorizon, type Forecast } from "@/lib/hygiene/forecast";
import type { CleanupPlan } from "@/lib/hygiene/plan";

export function formatCleanupReport(plan: CleanupPlan, dryRun: boolean): string {
  const deleteWord = plural(plan.totalDeletes, "запись", "записи", "записей");
  const lines = [
    dryRun ? "режим: --dry-run — ничего не удаляю" : "режим: --apply — пишу в базу",
    `Снять с сайта (не видели ${INACTIVE_AFTER_DAYS} дн., isActive=false): ${plan.deactivate}`,
    `Удалить неактивные старше ${DELETE_INACTIVE_AFTER_DAYS} дн.: ${plan.deleteVacancies}`,
    `Удалить ParsedPost REJECTED старше ${REJECTED_POST_DAYS} дн.: ${plan.deleteParsedPosts}`,
    `Удалить ParserRun старше ${PARSER_RUN_DAYS} дн.: ${plan.deleteParserRuns}`,
    `GeocodeCache не трогаем: ${plan.geocodeCacheKept}`,
    `будет удалено ${plan.totalDeletes} ${deleteWord}`,
  ];
  if (DEACTIVATE_SKIP_SOURCES.includes(Source.EMPLOYER)) {
    lines.push("Кабинет / ЦЗН / ручные объявления по lastSeenAt сами не снимаем.");
  }
  return lines.join("\n");
}

export type TableCount = {
  name: string;
  count: number;
};

export function formatSizeReportText(input: {
  bytes: number | null;
  tableCounts: TableCount[];
  forecast: Forecast;
}): string {
  const sizeLine =
    input.bytes == null
      ? "Размер базы неизвестен"
      : `${formatBytes(input.bytes)} из ${formatBytes(DB_LIMIT_BYTES)} (${formatPercent(input.bytes, DB_LIMIT_BYTES)})`;

  let pace: string;
  if (input.forecast.firstSample) {
    pace = "Прогноз «на сколько хватит» появится после второго еженедельного замера.";
  } else if (input.forecast.shrinking) {
    pace = `За неделю база уменьшилась на ${formatBytes(Math.abs(input.forecast.dailyBytes * 7))}. Лимит не приближается.`;
  } else if (input.forecast.dailyBytes === 0) {
    pace = "За неделю размер не вырос. При таком темпе бесплатного тарифа хватит неопределённо долго.";
  } else {
    pace = [
      `Прирост ≈ ${formatBytes(input.forecast.dailyBytes)}/сут.`,
      `Порог переезда ${formatBytes(DB_MIGRATE_BYTES)}: ${formatHorizon(input.forecast.daysToMigrate)}.`,
      `Лимит ${formatBytes(DB_LIMIT_BYTES)}: ${formatHorizon(input.forecast.daysToLimit)}.`,
    ].join(" ");
  }

  const alarm =
    input.bytes != null && input.bytes >= DB_MIGRATE_BYTES
      ? "ПОРОГ 400 МБ: пора переезжать. Шаги — docs/MIGRATION.md.\n"
      : "";

  const tables = input.tableCounts
    .filter((row) => row.count !== 0)
    .map((row) => {
      const n = row.count < 0 ? "?" : String(row.count);
      const note = row.name === "GeocodeCache" ? " (не чистим)" : "";
      return `${row.name} ${n}${note}`;
    })
    .join("\n");

  return [
    "Террикон Работа: размер базы",
    alarm + sizeLine,
    pace,
    "",
    "Записи:",
    tables || "таблицы пусты",
    "",
    "Что делать у порога: docs/MIGRATION.md",
  ].join("\n");
}
