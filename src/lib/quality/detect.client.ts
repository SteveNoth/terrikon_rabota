import {
  isQualityMode,
  RESULT_COOKIE,
  RESULT_COOKIE_MAX_AGE,
  type QualityMode,
} from "@/lib/quality/types";

const DETECT_AT_KEY = "tr_detect_at";
const FAIL_STICKY_KEY = "tr_fail_sticky";
const DETECT_INTERVAL_MS = 2 * 60 * 1000;
const FAIL_WINDOW_MS = 60 * 1000;
const FAIL_STICKY_MS = 10 * 60 * 1000;
const PING_COUNT = 3;
const SPEED_BYTES = 8 * 1024;
const IDLE_TIMEOUT_MS = 2500;

type EffectiveType = "slow-2g" | "2g" | "3g" | "4g";

type ConnectionLike = {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
};

export type QualitySignals = {
  saveData: boolean;
  effectiveType?: EffectiveType;
  pingMedianMs: number | null;
  speedKbps: number | null;
  failedRecent: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  failureSticky: boolean;
};

const ULTRA_EFFECTIVE = new Set<string>(["slow-2g", "2g"]);

const failureTimes: number[] = [];
const failureListeners = new Set<(count: number) => void>();
let fetchPatched = false;

function now(): number {
  return Date.now();
}

function pruneFailures(at: number): number {
  const cutoff = at - FAIL_WINDOW_MS;
  while (failureTimes.length > 0 && failureTimes[0]! < cutoff) {
    failureTimes.shift();
  }
  return failureTimes.length;
}

export function recentFailureCount(): number {
  return pruneFailures(now());
}

export function noteFailedRequest(): number {
  const at = now();
  failureTimes.push(at);
  const count = pruneFailures(at);
  if (count >= 2) {
    markFailureSticky();
    for (const listener of failureListeners) {
      listener(count);
    }
  }
  return count;
}

function markFailureSticky(): void {
  try {
    sessionStorage.setItem(FAIL_STICKY_KEY, String(now() + FAIL_STICKY_MS));
  } catch {
    /* режим без sessionStorage */
  }
}

