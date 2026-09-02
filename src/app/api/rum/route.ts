import { NextResponse, type NextRequest } from "next/server";
import { isDoNotTrack } from "@/lib/stats/device";
import { defaultQualityMode, resolveMode } from "@/lib/quality/server";
import { isQualityMode } from "@/lib/quality/types";
import { parseRumPayload } from "@/lib/rum/parse";
import { recordRumSample } from "@/lib/rum/record";

export const dynamic = "force-dynamic";

function noContent() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (isDoNotTrack(request.headers.get("dnt") ?? request.headers.get("DNT"))) {
    return noContent();
  }

  const resolved = resolveMode(request);
  const qualityMode = isQualityMode(resolved.mode) ? resolved.mode : defaultQualityMode();

  let payload: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      payload = JSON.parse(text) as unknown;
    }
  } catch {
    payload = {};
  }

  const sample = parseRumPayload(payload, qualityMode);
  if (sample && sample.qualityMode !== "ultra") {
    await recordRumSample(sample);
  }

  return noContent();
}
