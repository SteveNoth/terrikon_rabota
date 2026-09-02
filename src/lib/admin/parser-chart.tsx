import type { CSSProperties } from "react";
import type { DayPoint } from "@/lib/admin/parsers";

/** Столбики графика: высоты через CSS-переменные, не через цвета в разметке. */
export function ParserDayChart({ days }: { days: DayPoint[] }) {
  const maxSeen = Math.max(1, ...days.map((day) => day.seen + day.accepted + day.pending + day.rejected + day.blocked));
  return (
    <div className="admin-chart" aria-hidden="true">
      {days.map((day) => {
        const total = day.seen || day.accepted + day.pending + day.rejected + day.blocked;
        const height = Math.round((100 * Math.max(total, day.seen)) / maxSeen);
        const colHeight = `${Math.max(height, 4)}%`;
        return (
          <div key={day.date} className="admin-chart-col" title={day.date}>
            <div className="admin-chart-stack" style={{ "--admin-col": colHeight } as CSSProperties}>
              <span className="admin-chart-seg admin-seg-seen" style={{ "--admin-seg": bar(day.seen, total) } as CSSProperties} />
              <span className="admin-chart-seg admin-seg-accepted" style={{ "--admin-seg": bar(day.accepted, total) } as CSSProperties} />
              <span className="admin-chart-seg admin-seg-pending" style={{ "--admin-seg": bar(day.pending, total) } as CSSProperties} />
              <span className="admin-chart-seg admin-seg-rejected" style={{ "--admin-seg": bar(day.rejected, total) } as CSSProperties} />
              <span className="admin-chart-seg admin-seg-blocked" style={{ "--admin-seg": bar(day.blocked, total) } as CSSProperties} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function bar(part: number, whole: number): string {
  if (whole <= 0) {
    return "0%";
  }
  return `${Math.round((100 * part) / whole)}%`;
}
