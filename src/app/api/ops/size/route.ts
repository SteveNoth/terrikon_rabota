import { NextResponse, type NextRequest } from "next/server";
import { authorizeParserRequest } from "@/lib/parser/auth";
import { unauthorizedApi, handleApiRoute } from "@/lib/api/response";
import { runSizeReport } from "@/lib/hygiene/report";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run(request: NextRequest) {
  if (!authorizeParserRequest(request)) {
    return unauthorizedApi();
  }
  const result = await runSizeReport({ dryRun: false });
  return NextResponse.json(
    {
      ok: true,
      sent: result.sent,
      saved: result.saved,
      reason: result.reason,
      bytes: result.report.bytes,
      vacancyRows: result.report.vacancyRows,
      daysToLimit: result.report.forecast.daysToLimit,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export function GET(request: NextRequest) {
  return handleApiRoute("api/ops/size", () => run(request));
}

export function POST(request: NextRequest) {
  return handleApiRoute("api/ops/size", () => run(request));
}
