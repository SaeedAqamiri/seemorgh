import Link from "next/link";
import { markAllReadAction, markReadAction } from "@/app/actions/notifications";
import { SubmitButton } from "@/components/submit-button";
import { formatTehranDateTime } from "@/lib/dates";
import type { NotificationItem } from "@/lib/notifications";

function notificationLink(item: NotificationItem): string | null {
  const payload = item.payload ?? {};
  if (item.type === "plan_approved" && typeof payload.weekStart === "string") {
    return `/student/week?week=${payload.weekStart}`;
  }
  if (item.type === "exam_published" && typeof payload.examId === "string") {
    return `/student/exams`;
  }
  if (item.type === "exam_graded" && typeof payload.examId === "string") {
    return `/student/exams/${payload.examId}/result`;
  }
  return null;
}

export function NotificationsList({
  items,
  role,
}: {
  items: NotificationItem[];
  role: "counselor" | "student";
}) {
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>اعلان‌ها</h1>
          <small>فقط درون‌برنامه‌ای؛ بدون پیامک یا تلگرام.</small>
        </div>
        <form action={markAllReadAction}>
          <SubmitButton className="btn-secondary btn-sm">خواندن همه</SubmitButton>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="card empty">اعلانی ندارید.</div>
      ) : (
        <div className="stack">
          {items.map((item) => {
            const payload = item.payload ?? {};
            const title =
              typeof payload.title === "string"
                ? payload.title
                : item.type === "plan_approved"
                  ? "برنامه هفته تأیید شد"
                  : item.type === "exam_published"
                    ? "آزمون جدید زمان‌بندی شد"
                    : item.type === "exam_graded"
                      ? "کارنامه آزمون به‌روز شد"
                      : "اعلان";
            const link = notificationLink(item);
            return (
              <div
                key={item.id}
                className="card"
                style={{
                  borderColor: item.readAt ? "var(--border)" : "var(--brand)",
                  background: item.readAt ? "var(--surface)" : "var(--brand-soft)",
                }}
              >
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <strong>{title}</strong>
                    {typeof payload.body === "string" ? (
                      <p className="muted" style={{ margin: "0.3rem 0" }}>
                        {payload.body}
                      </p>
                    ) : null}
                    <small>{formatTehranDateTime(item.createdAt)}</small>
                    {link ? (
                      <div>
                        <Link href={link}>مشاهده</Link>
                      </div>
                    ) : null}
                  </div>
                  {!item.readAt ? (
                    <form action={markReadAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <SubmitButton className="btn-ghost btn-sm">خوانده شد</SubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Link href={role === "counselor" ? "/counselor" : "/student"} className="muted">
        ← بازگشت
      </Link>
    </div>
  );
}
