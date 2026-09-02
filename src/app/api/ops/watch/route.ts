import { NextResponse, type NextRequest } from "next/server";
import { authorizeParserRequest } from "@/lib/parser/auth";
import { unauthorizedApi, handleApiRoute } from "@/lib/api/response";
import { runParserWatch } from "@/lib/health/watch";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function run(_request: NextRequest) {
  if (!authorizeParserRequest(_request)) {
    return unauthorizedApi();
  }
  const result = await runParserWatch();
  return NextResponse.json(
    { ok: true, ...result },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export function GET(request: NextRequest) {
  return handleApiRoute("api/ops/watch", () => run(request));
}

export function POST(request: NextRequest) {
  return handleApiRoute("api/ops/watch", () => run(request));
}
