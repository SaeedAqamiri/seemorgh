import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitPsychAttemptAction } from "@/app/actions/psych";
import { PsychTestForm } from "@/components/psych-test-form";
import { requireCounselor } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { getAttemptForTaking } from "@/lib/psych-server";

export default async function TakePsychTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attempt?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { attempt: attemptId, error } = await searchParams;
  if (!attemptId) redirect(`/counselor/psych-tests/${id}`);

  const data = await getAttemptForTaking(counselor.workspaceId, id, attemptId, counselor.id);
  if (!data) notFound();
  if (data.attempt.status === "submitted") {
    redirect(`/counselor/psych-tests/${id}/result/${attemptId}`);
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <Link href={`/counselor/psych-tests/${id}`} className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به آزمون
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
