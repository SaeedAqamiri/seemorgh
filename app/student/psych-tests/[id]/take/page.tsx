import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitPsychAttemptAction } from "@/app/actions/psych";
import { PsychTestForm } from "@/components/psych-test-form";
import { requireStudent } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { getAttemptForTaking } from "@/lib/psych-server";

export default async function TakeStudentPsychTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attempt?: string; error?: string }>;
}) {
  const { user } = await requireStudent();
  const { id } = await params;
  const { attempt: attemptId, error } = await searchParams;
  if (!attemptId) redirect(`/student/psych-tests`);

  const data = await getAttemptForTaking(user.workspaceId, id, attemptId, user.id);
  if (!data) notFound();
  if (data.attempt.status === "submitted") {
    redirect(`/student/psych-tests/${id}/result/${attemptId}`);
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <Link href="/student/psych-tests" className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به آزمون‌های روان‌شناسی
        </Link>
        <small className="muted">شروع: {formatTehranDateTime(data.attempt.startedAt)}</small>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <PsychTestForm
        testId={id}
        attemptId={attemptId}
        title={data.content.test.title}
        description={data.content.test.description}
        questions={data.content.questions}
        action={submitPsychAttemptAction}
      />
    </div>
  );
}
