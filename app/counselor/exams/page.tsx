import Link from "next/link";
import { requireCounselor } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { finalizeExpiredAttempts, listExams } from "@/lib/exams-server";

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "پیش‌نویس", className: "badge-warn" },
  scheduled: { label: "زمان‌بندی‌شده", className: "badge" },
  open: { label: "در حال اجرا", className: "badge-green" },
  closed: { label: "بسته", className: "badge" },
  graded: { label: "تصحیح‌شده", className: "badge-green" },
};

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { success, error } = await searchParams;
  await finalizeExpiredAttempts(counselor.workspaceId);
  const examRows = await listExams(counselor.workspaceId);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>آزمون‌ها</h1>
          <small>گزینش از بانک سوال خودتان، اجرای زمان‌دار و تصحیح.</small>
        </div>
        <Link className="btn" href="/counselor/exams/new">
          ساخت آزمون
        </Link>
      </div>

      {success === "deleted" ? <div className="alert alert-success">آزمون پیش‌نویس حذف شد.</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        {examRows.length === 0 ? (
          <div className="empty">هنوز آزمونی نساخته‌اید.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>آزمون</th>
                  <th>زمان</th>
                  <th>مدت</th>
                  <th>تخصیص</th>
                  <th>تحویل</th>
                  <th>تصحیح</th>
                  <th>وضعیت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {examRows.map((exam) => {
                  const status = STATUS[exam.status] ?? { label: exam.status, className: "badge" };
                  return (
                    <tr key={exam.id}>
                      <td>
                        <Link href={`/counselor/exams/${exam.id}`}>
                          <strong>{exam.title}</strong>
                        </Link>
                        {exam.totalScore > 0 ? (
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            بارم کل: {exam.totalScore}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>
                        {formatTehranDateTime(exam.startAt)}
                        <div className="muted">تا {formatTehranDateTime(exam.endAt)}</div>
                      </td>
                      <td>{exam.durationMinutes} دقیقه</td>
                      <td>{exam.assigned}</td>
                      <td>{exam.submitted}</td>
                      <td>{exam.graded}</td>
                      <td>
                        <span className={`badge ${status.className}`}>{status.label}</span>
                      </td>
                      <td>
                        <Link className="btn btn-secondary btn-sm" href={`/counselor/exams/${exam.id}`}>
                          مدیریت
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
