import { formatJalaliNumeric } from "@/lib/dates";
import type { StudentSummary } from "@/lib/student-summary";

const toFa = (value: number) => value.toLocaleString("fa-IR");

export function StudentSummaryCard({
  summary,
  title = "خلاصه وضعیت من",
}: {
  summary: StudentSummary;
  title?: string;
}) {
  const maxActivity = Math.max(
    1,
    ...summary.subjectActivity.map((row) => row.testCount + row.exerciseCount),
  );

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>

      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>درصد آخرین آزمون‌ها</h3>
      {summary.lastExams.length === 0 ? (
        <p className="muted">هنوز آزمونی ثبت نشده است.</p>
      ) : (
        <div className="grid-3">
          {summary.lastExams.map((exam) => (
            <div key={exam.id} className="stat">
              <div className="stat-value">{toFa(exam.overallPercent)}٪</div>
              <div className="stat-label">{exam.title}</div>
              <small className="muted">{formatJalaliNumeric(exam.examDate)}</small>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ margin: "1.1rem 0 0.5rem", fontSize: "0.95rem" }}>
        تست و تمرین به تفکیک درس
        {summary.totalTests + summary.totalExercises > 0 ? (
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}>
            {" "}
            (مجموع: {toFa(summary.totalTests)} تست، {toFa(summary.totalExercises)} تمرین)
          </span>
        ) : null}
      </h3>
      {summary.subjectActivity.length === 0 ? (
        <p className="muted">هنوز تست یا تمرینی در دفترچه عملکرد ثبت نشده است.</p>
      ) : (
        <div className="stack" style={{ gap: "0.5rem" }}>
          {summary.subjectActivity.map((row) => {
            const total = row.testCount + row.exerciseCount;
            return (
              <div key={row.subjectId ?? row.subjectTitle}>
                <div className="row between" style={{ fontSize: "0.85rem" }}>
                  <span>{row.subjectTitle}</span>
                  <span className="muted">
                    {row.testCount > 0 ? `${toFa(row.testCount)} تست` : ""}
                    {row.testCount > 0 && row.exerciseCount > 0 ? " · " : ""}
                    {row.exerciseCount > 0 ? `${toFa(row.exerciseCount)} تمرین` : ""}
                  </span>
                </div>
                <div className="progress" style={{ marginTop: "0.25rem" }}>
                  <span style={{ width: `${Math.round((total / maxActivity) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
