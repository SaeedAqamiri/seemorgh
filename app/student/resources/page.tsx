import Link from "next/link";
import { ResourceManager } from "@/components/resource-manager";
import { requireStudent } from "@/lib/auth";
import { getStudentDetail } from "@/lib/counselor";
import { summarizeResourceProgress } from "@/lib/resource-progress";

const SUCCESS: Record<string, string> = {
  resource: "منبع اضافه شد.",
  "resource-updated": "پیشرفت منبع ذخیره شد.",
  "resource-deleted": "منبع حذف شد.",
};

export default async function StudentResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { user, student } = await requireStudent();
  const { success, error } = await searchParams;

  const detail = await getStudentDetail(user.workspaceId, student.id);
  if (!detail) {
    return <div className="card empty">پرونده دانش‌آموز پیدا نشد.</div>;
  }

  const summary = summarizeResourceProgress(detail.resources);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href="/student/report" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به گزارش من
          </Link>
          <h1>منابع من</h1>
          <small>
            {detail.resources.length} منبع · {summary.percent}٪ پیشرفت ·{" "}
            {summary.remainingUnits.toLocaleString("fa-IR")} واحد باقی‌مانده
          </small>
        </div>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <ResourceManager
        studentId={student.id}
        resources={detail.resources}
        subjects={detail.subjects}
      />
    </div>
  );
}
