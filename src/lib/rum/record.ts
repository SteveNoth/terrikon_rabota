import { prisma } from "@/lib/adapters/db";
import { log } from "@/lib/log";
import type { RumInput } from "@/lib/rum/parse";

const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 2_000;

const globalForRum = globalThis as unknown as {
  rumHits?: { start: number; count: number };
};

function allowWrite(now = Date.now()): boolean {
  const bucket = globalForRum.rumHits ?? { start: now, count: 0 };
  if (now - bucket.start > HOUR_MS) {
    bucket.start = now;
    bucket.count = 0;
  }
  if (bucket.count >= MAX_PER_HOUR) {
    globalForRum.rumHits = bucket;
    return false;
  }
  bucket.count += 1;
  globalForRum.rumHits = bucket;
  return true;
}

export async function recordRumSample(input: RumInput): Promise<void> {
  if (!allowWrite()) {
    log.warn("rum", "потолок записей за час, пропуск");
    return;
  }
  try {
    await prisma.rumSample.create({
      data: {
        qualityMode: input.qualityMode,
        lcpMs: input.lcpMs,
        cls: input.cls,
        inpMs: input.inpMs,
      },
    });
  } catch (cause) {
    log.error("rum", "не удалось записать замер", cause);
  }
}
