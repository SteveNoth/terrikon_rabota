/**
 * Ограничения двери парсера. Vercel даёт 10 секунд и режет тело ~4.5 МБ.
 * Свои потолки уже: иначе один кривой робот положит функцию и базу.
 */

export const MAX_BATCH_SIZE = 100;
export const MAX_DESCRIPTION_CHARS = 3000;
export const MAX_BODY_BYTES = 1_500_000;
export const MAX_STRING = 4000;
export const MAX_URL = 2000;
export const MAX_IMAGE_URLS = 4;
export const INACTIVE_AFTER_DAYS = 30;
export const DEDUPE_WINDOW_DAYS = 60;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 30;

type Bucket = {
  hits: number[];
};

const globalForLimit = globalThis as unknown as {
  parserRateBuckets?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalForLimit.parserRateBuckets) {
    globalForLimit.parserRateBuckets = new Map();
  }
  return globalForLimit.parserRateBuckets;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export function allowRequest(key: string, now = Date.now()): boolean {
  const store = buckets();
  const bucket = store.get(key) ?? { hits: [] };
  const from = now - RATE_LIMIT_WINDOW_MS;
  bucket.hits = bucket.hits.filter((stamp) => stamp > from);
  if (bucket.hits.length >= RATE_LIMIT_MAX) {
    store.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  store.set(key, bucket);
  return true;
}

export function tooManyResponse(): Response {
  return Response.json(
    { error: "Too Many Requests" },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
  );
}

export function contentLengthTooLarge(request: Request): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) {
    return false;
  }
  const size = Number(raw);
  return Number.isFinite(size) && size > MAX_BODY_BYTES;
}

export function payloadTooLargeResponse(): Response {
  return Response.json(
    { error: "Payload Too Large" },
    { status: 413, headers: { "Cache-Control": "no-store" } },
  );
}
