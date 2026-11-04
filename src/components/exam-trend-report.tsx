import { OverallTrendChart } from "@/components/overall-trend-chart";
import { faNumber } from "@/lib/panel";
import type { TrendAnalysis } from "@/lib/exam-analysis";

function trendBadge(trend: TrendAnalysis["subjects"][number]["trend"]) {
  if (trend === "صعودی") return <span className="badge badge-green">📈 صعودی</span>;
  if (trend === "نزولی") return <span className="badge badge-danger">📉 نزولی</span>;
  if (trend === "ثابت") return <span className="badge">➖ ثابت</span>;
  return <span className="badge">نامشخص</span>;
}

export function ExamTrendReport({ trend }: { trend: TrendAnalysis }) {
  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2>تحلیل روند علمی</h2>
          <small>
            {trend.exams.length === 0
              ? "در این بازه آزمونی ثبت نشده است."
              : `${faNumber(trend.exams.length)} آزمون — ${faNumber(trend.totalStudyMinutes)} دقیقه مطالعه ثبت‌شده`}
          </small>
        </div>
      </div>

      {trend.exams.length === 0 ? (
        <div className="empty">نتیجه آزمون‌ها را در همین صفحه ثبت کنید تا روند ساخته شود.</div>
      ) : (
        <div className="stack" style={{ gap: "1rem" }}>
          <p style={{ margin: 0, lineHeight: 1.9 }}>{trend.summary}</p>

          <OverallTrendChart points={trend.overallSeries} />

          <div className="grid grid-2">
            {trend.subjects.map((subject) => (
              <div key={subject.subjectTitle} className="card" style={{ boxShadow: "none" }}>
                <div className="row between">
                  <strong>{subject.subjectTitle}</strong>
                  {trendBadge(subject.trend)}
                </div>
                <div className="row" style={{ gap: "0.5rem", marginTop: "0.35rem" }}>
                  <span className="badge">میانگین {faNumber(subject.average)}٪</span>
                  {subject.delta !== null ? (
                    <span className="badge">
                      تغییر {subject.delta > 0 ? "+" : ""}
                      {faNumber(subject.delta)}
                    </span>
                  ) : null}
                  <span className="badge">{faNumber(subject.studyMinutes)} دقیقه مطالعه</span>
                  <span className="badge">{faNumber(subject.practiceCount)} تمرین</span>
                </div>
                <div className="progress" style={{ marginTop: "0.45rem" }}>
                  <span style={{ width: `${Math.min(100, subject.average)}%` }} />
                </div>
                <p className="muted" style={{ margin: "0.5rem 0 0", lineHeight: 1.8 }}>
                  {subject.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
