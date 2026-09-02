import { NextResponse } from "next/server";
import { collectHealth, healthHttpStatus } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const report = await collectHealth();
  return NextResponse.json(report, {
    status: healthHttpStatus(report),
    headers: { "Cache-Control": "no-store" },
  });
}
