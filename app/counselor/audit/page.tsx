import { requireCounselor } from "@/lib/auth";
import { AUDIT_LABELS, listAuditLogs } from "@/lib/audit";
import { formatTehranDateTime } from "@/lib/dates";

function summarize(diff: Record<string, unknown> | null): string {
  if (!diff) return "—";
  return Object.entries(diff)
    .slice(0, 4)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} مورد`;
      if (value === null || value === undefined) return `${key}: —`;
      if (typeof value === "object") return `${key}: …`;
      const text = String(value);
      return `${key}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`;
    })
    .join(" · ");
}

export default async function AuditPage() {
  const counselor = await requireCounselor();
  const logs = await listAuditLogs(counselor.workspaceId, { limit: 100 });

  return (
    <div className="stack">
      <div>
        <h1>تاریخچه تغییرات</h1>
        <small>ثبت تغییرات برنامه، آزمون و نمره برای حسابرسی.</small>
      </div>

      <div className="card">
        {logs.length === 0 ? (
          <div className="empty">هنوز رویدادی ثبت نشده است.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>رویداد</th>
                  <th>موجودیت</th>
                  <th>جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                      {formatTehranDateTime(log.createdAt)}
                    </td>
                    <td>{AUDIT_LABELS[log.action] ?? log.action}</td>
                    <td style={{ fontSize: "0.8rem" }}>{log.entity}</td>
                    <td style={{ fontSize: "0.8rem" }}>{summarize(log.diffJson)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
