import { UNIT_TYPE_LABELS } from "@/lib/subjects";
import type { ResourceProgressSummary } from "@/lib/resource-progress";

const PIE_COLORS = [
  "#1f6f4a",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#64748b",
];

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

function TurtleRace({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const finished = clamped >= 100;
  return (
    <div className="stack" style={{ gap: "0.6rem" }}>
      <div className="row between">
        <strong>مسابقهٔ لاک‌پشت تا خط پایان</strong>
        <span className="badge badge-green">{fa(clamped)}٪</span>
      </div>
      <div
        dir="ltr"
        style={{
          position: "relative",
          height: "54px",
          borderRadius: "999px",
          background:
            "linear-gradient(90deg, #dff3e8 0%, #bfe6d0 50%, #8fd0ae 100%)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {[25, 50, 75].map((mark) => (
          <span
            key={mark}
            style={{
              position: "absolute",
              left: `${mark}%`,
              top: 0,
              bottom: 0,
              width: "1px",
              background: "rgba(0,0,0,0.08)",
            }}
          />
        ))}
        <span
          style={{
            position: "absolute",
            left: `calc(${clamped}% - 18px)`,
            top: "8px",
            fontSize: "1.9rem",
            transition: "left 0.4s ease",
          }}
          title={`${clamped}٪ از منابع`}
        >
          🐢
        </span>
        <span
          style={{
            position: "absolute",
            right: "8px",
            top: "12px",
            fontSize: "1.6rem",
          }}
          title="خط پایان"
        >
          🏁
        </span>
      </div>
      <small className="muted">
        {finished
          ? "لاک‌پشت به خط پایان رسید! 🎉 منابع را کامل کرده‌ای."
          : `${fa(Math.max(0, 100 - clamped))} درصد دیگر تا خط پایان مانده است.`}
      </small>
    </div>
  );
}

