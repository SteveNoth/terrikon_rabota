import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Ровно 8 килобайт — столько качает замер скорости на следующем этапе. */
const PING_PAYLOAD_BYTES = 8 * 1024;

const NO_STORE: HeadersInit = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function wantsEightKb(size: string | null): boolean {
  return size?.trim().toLowerCase() === "8kb";
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (wantsEightKb(url.searchParams.get("size"))) {
    const body = new Uint8Array(PING_PAYLOAD_BYTES);
    crypto.getRandomValues(body);
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(PING_PAYLOAD_BYTES),
      },
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: NO_STORE,
  });
}
