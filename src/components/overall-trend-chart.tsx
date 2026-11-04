import { formatJalaliNumeric } from "@/lib/dates";

export function OverallTrendChart({
  points,
}: {
  points: { examDate: string; title: string; percent: number }[];
}) {
  if (points.length === 0) {
    return <div className="empty">برای نمایش نمودار روند، حداقل یک آزمون لازم است.</div>;
  }

  const width = 720;
  const height = 220;
  const padX = 42;
  const padY = 28;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = points.length === 1 ? 0 : innerW / (points.length - 1);

  const coords = points.map((point, index) => ({
    ...point,
    x: padX + index * step,
    y: padY + innerH - (Math.max(0, Math.min(100, point.percent)) / 100) * innerH,
  }));

  const path = coords.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="table-wrap" style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label="نمودار روند درصد کل آزمون‌ها"
        style={{ minWidth: "520px" }}
      >
        {[0, 25, 50, 75, 100].map((value) => {
          const y = padY + innerH - (value / 100) * innerH;
          return (
            <g key={value}>
              <line
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="4 4"
              />
              <text x={8} y={y + 4} fontSize="11" fill="var(--muted)">
                {value}٪
              </text>
            </g>
          );
        })}

        <polyline
          points={path}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {coords.map((point, index) => (
          <g key={`${point.examDate}-${index}`}>
            <circle cx={point.x} cy={point.y} r="5" fill="var(--brand)" />
            <text
              x={point.x}
              y={point.y - 12}
              fontSize="12"
              textAnchor="middle"
              fill="var(--text)"
            >
              {point.percent}٪
            </text>
            <text
              x={point.x}
              y={height - 8}
              fontSize="11"
              textAnchor="middle"
              fill="var(--muted)"
            >
              {formatJalaliNumeric(point.examDate).slice(-5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
