import { prisma } from "@/lib/adapters/db";
import { notify } from "@/lib/adapters/notify";
import { readDatabaseBytes } from "@/lib/health/database";
import { adminChatId } from "@/lib/health/watch";
import { log } from "@/lib/log";
import { HYGIENE_TABLES } from "@/lib/hygiene/constants";
import { forecastFromSamples, type Forecast } from "@/lib/hygiene/forecast";
import { formatSizeReportText, type TableCount } from "@/lib/hygiene/text";

export type { TableCount } from "@/lib/hygiene/text";
export { formatSizeReportText } from "@/lib/hygiene/text";

export type SizeReport = {
  bytes: number | null;
  tableCounts: TableCount[];
  vacancyRows: number;
  forecast: Forecast;
  previousBytes: number | null;
  daysBetween: number | null;
  text: string;
};

type CountRow = { n: bigint | number };

async function countQuoted(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  const raw = rows[0]?.n;
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

export async function collectTableCounts(): Promise<TableCount[]> {
  return Promise.all(
    HYGIENE_TABLES.map(async (name) => {
      try {
        return { name, count: await countQuoted(name) };
      } catch {
        return { name, count: -1 };
      }
    }),
  );
}

export async function buildSizeReport(now = new Date()): Promise<SizeReport> {
  const [bytes, tableCounts, previous] = await Promise.all([
    readDatabaseBytes(),
    collectTableCounts(),
    prisma.dbSizeSample.findFirst({
      orderBy: { capturedAt: "desc" },
    }),
  ]);
  const vacancyRows = tableCounts.find((row) => row.name === "Vacancy")?.count ?? 0;
  const daysBetween =
    previous && bytes != null
      ? Math.max(1 / 24, (now.getTime() - previous.capturedAt.getTime()) / 86_400_000)
      : null;
  const forecast = forecastFromSamples({
    currentBytes: bytes ?? 0,
    previousBytes: previous?.bytes ?? null,
    daysBetween: daysBetween ?? 0,
  });
  const text = formatSizeReportText({
    bytes,
    tableCounts,
    forecast,
  });
  return {
    bytes,
    tableCounts,
    vacancyRows: vacancyRows < 0 ? 0 : vacancyRows,
    forecast,
    previousBytes: previous?.bytes ?? null,
    daysBetween,
    text,
  };
}

export async function saveSizeSample(report: SizeReport, now = new Date()): Promise<void> {
  if (report.bytes == null) {
    return;
  }
  const counts: Record<string, number> = {};
  for (const row of report.tableCounts) {
    counts[row.name] = row.count;
  }
  await prisma.dbSizeSample.create({
    data: {
      capturedAt: now,
      bytes: report.bytes,
      tableCounts: counts,
      vacancyRows: report.vacancyRows,
    },
  });
}

export type SizeReportSend = {
  report: SizeReport;
  saved: boolean;
  sent: boolean;
  reason: string | null;
};

export async function runSizeReport(options: { dryRun: boolean; now?: Date }): Promise<SizeReportSend> {
  const report = await buildSizeReport(options.now);
  if (options.dryRun) {
    return { report, saved: false, sent: false, reason: "dry-run" };
  }
  await saveSizeSample(report, options.now);
  const chatId = adminChatId();
  if (!chatId) {
    log.warn("hygiene", "TELEGRAM_ADMIN_CHAT_ID пуст — отчёт о размере никуда не ушёл");
    return { report, saved: true, sent: false, reason: "TELEGRAM_ADMIN_CHAT_ID не задан" };
  }
  const result = await notify.send({ chatId, text: report.text });
  if (!result.ok) {
    log.error("hygiene", "не удалось отправить отчёт о размере в Telegram");
    return { report, saved: true, sent: false, reason: "Telegram не принял сообщение" };
  }
  log.info("hygiene", "отчёт о размере ушёл в Telegram", { bytes: report.bytes });
  return { report, saved: true, sent: true, reason: null };
}

export async function loadLatestSizeSample() {
  return prisma.dbSizeSample.findFirst({
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true, bytes: true, vacancyRows: true },
  });
}
