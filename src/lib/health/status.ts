import type { HealthStatus } from "@/lib/health/types";

export function healthHttpStatus(report: { status: HealthStatus }): number {
  return report.status === "down" ? 503 : 200;
}
