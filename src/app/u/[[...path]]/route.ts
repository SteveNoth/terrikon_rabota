import type { NextRequest } from "next/server";
import { handleUltraGet, handleUltraPost } from "@/ultra/handle";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleUltraGet(request);
}

export function POST(request: NextRequest) {
  return handleUltraPost(request);
}
