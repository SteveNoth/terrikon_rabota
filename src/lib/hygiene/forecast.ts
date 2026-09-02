import { DB_LIMIT_BYTES, DB_MIGRATE_BYTES } from "@/lib/hygiene/constants";

export type Forecast = {
  dailyBytes: number;
  daysToMigrate: number | null;
  daysToLimit: number | null;
  shrinking: boolean;
  firstSample: boolean;
};

export function forecastFromSamples(input: {
  currentBytes: number;
  previousBytes: number | null;
  daysBetween: number;
  migrateBytes?: number;
  limitBytes?: number;
}): Forecast {
  const migrateBytes = input.migrateBytes ?? DB_MIGRATE_BYTES;
  const limitBytes = input.limitBytes ?? DB_LIMIT_BYTES;
  if (input.previousBytes == null || !(input.daysBetween > 0)) {
    return {
      dailyBytes: 0,
      daysToMigrate: null,
      daysToLimit: null,
      shrinking: false,
      firstSample: true,
    };
  }
  const dailyBytes = (input.currentBytes - input.previousBytes) / input.daysBetween;
  if (dailyBytes <= 0) {
    return {
      dailyBytes,
      daysToMigrate: null,
      daysToLimit: null,
      shrinking: dailyBytes < 0,
      firstSample: false,
    };
  }
  return {
    dailyBytes,
    daysToMigrate: Math.max(0, migrateBytes - input.currentBytes) / dailyBytes,
    daysToLimit: Math.max(0, limitBytes - input.currentBytes) / dailyBytes,
    shrinking: false,
    firstSample: false,
  };
}

export function formatHorizon(days: number | null): string {
  if (days == null) {
    return "нужен ещё один замер";
  }
  if (!Number.isFinite(days)) {
    return "не приближается";
  }
  if (days < 1) {
    return "меньше суток";
  }
  if (days < 45) {
    return `~${Math.round(days)} дн.`;
  }
  const months = days / 30;
  if (months < 18) {
    const rounded = months >= 10 ? String(Math.round(months)) : months.toFixed(1).replace(".", ",");
    return `~${rounded} мес.`;
  }
  const years = days / 365;
  return `~${years.toFixed(1).replace(".", ",")} г.`;
}
