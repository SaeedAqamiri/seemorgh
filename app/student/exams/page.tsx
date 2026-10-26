import Link from "next/link";
import { startExamAction } from "@/app/actions/exams";
import { SubmitButton } from "@/components/submit-button";
import { requireStudent } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { finalizeExpiredAttempts, getStudentExamList } from "@/lib/exams-server";

export default async function StudentExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { student } = await requireStudent();
  const { error } = await searchParams;
  await finalizeExpiredAttempts();
  const rows = await getStudentExamList(student.id);
  const now = Date.now();

  return (
    <div className="stack">
      <div>
        <h1>آزمون‌ها</h1>
        <small>آزمون‌هایی که مشاور برایت زمان‌بندی کرده است.</small>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {rows.length === 0 ? (
        <div className="card empty">هنوز آزمونی برای تو زمان‌بندی نشده است.</div>
      ) : (
        <div className="stack">
          {rows.map(({ exam, attempt }) => {
            const beforeStart = now < exam.startAt.getTime();
            const afterEnd = now >= exam.endAt.getTime();
            const inProgress = attempt?.status === "in_progress";
            const finished = attempt && attempt.status !== "in_progress";
            const canStart = !beforeStart && !afterEnd && !attempt;

            return (
              <div key={exam.id} className="card">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <h2>{exam.title}</h2>
                    <small>
                      {formatTehranDateTime(exam.startAt)} تا {formatTehranDateTime(exam.endAt)} —{" "}
                      {exam.durationMinutes} دقیقه
                    </small>
                    <div className="row" style={{ marginTop: "0.5rem" }}>
                      {beforeStart ? <span className="badge badge-warn">هنوز شروع نشده</span> : null}
                      {!beforeStart && !afterEnd ? (
                        <span className="badge badge-green">بازه فعال</span>
                      ) : null}
                      {afterEnd ? <span className="badge">پایان یافته</span> : null}
                      {inProgress ? <span className="badge badge-warn">در حال اجرا</span> : null}
                      {finished ? (
                        <span className="badge badge-green">
                          {attempt.status === "graded" ? "تصحیح‌شده" : "تحویل‌شده"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="stack" style={{ gap: "0.35rem" }}>
                    {canStart ? (
                      <form action={startExamAction}>
                        <input type="hidden" name="examId" value={exam.id} />
                        <SubmitButton pendingLabel="در حال شروع…">شروع آزمون</SubmitButton>
                      </form>
                    ) : null}
                    {inProgress ? (
                      <Link className="btn" href={`/student/exams/${exam.id}/take`}>
                        ادامه آزمون
                      </Link>
                    ) : null}
                    {finished ? (
                      <Link className="btn btn-secondary" href={`/student/exams/${exam.id}/result`}>
                        دیدن کارنامه
                      </Link>
                    ) : null}
                    {!attempt && beforeStart ? <span className="muted">منتظر زمان شروع بمان.</span> : null}
                    {!attempt && afterEnd ? <span className="muted">مهلت شرکت گذشته است.</span> : null}
                  </div>
                </div>
                {finished ? (
                  <div className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                    نمره: {attempt.score} از {attempt.maxScore}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
