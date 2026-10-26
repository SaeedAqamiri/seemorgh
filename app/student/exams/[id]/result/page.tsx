import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { examAnswers } from "@/db/schema";
import { requireStudent } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { parseSnapshot } from "@/lib/exam";
import { getStudentExamContext } from "@/lib/exams-server";

export default async function ExamResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { student } = await requireStudent();
  const { id } = await params;
  const { auto } = await searchParams;

  const context = await getStudentExamContext(student.id, id);
  if (!context) notFound();
  if (!context.attempt) redirect("/student/exams");
  if (context.attempt.status === "in_progress") {
    redirect(`/student/exams/${id}/take`);
  }

  const snapshot = parseSnapshot(context.exam.questionSnapshotJson);
  const db = await getDb();
  const answers = await db
    .select()
    .from(examAnswers)
    .where(eq(examAnswers.attemptId, context.attempt.id));
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));

  const percent =
    context.attempt.maxScore === 0
      ? 0
      : Math.round((context.attempt.score / context.attempt.maxScore) * 100);

  const topicMap = new Map<string, { answered: number; correct: number }>();
  for (const item of snapshot.items) {
    const answer = answerByQuestion.get(item.id);
    const key = item.topic || "بدون مبحث";
    const current = topicMap.get(key) ?? { answered: 0, correct: 0 };
    if (answer?.answerJson !== null && answer?.answerJson !== undefined) {
      current.answered += 1;
      if (answer.isCorrect) current.correct += 1;
    }
    topicMap.set(key, current);
  }

  const pendingShort = snapshot.items.filter((item) => {
    if (item.type !== "short") return false;
    const answer = answerByQuestion.get(item.id);
    return !answer?.gradedAt;
  }).length;

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <Link href="/student/exams" className="muted" style={{ fontSize: "0.82rem" }}>
            ← آزمون‌ها
          </Link>
          <h1>{context.exam.title}</h1>
          <small>
            تحویل: {context.attempt.submittedAt ? formatTehranDateTime(context.attempt.submittedAt) : "—"}
          </small>
        </div>
        <div className="stat">
          <div className="stat-value">
            {context.attempt.score} / {context.attempt.maxScore}
          </div>
          <div className="stat-label">{percent}٪</div>
        </div>
      </div>

      {auto ? (
        <div className="alert alert-warn">
          زمان آزمون تمام شد و پاسخ‌های ذخیره‌شده به‌صورت خودکار تحویل داده شد.
        </div>
      ) : null}
      {pendingShort > 0 ? (
        <div className="alert alert-warn">
          {pendingShort} پاسخ کوتاه در انتظار تصحیح مشاور است؛ نمره نهایی پس از تصحیح به‌روز می‌شود.
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <h2>دقت مباحث</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>مبحث</th>
                <th>پاسخ‌داده</th>
                <th>صحیح</th>
                <th>دقت</th>
              </tr>
            </thead>
            <tbody>
              {[...topicMap.entries()].map(([topic, stats]) => (
                <tr key={topic}>
                  <td>{topic}</td>
                  <td>{stats.answered}</td>
                  <td>{stats.correct}</td>
                  <td>
                    {stats.answered === 0
                      ? "—"
                      : `${Math.round((stats.correct / stats.answered) * 100)}٪`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>پاسخ‌نامه</h2>
          <small>{snapshot.items.length} سوال</small>
        </div>
        <div className="stack" style={{ gap: "0.6rem" }}>
          {snapshot.items.map((item, index) => {
            const answer = answerByQuestion.get(item.id);
            const isMcq = item.type === "mcq";
            const pending = item.type === "short" && !answer?.gradedAt;
            return (
              <div key={item.id} className="card" style={{ boxShadow: "none" }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <strong style={{ lineHeight: 1.7 }}>
                    {index + 1}. {item.body}
                  </strong>
                  <span
                    className={`badge ${
                      pending ? "badge-warn" : answer?.isCorrect ? "badge-green" : "badge-danger"
                    }`}
                  >
                    {pending
                      ? "در انتظار تصحیح"
                      : answer?.isCorrect
                        ? "صحیح"
                        : isMcq
                          ? "نادرست"
                          : `${answer?.score ?? 0} از ${item.score}`}
                  </span>
                </div>
                <div className="stack" style={{ gap: "0.2rem", marginTop: "0.4rem", fontSize: "0.86rem" }}>
                  <div>
                    پاسخ تو:{" "}
                    <strong>
                      {isMcq && typeof answer?.answerJson === "number"
                        ? `${answer.answerJson}) ${item.options?.[answer.answerJson - 1] ?? ""}`
                        : String(answer?.answerJson ?? "بدون پاسخ")}
                    </strong>
                  </div>
                  {isMcq ? (
                    <div className="muted">
                      پاسخ صحیح: {String(item.correct)}){" "}
                      {typeof item.correct === "number" ? item.options?.[item.correct - 1] : ""}
                    </div>
                  ) : null}
                  {item.explanation ? <div className="muted">توضیح: {item.explanation}</div> : null}
                  {answer?.feedback ? <div className="muted">بازخورد مشاور: {answer.feedback}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
