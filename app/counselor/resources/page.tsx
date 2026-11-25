import { ResourcePoolManager } from "@/components/resource-pool-manager";
import { requireCounselor } from "@/lib/auth";
import { listResourcePool } from "@/lib/resource-pool";
import { listAllWorkspaceSubjects } from "@/lib/subject-catalog";

const SUCCESS: Record<string, string> = {
  added: "منبع به استخر اضافه شد.",
  deleted: "منبع از استخر حذف شد.",
  cover: "جلد منبع ذخیره شد.",
};

export default async function ResourcePoolPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { success, error } = await searchParams;

  const [books, subjects] = await Promise.all([
    listResourcePool(counselor.workspaceId),
    listAllWorkspaceSubjects(counselor.workspaceId),
  ]);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <h1>استخر منابع</h1>
        <small>
          کتاب‌های کمک‌آموزشی با فصل‌بندی کامل؛ دانش‌آموزان از همین استخر منبع انتخاب می‌کنند.
        </small>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <ResourcePoolManager books={books} subjects={subjects} />
    </div>
  );
}
