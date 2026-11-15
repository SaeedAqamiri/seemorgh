import { notFound, redirect } from "next/navigation";
import { PsychResultView } from "@/components/psych-result-view";
import { requireCounselor } from "@/lib/auth";
import { getPsychAttemptView } from "@/lib/psych-server";

export default async function PsychAttemptResultPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const counselor = await requireCounselor();
  const { id, attemptId } = await params;
  const view = await getPsychAttemptView(counselor.workspaceId, attemptId);
  if (!view || view.attempt.testId !== id) notFound();
  if (view.attempt.status !== "submitted") redirect(`/counselor/psych-tests/${id}`);

  return (
    <PsychResultView
      view={view}
      backHref={`/counselor/psych-tests/${id}`}
      showParticipant
    />
  );
}
