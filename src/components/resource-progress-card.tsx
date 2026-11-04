import { UNIT_TYPE_LABELS } from "@/lib/subjects";
import type { ResourceProgressSummary } from "@/lib/resource-progress";

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

export function ResourceProgressCard({
  summary,
  title = "وضعیت منابع",
  description,
  emptyText = "هنوز منبعی ثبت نشده است.",
}: {
  summary: ResourceProgressSummary;
  title?: string;
  description?: string;
  emptyText?: string;
}) {
  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {description ? <small>{description}</small> : null}
        </div>
        <small>{fa(summary.rows.length)} منبع</small>
      </div>

      {summary.rows.length === 0 ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="stack" style={{ gap: "0.9rem" }}>
          <div className="grid grid-3">
            <div className="stat">
              <div className="stat-value">{summary.percent}٪</div>
              <div className="stat-label">پیشرفت کل منابع</div>
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

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>درس</th>
                  <th>منبع</th>
                  <th>نوع</th>
                  <th>پیشرفت</th>
                  <th>انجام‌شده / کل</th>
                  <th>باقی‌مانده</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((resource) => (
                  <tr key={resource.id}>
                    <td>{resource.subjectTitle}</td>
                    <td>
                      <strong>{resource.title}</strong>
                      <div className="progress" style={{ marginTop: "0.35rem", minWidth: "120px" }}>
                        <span style={{ width: `${Math.min(100, resource.percent)}%` }} />
                      </div>
                    </td>
                    <td>{UNIT_TYPE_LABELS[resource.unitType] ?? resource.unitType}</td>
                    <td>{resource.percent}٪</td>
                    <td>
                      {fa(resource.completedUnits)} / {fa(resource.totalUnits)}
                    </td>
                    <td>{fa(resource.remainingUnits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {summary.bySubject.length > 1 ? (
            <details>
              <summary className="muted" style={{ cursor: "pointer", fontSize: "0.82rem" }}>
                جمع به تفکیک درس
              </summary>
              <div className="table-wrap" style={{ marginTop: "0.5rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th>درس</th>
                      <th>منبع</th>
                      <th>پیشرفت</th>
                      <th>انجام‌شده / کل</th>
                      <th>باقی‌مانده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.bySubject.map((subject) => (
                      <tr key={subject.subjectId}>
                        <td>{subject.subjectTitle}</td>
                        <td>{fa(subject.resources.length)}</td>
                        <td>{subject.percent}٪</td>
                        <td>
                          {fa(subject.completedUnits)} / {fa(subject.totalUnits)}
                        </td>
                        <td>{fa(subject.remainingUnits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}
