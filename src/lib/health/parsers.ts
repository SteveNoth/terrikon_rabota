import {
  PARSER_LABEL,
  PARSER_STALE_AFTER_MS,
  PARSER_STALE_DEFAULT_MS,
} from "@/lib/admin/constants";

export const WATCHED_PARSERS = ["parser_vk", "parser_tg", "parser_web", "parser_trudvsem"] as const;
export type WatchedParser = (typeof WATCHED_PARSERS)[number];

export type ParserRunSnapshot = {
  parser: string;
  startedAt: Date;
  finishedAt: Date | null;
  postsAccepted: number;
  vacanciesCreated: number;
};

export type ParserAlertKind = "stale" | "zero_twice";

export type ParserAlert = {
  parser: string;
  label: string;
  kind: ParserAlertKind;
  alertKey: string;
  message: string;
};

export type ParserHealthItem = {
  parser: string;
  label: string;
  ok: boolean;
  lastStartedAt: string | null;
  lastAccepted: number | null;
  stale: boolean;
  staleAfterHours: number;
  zeroAcceptedTwice: boolean;
};

function staleLimitMs(parser: string): number {
  return PARSER_STALE_AFTER_MS[parser] ?? PARSER_STALE_DEFAULT_MS;
}

export function parserLabel(parser: string): string {
  return PARSER_LABEL[parser] ?? parser;
}

function finishedRuns(runs: ParserRunSnapshot[]): ParserRunSnapshot[] {
  return runs
    .filter((run) => run.finishedAt != null)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

export function isParserStale(runs: ParserRunSnapshot[], now: Date, parser: string): boolean {
  const latest = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  if (!latest) {
    return true;
  }
  return now.getTime() - latest.startedAt.getTime() > staleLimitMs(parser);
}

/** Два последних завершённых запуска приняли ноль вакансий. */
export function acceptedZeroTwice(runs: ParserRunSnapshot[]): boolean {
  const done = finishedRuns(runs).slice(0, 2);
  if (done.length < 2) {
    return false;
  }
  return done.every((run) => run.postsAccepted === 0);
}

function moscowStamp(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function describeParser(
  parser: string,
  runs: ParserRunSnapshot[],
  now: Date,
): ParserHealthItem {
  const latest = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  const stale = isParserStale(runs, now, parser);
  const zeroAcceptedTwice = acceptedZeroTwice(runs);
  const limit = staleLimitMs(parser);
  return {
    parser,
    label: parserLabel(parser),
    ok: !stale && !zeroAcceptedTwice,
    lastStartedAt: latest ? latest.startedAt.toISOString() : null,
    lastAccepted: latest ? latest.postsAccepted : null,
    stale,
    staleAfterHours: Math.round(limit / 3_600_000),
    zeroAcceptedTwice,
  };
}

export function evaluateParserAlerts(
  byParser: Map<string, ParserRunSnapshot[]>,
  now = new Date(),
): ParserAlert[] {
  const alerts: ParserAlert[] = [];
  for (const parser of WATCHED_PARSERS) {
    const runs = byParser.get(parser) ?? [];
    const item = describeParser(parser, runs, now);
    if (item.stale) {
      const when = item.lastStartedAt
        ? `последний запуск ${moscowStamp(new Date(item.lastStartedAt))} (МСК)`
        : "ещё ни разу не запускался";
      alerts.push({
        parser,
        label: item.label,
        kind: "stale",
        alertKey: `${parser}:stale`,
        message: `${item.label} не запускался больше ${item.staleAfterHours} ч (${when}).`,
      });
    }
    if (item.zeroAcceptedTwice) {
      const done = finishedRuns(runs).slice(0, 2);
      const stamps = done.map((run) => moscowStamp(run.startedAt)).join(" и ");
      alerts.push({
        parser,
        label: item.label,
        kind: "zero_twice",
        alertKey: `${parser}:zero_twice`,
        message: `${item.label} принял 0 вакансий два раза подряд (запуски: ${stamps}).`,
      });
    }
  }
  return alerts;
}
