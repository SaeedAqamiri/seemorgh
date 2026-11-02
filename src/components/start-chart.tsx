import { formatTime } from "@/lib/dates";
import { faNumber } from "@/lib/panel";
import type { DayStartStatus } from "@/lib/performance";

const TRACK_FROM = 4 * 60;
const TRACK_TO = 24 * 60;

export function StartChart({
  days,
  compact = false,
}: {
  days: DayStartStatus[];
  compact?: boolean;
}) {
  const span = TRACK_TO - TRACK_FROM;

  return (
    <div className="start-chart stack" style={{ gap: "0.45rem" }}>
      <div className="row" style={{ gap: "0.7rem", fontSize: "0.74rem" }}>
        <span className="chart-legend">
          <span className="chart-dot is-onplan" /> طبق برنامه
        </span>
        <span className="chart-legend">
          <span className="chart-dot is-offplan" /> خارج از برنامه
        </span>
        <span className="chart-legend">
          <span className="chart-dot is-none" /> بدون فعالیت
        </span>
      </div>
      {days.map((day) => {
        const frac =
          day.performedStartMin === null
            ? null
            : Math.max(0, Math.min(1, (day.performedStartMin - TRACK_FROM) / span));
        const plannedFrac =
          day.plannedStartMin === null
            ? null
            : Math.max(0, Math.min(1, (day.plannedStartMin - TRACK_FROM) / span));
        return (
          <div key={day.date} className="chart-row">
            <span className="chart-day">{compact ? day.date.slice(-5) : day.date}</span>
            <div className="chart-track" dir="ltr">
              <span className="chart-tick" style={{ insetInlineStart: "0%" }} />
              <span className="chart-tick" style={{ insetInlineStart: "50%" }} />
              {plannedFrac !== null ? (
                <span
                  className="chart-tick is-planned"
                  style={{ insetInlineStart: `${plannedFrac * 100}%` }}
                  title={`شروع برنامه: ${formatTime(day.plannedStartMin ?? 0)}`}
                />
              ) : null}
              {frac !== null ? (
                <span
                  className={`chart-dot is-${day.status}`}
                  style={{ insetInlineStart: `calc(${frac * 100}% - 7px)` }}
                  title={day.performedStartMin !== null ? `شروع: ${formatTime(day.performedStartMin)}` : ""}
                />
              ) : null}
            </div>
            <span className="chart-time" dir="ltr">
              {day.performedStartMin !== null
                ? formatTime(day.performedStartMin)
                : "—"}
              {day.practiceCount > 0 ? ` · ${faNumber(day.practiceCount)} تمرین` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