export function ResourceProgressDashboard({ summary }: { summary: ResourceProgressSummary }) {
  const completedShare = summary.bySubject.map((subject) => ({
    ...subject,
    share:
      summary.completedUnits === 0
        ? 0
        : Math.round((subject.completedUnits / summary.completedUnits) * 100),
  }));

  let cursor = 0;
  const stops = completedShare.map((subject, index) => {
    const start = cursor;
    cursor += subject.share;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${cursor}%`;
  });

  const finishedResources = summary.rows.filter(
    (resource) => resource.percent >= 100,
  ).length;
  const startedResources = summary.rows.filter(
    (resource) => resource.percent > 0 && resource.percent < 100,
  ).length;
  const untouchedResources = summary.rows.filter(
    (resource) => resource.percent === 0,
  ).length;

  const bestResource = [...summary.rows].sort((a, b) => b.percent - a.percent)[0] ?? null;
  const weakestResource = [...summary.rows].sort((a, b) => a.percent - b.percent)[0] ?? null;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="card">
        <div className="section-head">
          <div>
            <h2>وضعیت منابع</h2>
            <small>پیشرفت کلی، درس‌ها و تک‌تک منابع</small>
          </div>
          <span className="badge">{fa(summary.rows.length)} منبع</span>
        </div>
        <div className="grid grid-3">
          <div className="stat">
            <div className="stat-value">{fa(summary.percent)}٪</div>
            <div className="stat-label">پیشرفت کل</div>
            <div className="progress" style={{ marginTop: "0.5rem" }}>
              <span style={{ width: `${Math.min(100, summary.percent)}%` }} />
            </div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {fa(summary.completedUnits)} / {fa(summary.totalUnits)}
            </div>
            <div className="stat-label">واحد انجام‌شده از کل</div>
          </div>
          <div className="stat">
            <div className="stat-value">{fa(summary.remainingUnits)}</div>
            <div className="stat-label">واحد باقی‌مانده</div>
          </div>
        </div>
        <hr className="divider" />
        <TurtleRace percent={summary.percent} />
      </div>

      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-value">🏁 {fa(finishedResources)}</div>
          <div className="stat-label">منبع تمام‌شده</div>
        </div>
        <div className="stat">
          <div className="stat-value">🐢 {fa(startedResources)}</div>
          <div className="stat-label">در حال پیشرفت</div>
        </div>
        <div className="stat">
          <div className="stat-value">😴 {fa(untouchedResources)}</div>
          <div className="stat-label">هنوز شروع نشده</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>پیشرفت هر درس</h2>
            <small>جمع واحدهای همان درس</small>
          </div>
          <div className="stack" style={{ gap: "0.65rem" }}>
            {summary.bySubject.map((subject) => (
              <div key={subject.subjectId}>
                <div className="row between">
                  <strong style={{ fontSize: "0.88rem" }}>{subject.subjectTitle}</strong>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    {fa(subject.completedUnits)} / {fa(subject.totalUnits)} — {fa(subject.percent)}٪
                  </span>
                </div>
                <div className="progress" style={{ marginTop: "0.25rem" }}>
                  <span style={{ width: `${Math.min(100, subject.percent)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h2>سهم درس‌ها در پیشرفت</h2>
            <small>سهم واحدهای انجام‌شده</small>
          </div>
          {summary.completedUnits === 0 ? (
            <div className="empty">هنوز پیشرفتی ثبت نشده است.</div>
          ) : (
            <div className="row" style={{ gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <div
                role="img"
                aria-label="نمودار دایره‌ای سهم درس‌ها در پیشرفت"
                style={{
                  width: "170px",
                  height: "170px",
                  borderRadius: "50%",
                  background: `conic-gradient(${stops.join(", ")})`,
                  border: "10px solid var(--card)",
                  boxShadow: "inset 0 0 0 1px var(--border)",
                }}
              />
              <div className="stack" style={{ gap: "0.35rem", flex: 1, minWidth: "180px" }}>
                {completedShare.map((subject, index) => (
                  <div key={subject.subjectId} className="row between" style={{ gap: "0.4rem" }}>
                    <span className="row" style={{ gap: "0.35rem" }}>
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: PIE_COLORS[index % PIE_COLORS.length],
                          display: "inline-block",
                        }}
                      />
                      <span style={{ fontSize: "0.82rem" }}>{subject.subjectTitle}</span>
                    </span>
                    <span className="badge">{fa(subject.share)}٪</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>قهرمانان مسابقه</h2>
            <small>بهترین و ضعیف‌ترین منبع</small>
          </div>
          <div className="stack" style={{ gap: "0.6rem" }}>
            {bestResource ? (
              <div className="alert alert-success" style={{ margin: 0 }}>
                🥇 بهترین منبع: <strong>{bestResource.title}</strong> — {fa(bestResource.percent)}٪
              </div>
            ) : null}
            {weakestResource ? (
              <div className="alert alert-warn" style={{ margin: 0 }}>
                🐢 منبعی که بیشتر به کمک نیاز دارد: <strong>{weakestResource.title}</strong> —{" "}
                {fa(weakestResource.percent)}٪
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h2>نکتهٔ مسابقه</h2>
          </div>
          <p className="muted" style={{ margin: 0, lineHeight: 1.9 }}>
            هر تست و هر صفحه مثل یک قدم برای لاک‌پشت است. لازم نیست سریع‌ترین باشی؛ فقط هر روز یک
            قدم جلو برو. 🐢🏁
          </p>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>پیشرفت تک‌تک منابع</h2>
            <small>نمودار میله‌ای هر منبع</small>
          </div>
        </div>
        <div className="stack" style={{ gap: "0.6rem" }}>
          {summary.rows.map((resource) => (
            <div key={resource.id}>
              <div className="row between">
                <span style={{ fontSize: "0.85rem" }}>
                  <strong>{resource.subjectTitle}</strong> — {resource.title}
                </span>
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  {fa(resource.completedUnits)} / {fa(resource.totalUnits)} — {fa(resource.percent)}٪
                </span>
              </div>
              <div className="progress" style={{ marginTop: "0.25rem" }}>
                <span style={{ width: `${Math.min(100, resource.percent)}%` }} />
              </div>
              <small className="muted" style={{ fontSize: "0.72rem" }}>
                {UNIT_TYPE_LABELS[resource.unitType] ?? resource.unitType} — {fa(resource.remainingUnits)} واحد مانده
              </small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