export function isFailureSticky(): boolean {
  try {
    const raw = sessionStorage.getItem(FAIL_STICKY_KEY);
    if (!raw) {
      return false;
    }
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= now()) {
      sessionStorage.removeItem(FAIL_STICKY_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function shouldCountFailure(input: RequestInfo | URL): boolean {
  const url = requestUrl(input);
  return !url.includes("/_next/");
}

export function installFailureObserver(onSticky?: (count: number) => void): () => void {
  if (onSticky) {
    failureListeners.add(onSticky);
  }

  if (!fetchPatched && typeof window !== "undefined") {
    fetchPatched = true;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      try {
        const response = await original(input, init);
        if (shouldCountFailure(input) && response.status >= 500) {
          noteFailedRequest();
        }
        return response;
      } catch (error) {
        if (shouldCountFailure(input)) {
          noteFailedRequest();
        }
        throw error;
      }
    };
  }

  return () => {
    if (onSticky) {
      failureListeners.delete(onSticky);
    }
  };
}

export function canDetectNow(): boolean {
  try {
    const raw = sessionStorage.getItem(DETECT_AT_KEY);
    if (!raw) {
      return true;
    }
    const last = Number(raw);
    if (!Number.isFinite(last)) {
      return true;
    }
    return now() - last >= DETECT_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markDetected(): void {
  try {
    sessionStorage.setItem(DETECT_AT_KEY, String(now()));
  } catch {
    /* ignore */
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function asEffectiveType(value: string | undefined): EffectiveType | undefined {
  if (value === "slow-2g" || value === "2g" || value === "3g" || value === "4g") {
    return value;
  }
  return undefined;
}

function readConnection(): ConnectionLike | undefined {
  const nav = navigator as Navigator & { connection?: ConnectionLike; mozConnection?: ConnectionLike };
  return nav.connection ?? nav.mozConnection;
}

function readBrowserHints(): Pick<
  QualitySignals,
  "saveData" | "effectiveType" | "deviceMemory" | "hardwareConcurrency"
> {
  const connection = readConnection();
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    saveData: Boolean(connection?.saveData),
    effectiveType: asEffectiveType(connection?.effectiveType),
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    hardwareConcurrency:
      typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : undefined,
  };
}

async function pingOnce(): Promise<number> {
  const started = performance.now();
  const response = await fetch(`/api/ping?t=${Date.now()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok && response.status !== 204) {
    throw new Error("ping failed");
  }
  return performance.now() - started;
}

async function measurePingMedian(): Promise<number | null> {
  const samples: number[] = [];
  for (let i = 0; i < PING_COUNT; i += 1) {
    try {
      samples.push(await pingOnce());
    } catch {
      noteFailedRequest();
    }
  }
  return median(samples);
}

async function measureSpeedKbps(): Promise<number | null> {
  const started = performance.now();
  try {
    const response = await fetch(`/api/ping?size=8kb&t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      noteFailedRequest();
      return null;
    }
    const buffer = await response.arrayBuffer();
    const elapsedMs = Math.max(performance.now() - started, 1);
    const bytes = buffer.byteLength || SPEED_BYTES;
    return (bytes * 8) / elapsedMs;
  } catch {
    noteFailedRequest();
    return null;
  }
}

/**
 * Раздел 8.3, шаг 3. Сначала Ultra, потом Lite, потом Full.
 * Если Full не доказан — остаёмся на Lite (сайт стартует пессимистично).
 */
export function pickModeFromSignals(signals: QualitySignals): QualityMode {
  if (
    signals.failureSticky ||
    signals.saveData ||
    signals.failedRecent >= 2 ||
    (signals.effectiveType !== undefined && ULTRA_EFFECTIVE.has(signals.effectiveType)) ||
    (signals.pingMedianMs !== null && signals.pingMedianMs > 900) ||
    (signals.speedKbps !== null && signals.speedKbps < 120)
  ) {
    return "ultra";
  }

  const lite =
    signals.effectiveType === "3g" ||
    (signals.pingMedianMs !== null &&
      signals.pingMedianMs >= 300 &&
      signals.pingMedianMs <= 900) ||
    (signals.speedKbps !== null && signals.speedKbps >= 120 && signals.speedKbps <= 1500) ||
    (signals.deviceMemory !== undefined && signals.deviceMemory <= 2) ||
    (signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 2);

  if (lite) {
    return "lite";
  }

  const full =
    signals.effectiveType === "4g" &&
    signals.pingMedianMs !== null &&
    signals.pingMedianMs < 300 &&
    signals.speedKbps !== null &&
    signals.speedKbps > 1500 &&
    signals.deviceMemory !== undefined &&
    signals.deviceMemory > 2;

  if (full) {
    return "full";
  }

  return "lite";
}

export async function measureQuality(): Promise<QualityMode> {
  markDetected();
  const hints = readBrowserHints();
  const pingMedianMs = await measurePingMedian();
  const speedKbps = await measureSpeedKbps();

  return pickModeFromSignals({
    ...hints,
    pingMedianMs,
    speedKbps,
    failedRecent: recentFailureCount(),
    failureSticky: isFailureSticky(),
  });
}

/** После первой отрисовки, в простое. Запасной путь — setTimeout. */
export function afterFirstPaint(callback: () => void): () => void {
  let cancelled = false;
  let idleId: number | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let frame1 = 0;
  let frame2 = 0;

  const run = () => {
    if (cancelled) {
      return;
    }
    const start = () => {
      if (!cancelled) {
        callback();
      }
    };

    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
    } else {
      timeoutId = setTimeout(start, 1);
    }
  };

  if (typeof requestAnimationFrame === "function") {
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(run);
    });
  } else {
    timeoutId = setTimeout(run, 0);
  }

  return () => {
    cancelled = true;
    if (frame1 && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame1);
    }
    if (frame2 && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame2);
    }
    if (idleId !== undefined && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(idleId);
    }
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  };
}

export function writeResultCookie(mode: QualityMode): void {
  if (!isQualityMode(mode)) {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${RESULT_COOKIE}=${mode}; Path=/; Max-Age=${RESULT_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
