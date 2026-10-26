import Link from "next/link";
import { notFound } from "next/navigation";
import { gradeShortAnswerAction } from "@/app/actions/exams";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { getExamResults } from "@/lib/exams-server";

export default async function GradeAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; attemptId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id, attemptId } = await params;
  const { success, error } = await searchParams;

  const results = await getExamResults(counselor.workspaceId, id);
  if (!results) notFound();

  const entry = results.attempts.find((attempt) => attempt.attempt.id === attemptId);
  if (!entry) notFound();

  const answerByQuestion = new Map(entry.answers.map((answer) => [answer.questionId, answer]));
  const shortItems = results.snapshot.items.filter((item) => item.type === "short");

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <Link href={`/counselor/exams/${id}`} className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به آزمون
          </Link>
          <h1>کارنامه {entry.student.name}</h1>
          <small>
            {results.exam.title} — شروع {formatTehranDateTime(entry.attempt.startedAt)} —{" "}
            {entry.attempt.submittedAt
              ? `تحویل ${formatTehranDateTime(entry.attempt.submittedAt)}`
              : "در حال آزمون"}
          </small>
        </div>
        <div className="stat">
          <div className="stat-value">
            {entry.attempt.score} / {entry.attempt.maxScore}
          </div>
          <div className="stat-label">
            {entry.attempt.maxScore === 0
              ? ""
              : `${Math.round((entry.attempt.score / entry.attempt.maxScore) * 100)}٪`}
          </div>
        </div>
      </div>

      {success === "graded" ? <div className="alert alert-success">نمره کوتاه‌پاسخ ذخیره شد.</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="section-head">
          <h2>پاسخ‌های کوتاه</h2>
          <small>{shortItems.length} سوال کوتاه‌پاسخ</small>
        </div>
        {shortItems.length === 0 ? (
          <div className="empty">این آزمون کوتاه‌پاسخ ندارد؛ تصحیح خودکار انجام شده است.</div>
        ) : (
          <div className="stack">
            {shortItems.map((item, index) => {
              const answer = answerByQuestion.get(item.id);
              return (
                <div key={item.id} className="card" style={{ boxShadow: "none" }}>
                  <div className="row between">
                    <strong>
                      سوال {index + 1} — {item.topic || "بدون مبحث"} (بارم {item.score})
                    </strong>
                    {answer?.gradedAt ? (
                      <span className="badge badge-green">نمره: {answer.score}</span>
                    ) : (
                      <span className="badge badge-warn">تصحیح نشده</span>
                    )}
                  </div>
                  <p style={{ margin: "0.5rem 0" }}>{item.body}</p>
                  <div className="alert" style={{ background: "var(--surface-2)" }}>
                    پاسخ دانش‌آموز: <strong>{String(answer?.answerJson ?? "—")}</strong>
                  </div>
                  <details open={!answer?.gradedAt}>
                    <summary className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                      ثبت نمره
                    </summary>
                    <form action={gradeShortAnswerAction} className="stack" style={{ marginTop: "0.5rem" }}>
                      <input type="hidden" name="examId" value={id} />
                      <input type="hidden" name="attemptId" value={attemptId} />
                      <input type="hidden" name="answerId" value={answer?.id ?? ""} />
                      <div className="form-grid">
                        <div className="field">
                          <label>نمره (۰ تا {item.score})</label>
                          <input
                            name="score"
                            type="number"
                            min={0}
                            max={item.score}
                            defaultValue={answer?.score ?? 0}
                          />
                        </div>
                        <div className="field" style={{ gridColumn: "span 2" }}>
                          <label>بازخورد</label>
                          <input name="feedback" defaultValue={answer?.feedback ?? ""} />
                        </div>
                        <div className="field">
                          <SubmitButton className="btn-secondary">ذخیره نمره</SubmitButton>
                        </div>
                      </div>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>همه پاسخ‌ها</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>مبحث</th>
                <th>نوع</th>
                <th>پاسخ</th>
                <th>پاسخ صحیح</th>
                <th>نمره</th>
              </tr>
            </thead>
            <tbody>
              {results.snapshot.items.map((item, index) => {
                const answer = answerByQuestion.get(item.id);
                return (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.topic || "—"}</td>
                    <td>{item.type === "mcq" ? "چهارگزینه‌ای" : "کوتاه"}</td>
                    <td>
                      {item.type === "mcq" && typeof answer?.answerJson === "number"
                        ? `${answer.answerJson}) ${item.options?.[answer.answerJson - 1] ?? ""}`
                        : String(answer?.answerJson ?? "—")}
                    </td>
                    <td>
                      {item.type === "mcq" && typeof item.correct === "number"
                        ? `${item.correct}) ${item.options?.[item.correct - 1] ?? ""}`
                        : String(item.correct)}
                    </td>
                    <td>{answer?.score ?? 0} / {item.score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
