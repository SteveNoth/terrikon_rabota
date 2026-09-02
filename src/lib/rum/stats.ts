import { prisma } from "@/lib/adapters/db";
import { QUALITY_MODES, type QualityMode } from "@/lib/quality/types";

export type RumModeStats = {
  mode: QualityMode;
  samples: number;
  share: number;
  lcpP75: number | null;
  clsP75: number | null;
  inpP75: number | null;
};

export type RumDashboard = {
  days: number;
  total: number;
  modes: RumModeStats[];
};

type ModeRow = {
  qualityMode: string;
  samples: bigint | number;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
};

function asNumber(value: bigint | number | null | undefined): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return value;
}

export async function loadRumDashboard(days = 7): Promise<RumDashboard> {
  const from = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.$queryRaw<ModeRow[]>`
    SELECT
      "qualityMode",
      COUNT(*) AS samples,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY "lcpMs") FILTER (WHERE "lcpMs" IS NOT NULL) AS lcp_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY "cls") FILTER (WHERE "cls" IS NOT NULL) AS cls_p75,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY "inpMs") FILTER (WHERE "inpMs" IS NOT NULL) AS inp_p75
    FROM "RumSample"
    WHERE "createdAt" >= ${from}
    GROUP BY "qualityMode"
  `;

  const byMode = new Map(rows.map((row) => [row.qualityMode, row]));
  const total = rows.reduce((sum, row) => sum + asNumber(row.samples), 0);
  const modes: RumModeStats[] = QUALITY_MODES.map((mode) => {
    const row = byMode.get(mode);
    const samples = row ? asNumber(row.samples) : 0;
    return {
      mode,
      samples,
      share: total > 0 ? samples / total : 0,
      lcpP75: row?.lcp_p75 ?? null,
      clsP75: row?.cls_p75 ?? null,
      inpP75: row?.inp_p75 ?? null,
    };
  });

  return { days, total, modes };
}
