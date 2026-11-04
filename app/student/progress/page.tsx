import Link from "next/link";
import { ResourceProgressDashboard } from "@/components/resource-progress-dashboard";
import { requireStudent } from "@/lib/auth";
import { getStudentResourceProgress } from "@/lib/resource-progress";

export default async function StudentProgressPage() {
  const { user, student } = await requireStudent();
  const summary = await getStudentResourceProgress(student.id, user.workspaceId);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>وضعیت منابع</h1>
          <small>{summary.rows.length} منبع در حال پیگیری</small>
        </div>
        <div className="row">
          <Link className="btn btn-secondary btn-sm" href="/student/resources">
            مدیریت منابع
          </Link>
          <Link className="btn btn-secondary btn-sm" href="/student/report">
            گزارش من
          </Link>
        </div>
      </div>
      <ResourceProgressDashboard summary={summary} />
    </div>
  );
}
