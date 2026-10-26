import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ExamRunner } from "@/components/exam-runner";
import { getDb } from "@/db/client";
import { examAnswers } from "@/db/schema";
import { requireStudent } from "@/lib/auth";
import { clientSnapshot, parseSnapshot } from "@/lib/exam";
import { finalizeAttempt, getStudentExamContext } from "@/lib/exams-server";

export default async function TakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { student } = await requireStudent();
  const { id } = await params;

  const context = await getStudentExamContext(student.id, id);
  if (!context) notFound();
  if (!context.attempt) redirect("/student/exams");
  if (context.attempt.status !== "in_progress") {
    redirect(`/student/exams/${id}/result`);
  }

  const now = new Date();
  if (now > context.attempt.deadlineAt) {
    await finalizeAttempt(context.attempt.id, { auto: true, now });
    redirect(`/student/exams/${id}/result?auto=1`);
  }

  const snapshot = parseSnapshot(context.exam.questionSnapshotJson);
  const items = clientSnapshot(snapshot);

  const db = await getDb();
  const answers = await db
    .select()
    .from(examAnswers)
    .where(eq(examAnswers.attemptId, context.attempt.id));

  const initialAnswers: Record<string, string | number | undefined> = {};
  for (const answer of answers) {
    if (answer.answerJson === null || answer.answerJson === undefined) continue;
    initialAnswers[answer.questionId] =
      typeof answer.answerJson === "number" || typeof answer.answerJson === "string"
        ? answer.answerJson
        : String(answer.answerJson);
  }

  return (
    <div className="stack" style={{ gap: "0.75rem" }}>
      <div>
        <Link href="/student/exams" className="muted" style={{ fontSize: "0.82rem" }}>
          ← آزمون‌ها
        </Link>
        <h1>{context.exam.title}</h1>
        <small>پاسخ‌ها به‌صورت خودکار ذخیره می‌شوند.</small>
      </div>

      <ExamRunner
        examId={id}
        title={context.exam.title}
        items={items}
        initialAnswers={initialAnswers}
        serverNow={now.toISOString()}
        deadlineAt={context.attempt.deadlineAt.toISOString()}
      />
    </div>
  );
}
