import Link from "next/link";
import { notFound } from "next/navigation";
import { ResourceManager } from "@/components/resource-manager";
import { requireCounselor } from "@/lib/auth";
import { getStudentDetail } from "@/lib/counselor";
import { summarizeResourceProgress } from "@/lib/resource-progress";

const SUCCESS: Record<string, string> = {
  resource: "منبع اضافه شد.",
  "resource-updated": "پیشرفت منبع ذخیره شد.",
  "resource-deleted": "منبع حذف شد.",
};

export default async function StudentResourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { success, error } = await searchParams;

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
          <h1>منابع — {detail.student.name}</h1>
          <small>
            {detail.resources.length} منبع · {summary.percent}٪ پیشرفت ·{" "}
            {summary.remainingUnits.toLocaleString("fa-IR")} واحد باقی‌مانده
          </small>
        </div>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <ResourceManager
        studentId={id}
        resources={detail.resources}
        subjects={detail.subjects}
      />
    </div>
  );
}
