import {
  formatJalaliNumeric,
  formatTime,
  WEEKDAY_LABELS,
  weekdayIndex,
} from "@/lib/dates";
import type { DayStartStatus } from "@/lib/performance";

const DAY_START = 4 * 60;
const DAY_END = 24 * 60;
const WIDTH = 760;
const HEIGHT = 280;
const PAD = { top: 22, right: 22, bottom: 50, left: 56 };
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;
const Y_TICKS = [6, 9, 12, 15, 18, 21, 24];

type Point = { x: number; y: number };

function timeToY(minutes: number): number {
  const clamped = Math.max(DAY_START, Math.min(DAY_END, minutes));
  return PAD.top + ((clamped - DAY_START) / (DAY_END - DAY_START)) * PLOT_HEIGHT;
}

function dayToX(index: number, total: number): number {
  if (total <= 1) return PAD.left + PLOT_WIDTH / 2;
  return PAD.left + (index / (total - 1)) * PLOT_WIDTH;
}

function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const tension = 0.16;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function areaPath(points: Point[]): string {
  if (points.length < 2) return "";
  const baseY = PAD.top + PLOT_HEIGHT;
  const first = points[0];
  const last = points[points.length - 1];
  return `${smoothPath(points)} L ${last.x.toFixed(2)} ${baseY} L ${first.x.toFixed(2)} ${baseY} Z`;
}

export function StartChart({ days }: { days: DayStartStatus[] }) {
  const total = Math.max(1, days.length);
  const performedPoints: Point[] = [];
  const plannedPoints: Point[] = [];

  days.forEach((day, index) => {
    const x = dayToX(index, total);
    if (day.performedStartMin !== null) {
      performedPoints.push({ x, y: timeToY(day.performedStartMin) });
    }
    if (day.plannedStartMin !== null) {
      plannedPoints.push({ x, y: timeToY(day.plannedStartMin) });
    }
  });

  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const isEmpty = performedPoints.length === 0;

  return (
    <div className="start-line-chart stack" style={{ gap: "0.6rem" }}>
      <div className="row chart-legend-row" style={{ gap: "0.9rem", fontSize: "0.76rem" }}>
        <span className="chart-legend">
          <span className="chart-line-key is-actual" /> شروع واقعی
        </span>
        <span className="chart-legend">
          <span className="chart-line-key is-planned" /> شروع برنامه
        </span>
        <span className="chart-legend">
          <span className="chart-dot is-offplan" /> خارج از برنامه
        </span>
        <span className="chart-legend">
          <span className="chart-dot is-none" /> بدون برنامه
        </span>
      </div>
      <div className="start-line-chart-canvas">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="نمودار ساعت شروع روزها"
        >
          <defs>
            <linearGradient id="start-area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1f6f4a" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#1f6f4a" stopOpacity="0" />
            </linearGradient>
          </defs>

          {Y_TICKS.map((hour) => {
            const y = timeToY(hour * 60);
            return (
              <g key={hour}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + PLOT_WIDTH}
                  y1={y}
                  y2={y}
                  className="start-grid-line"
                />
                <text
                  x={PAD.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="start-axis-label"
                >
                  {formatTime(hour * 60)}
                </text>
              </g>
            );
          })}

          {!isEmpty ? (
            <path
              d={areaPath(performedPoints)}
              fill="url(#start-area-gradient)"
              stroke="none"
            />
          ) : null}

          {plannedPoints.length >= 2 ? (
            <path
              d={smoothPath(plannedPoints)}
              className="start-planned-line"
              fill="none"
            />
          ) : null}

          {!isEmpty ? (
            <path d={smoothPath(performedPoints)} className="start-actual-line" fill="none" />
          ) : null}

          {days.map((day, index) => {
            const showLabel = index % labelEvery === 0 || index === days.length - 1;
            const x = dayToX(index, total);
            return (
              <g key={day.date}>
                {showLabel ? (
                  <>
                    <text
                      x={x}
                      y={HEIGHT - 26}
                      textAnchor="middle"
                      className="start-axis-day"
                    >
                      {WEEKDAY_LABELS[weekdayIndex(day.date)]}
                    </text>
                    <text
                      x={x}
                      y={HEIGHT - 10}
                      textAnchor="middle"
                      className="start-axis-label"
                    >
                      {formatJalaliNumeric(day.date)}
                    </text>
                  </>
                ) : null}
                {day.performedStartMin !== null ? (
                  <g>
                    <circle
                      cx={x}
                      cy={timeToY(day.performedStartMin)}
                      r={4.5}
                      className={`start-marker is-${day.status}`}
                    />
                    <title>
                      {`${WEEKDAY_LABELS[weekdayIndex(day.date)]} ${formatJalaliNumeric(day.date)} — اولین ورود: ${formatTime(day.performedStartMin)}${
                        day.plannedStartMin !== null
                          ? ` · برنامه: ${formatTime(day.plannedStartMin)}`
                          : ""
                      }`}
                    </title>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {isEmpty ? (
        <div className="empty">برای این بازه ساعت شروعی ثبت نشده است.</div>
      ) : null}
    </div>
  );
}
