import hygieneJson from "@shared/hygiene.json";
import { Source } from "@prisma/client";
import { DB_LIMIT_BYTES } from "@/lib/admin/constants";

export const INACTIVE_AFTER_DAYS = hygieneJson.inactiveAfterDays;
export const DELETE_INACTIVE_AFTER_DAYS = hygieneJson.deleteInactiveAfterDays;
export const REJECTED_POST_DAYS = hygieneJson.rejectedPostDays;
export const PARSER_RUN_DAYS = hygieneJson.parserRunDays;
export const DB_MIGRATE_BYTES = hygieneJson.dbMigrateBytes;
export const ACTIONS_MINUTES_WARN = hygieneJson.actionsMinutesWarn;
export const ACTIONS_MINUTES_LIMIT = hygieneJson.actionsMinutesLimit;
export const PARSER_RUN_MINUTES_WARN = hygieneJson.parserRunMinutesWarn;
export const SEARCH_MS_WARN = hygieneJson.searchMsWarn;
export const TRAFFIC_GB_WARN = hygieneJson.trafficGbWarn;
export const LEAVE_GEOCODE_CACHE = hygieneJson.leaveGeocodeCache;

export { DB_LIMIT_BYTES };

const SKIP_NAMES = new Set(hygieneJson.deactivateSkipSources);

export const DEACTIVATE_SKIP_SOURCES: Source[] = (
  Object.values(Source) as Source[]
).filter((source) => SKIP_NAMES.has(source));

export const HYGIENE_TABLES = [
  "Vacancy",
  "Employer",
  "Category",
  "Profession",
  "User",
  "AccountBlock",
  "Application",
  "Favorite",
  "TelegramUser",
  "TelegramDelivery",
  "ParsedPost",
  "ParserRun",
  "Report",
  "CityWaitlist",
  "GeocodeCache",
  "VacancyGroup",
  "ContactVerdict",
  "ModerationDecision",
  "NormalizationSample",
  "AiUsage",
  "AiCache",
  "Event",
  "StatDaily",
  "EmployerStatDaily",
  "MarketSnapshotMonthly",
  "StatsRun",
  "SearchQueryStat",
  "RumSample",
  "OpsAlert",
  "CityStat",
  "SphereStat",
  "DbSizeSample",
] as const;

export function daysAgo(days: number, now = new Date()): Date {
  const stamp = new Date(now.getTime());
  stamp.setUTCDate(stamp.getUTCDate() - days);
  return stamp;
}
