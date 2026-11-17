import { formatTehranDateTime } from "@/lib/dates";
import type { CounselingReport } from "@/lib/counseling-report";

function List({
  title,
  items,
  badge,
}: {
  title: string;
  items: string[];
  badge: "badge-green" | "badge-warn" | "badge";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <strong style={{ fontSize: "0.84rem" }}>{title}</strong>
      <div className="row" style={{ flexWrap: "wrap", gap: "0.3rem", marginTop: "0.35rem" }}>
        {items.map((item) => (
          <span key={item} className={`badge ${badge}`} style={{ fontSize: "0.75rem", textAlign: "start" }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CounselingReportCard({
  report,
  title = "گزارش مشاوره تحصیلی",
}: {
  report: CounselingReport;
  title?: string;
}) {
  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <small>
            منبع: {report.source === "ai" ? "تحلیل هوشمند (AI)" : "تحلیل پایه"} —{" "}
            {formatTehranDateTime(report.createdAt)}
          </small>
        </div>
        <span className={`badge ${report.source === "ai" ? "badge-green" : ""}`}>
          {report.source === "ai" ? "AI" : "پایه"}
        </span>
      </div>

      <p style={{ margin: "0 0 0.7rem", lineHeight: 1.95, fontSize: "0.88rem" }}>{report.summary}</p>

      <div className="stack" style={{ gap: "0.55rem" }}>
        <List title="نقاط قوت" items={report.strengths} badge="badge-green" />
        <List title="نقاط ضعف" items={report.weaknesses} badge="badge-warn" />
        <List title="توصیه‌های مشاوره" items={report.recommendations} badge="badge" />
        {report.planningAdvice.length > 0 ? (
          <div>
            <strong style={{ fontSize: "0.84rem" }}>نکات اثرگذار بر برنامه‌ریزی خودکار</strong>
            <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", fontSize: "0.82rem", lineHeight: 1.9 }}>
              {report.planningAdvice.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
