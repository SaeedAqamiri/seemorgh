import { notFound, redirect } from "next/navigation";
import { PsychResultView } from "@/components/psych-result-view";
import { requireStudent } from "@/lib/auth";
import { getPsychAttemptView } from "@/lib/psych-server";

export default async function StudentPsychAttemptResultPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { user } = await requireStudent();
  const { id, attemptId } = await params;
  const view = await getPsychAttemptView(user.workspaceId, attemptId);
  if (!view || view.attempt.testId !== id || view.attempt.userId !== user.id) notFound();
  if (view.attempt.status !== "submitted") {
    redirect(`/student/psych-tests/${id}/take?attempt=${view.attempt.id}`);
  }

  return <PsychResultView view={view} backHref="/student/psych-tests" />;
}
