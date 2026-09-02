import { NextResponse, type NextRequest } from "next/server";
import { authorizeParserRequest } from "@/lib/parser/auth";
import { unauthorizedApi, handleApiRoute } from "@/lib/api/response";
import { recomputeVacancyCounts } from "@/lib/hygiene/counters";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function run(request: NextRequest) {
  if (!authorizeParserRequest(request)) {
    return unauthorizedApi();
  }
  const result = await recomputeVacancyCounts();
  return NextResponse.json(
    { ok: true, ...result },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export function GET(request: NextRequest) {
  return handleApiRoute("api/ops/counts", () => run(request));
}

export function POST(request: NextRequest) {
  return handleApiRoute("api/ops/counts", () => run(request));
}
