"use client";

export type SubjectGoalOption = {
  id: string;
  title: string;
  enabled: boolean;
  metric: "percent" | "score";
  current: number;
  target: number;
  weight: number;
  examPercent: number | null;
  resourceRemaining: number;
  testsPerHour: number;
  exercisesPerHour: number;
};

function metricLabel(metric: "percent" | "score"): string {
  return metric === "score" ? "نمره" : "درصد";
}

export function SubjectGoalsEditor({ rows }: { rows: SubjectGoalOption[] }) {
  if (rows.length === 0) {
    return <div className="empty">برای این رشته درس اختصاصی‌ای تعریف نشده است.</div>;
  }

  return (
    <div className="stack" style={{ gap: "0.6rem" }}>
      <div className="alert alert-warn" style={{ lineHeight: 1.9 }}>
        اگر سابقهٔ آزمون دارید، وضعیت فعلی از <strong>آخرین کارنامه</strong> پیش‌پر شده است؛
        آن را با سابقهٔ خود هماهنگ نگه دارید تا برنامه‌ریزی گیج نشود. اگر هنوز سابقهٔ آموزشی یا
        آزمونی ندارید، حتماً وضعیت فعلی هر درس را دستی وارد کنید.
      </div>

      {rows.map((row) => (
        <details key={row.id} className="card" style={{ boxShadow: "none" }}>
          <summary style={{ cursor: "pointer" }}>
            <span className="row between" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <strong>{row.title}</strong>
              <span className={`badge ${row.enabled ? "badge-green" : ""}`}>
                {row.examPercent !== null
                  ? `آخرین آزمون: ${row.examPercent.toLocaleString("fa-IR")}٪`
                  : row.enabled
                    ? `وضعیت فعلی: ${row.current.toLocaleString("fa-IR")} ${metricLabel(row.metric)}`
                    : "غیرفعال"}
              </span>
            </span>
            <span className="muted" style={{ display: "block", fontSize: "0.78rem" }}>
              هدف: {row.target.toLocaleString("fa-IR")} {metricLabel(row.metric)} · باقی‌مانده
              منبع: {row.resourceRemaining.toLocaleString("fa-IR")} واحد
            </span>
          </summary>

          <div className="form-grid" style={{ marginTop: "0.7rem" }}>
            <input type="hidden" name="subjectId" value={row.id} />
            <div className="field">
              <label className="row" style={{ gap: "0.35rem" }}>
                <input type="checkbox" name="enabled" value={row.id} defaultChecked={row.enabled} />
                فعال در برنامه
              </label>
            </div>
            <div className="field">
              <label>نوع سنجش</label>
              <select name="metric" defaultValue={row.metric}>
                <option value="percent">درصد کنکور</option>
                <option value="score">نمره از ۲۰ (نهایی)</option>
              </select>
            </div>
            <div className="field">
              <label>وضعیت فعلی</label>
              <input
                type="number"
                name="currentValue"
                step="0.5"
                min={0}
                max={100}
                defaultValue={row.current}
              />
              {row.examPercent !== null ? (
                <small className="muted">پیش‌پر از آخرین کارنامه</small>
              ) : (
                <small className="muted">بدون سابقه آزمون؛ دستی وارد کنید</small>
              )}
            </div>
            <div className="field">
              <label>مقدار مطلوب</label>
              <input
                type="number"
                name="targetValue"
                step="0.5"
                min={0}
                max={100}
                defaultValue={row.target}
              />
            </div>
            <div className="field">
              <label>وزن درس</label>
              <select name="weight" defaultValue={String(row.weight)}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>تست/ساعت</label>
              <input
                type="number"
                name={`testsPerHour_${row.id}`}
                min={1}
                max={120}
                defaultValue={row.testsPerHour}
              />
            </div>
            <div className="field">
              <label>تمرین/ساعت</label>
              <input
                type="number"
                name={`exercisesPerHour_${row.id}`}
                min={1}
                max={120}
                defaultValue={row.exercisesPerHour}
              />
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
