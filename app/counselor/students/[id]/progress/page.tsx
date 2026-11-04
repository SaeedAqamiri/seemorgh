import Link from "next/link";
import { notFound } from "next/navigation";
import { ResourceProgressDashboard } from "@/components/resource-progress-dashboard";
import { requireCounselor } from "@/lib/auth";
import { getStudentDetail } from "@/lib/counselor";
import { summarizeResourceProgress } from "@/lib/resource-progress";

export default async function CounselorStudentProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const detail = await getStudentDetail(counselor.workspaceId, id);
  if (!detail) notFound();

  const summary = summarizeResourceProgress(detail.resources);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href={`/counselor/students/${id}`} className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به {detail.student.name}
          </Link>
          <h1>وضعیت منابع — {detail.student.name}</h1>
          <small>{summary.rows.length} منبع در حال پیگیری</small>
        </div>
        <Link className="btn btn-secondary btn-sm" href={`/counselor/students/${id}/resources`}>
          مدیریت منابع
        </Link>
      </div>
      <ResourceProgressDashboard summary={summary} />
    </div>
  );
}
