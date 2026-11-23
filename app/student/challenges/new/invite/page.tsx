import Link from "next/link";
import { createChallengeAction } from "@/app/actions/challenges";
import { SubmitButton } from "@/components/submit-button";
import { requireStudent } from "@/lib/auth";
import { listChallengeableExams } from "@/lib/challenges";
import { tehranDateTimeInput } from "@/lib/dates";
import { getDb } from "@/db/client";
import { and, eq, inArray } from "drizzle-orm";
import { students } from "@/db/schema";

const toFa = (value: number) => value.toLocaleString("fa-IR");

export default async function InviteChallengePage({
  searchParams,
}: {
  searchParams: Promise<{
    inviteeIds?: string | string[];
    error?: string;
  }>;
}) {
  const { user } = await requireStudent();
  const params = await searchParams;
  const inviteeIds = [
    ...new Set(
      (Array.isArray(params.inviteeIds) ? params.inviteeIds : params.inviteeIds ? [params.inviteeIds] : [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const backPath = `/student/challenges/new${inviteeIds.length > 0 ? `?${inviteeIds.map((id) => `inviteeIds=${encodeURIComponent(id)}`).join("&")}` : ""}`;

  const db = await getDb();
  const inviteeRows =
    inviteeIds.length > 0
      ? await db
          .select({ id: students.id, name: students.name, grade: students.grade, field: students.field })
          .from(students)
          .where(
            and(
              inArray(students.id, inviteeIds),
              eq(students.workspaceId, user.workspaceId),
              eq(students.status, "active"),
            ),
          )
      : [];
  const exams = await listChallengeableExams(user.id);

  if (inviteeRows.length === 0) {
    return (
      <div className="stack">
        <h1>دعوت به چالش</h1>
        <div className="card empty">
          هیچ دانش‌آموزی انتخاب نشده است.
          <div style={{ marginTop: "0.6rem" }}>
            <Link className="btn btn-secondary btn-sm" href="/student/challenges/new">
              انتخاب دانش‌آموز
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <Link href={backPath} className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به انتخاب دانش‌آموز
        </Link>
        <h1>دعوت به چالش</h1>
        <small>آزمون و ساعت چالش را مشخص کن؛ دعوت برای هر نفر ارسال می‌شود.</small>
      </div>

      {params.error ? <div className="alert alert-error">{params.error}</div> : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>مخاطب‌ها ({toFa(inviteeRows.length)} نفر)</h3>
        <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
          {inviteeRows.map((row) => (
            <span key={row.id} className="badge badge-green">
              {row.name} — {row.grade} {row.field}
            </span>
          ))}
        </div>
      </div>

      <form action={createChallengeAction} className="stack">
        {inviteeRows.map((row) => (
          <input key={row.id} type="hidden" name="inviteeIds" value={row.id} />
        ))}

        <div className="card">
          <div className="field">
            <label htmlFor="examId">آزمون چالش (از آزمون‌های ساختهٔ خودت)</label>
            <select id="examId" name="examId" required defaultValue="">
              <option value="" disabled>
                یک آزمون انتخاب کن
              </option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title} — {toFa(exam.questionCount)} سوال، {toFa(exam.durationMinutes)} دقیقه
                </option>
              ))}
            </select>
            {exams.length === 0 ? (
              <small className="muted">
                هنوز آزمونی نساخته‌ای. اول از{" "}
                <Link href="/student/questions">بانک سوال</Link> یک آزمون تمرینی بساز.
              </small>
            ) : null}
          </div>

          {exams.length > 0 ? (
            <div className="stack" style={{ gap: "0.4rem", marginTop: "0.8rem" }}>
              {exams.map((exam) => (
                <details key={`specs-${exam.id}`}>
                  <summary className="muted" style={{ cursor: "pointer", fontSize: "0.82rem" }}>
                    مشخصات {exam.title}
                  </summary>
                  <ul style={{ margin: "0.4rem 0 0", paddingRight: "1.2rem" }}>
                    {exam.topics.map((topic) => (
                      <li key={topic} className="muted" style={{ fontSize: "0.82rem" }}>
                        {topic}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="field">
            <label htmlFor="scheduledAt">تاریخ و ساعت چالش</label>
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              dir="ltr"
              defaultValue={tehranDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000))}
              required
            />
            <small className="muted">
              آزمون دقیقاً در این ساعت برای همهٔ تاییدکننده‌ها باز می‌شود و تا پایان مدت آزمون +
              ۱۰ دقیقه فرصت شروع دارند.
            </small>
          </div>
          <div className="field">
            <label htmlFor="title">عنوان چالش (اختیاری)</label>
            <input
              id="title"
              name="title"
              type="text"
              placeholder="مثلاً: چالش زیست فصل ژنتیک"
            />
          </div>
        </div>

        <div className="row">
          <SubmitButton pendingLabel="در حال ارسال دعوت…">ارسال دعوت</SubmitButton>
          <Link className="btn btn-ghost" href="/student/challenges">
            انصراف
          </Link>
        </div>
      </form>
    </div>
  );
}
