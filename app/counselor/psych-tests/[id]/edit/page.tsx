import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { savePsychTestAction } from "@/app/actions/psych";
import { PsychTestEditor } from "@/components/psych-test-editor";
import { requireCounselor } from "@/lib/auth";
import { getPsychTestContent } from "@/lib/psych-server";
import type { PsychEditorPayload } from "@/lib/psych";

export default async function EditPsychTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { error } = await searchParams;

  const content = await getPsychTestContent(counselor.workspaceId, id);
  if (!content) notFound();
  if (content.test.status !== "draft") {
    redirect(
      `/counselor/psych-tests/${id}?error=${encodeURIComponent(
        "فقط آزمون پیش‌نویس قابل ویرایش است.",
      )}`,
    );
  }

  const payload: PsychEditorPayload = {
    title: content.test.title,
    description: content.test.description,
    dimensions: content.dimensions.map((dimension) => ({
      clientId: dimension.id,
      title: dimension.title,
      description: dimension.description,
      bands: dimension.bandsJson ?? [],
    })),
    questions: content.questions.map((question) => ({
      clientId: question.id,
      body: question.body,
      options: question.options.map((option) => ({
        clientId: option.id,
        body: option.body,
        scores: option.scoresJson ?? {},
      })),
    })),
    rules: content.rules,
  };

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <Link
          href={`/counselor/psych-tests/${id}`}
          className="muted"
          style={{ fontSize: "0.82rem" }}
        >
          ← بازگشت به آزمون
        </Link>
        <h1>ویرایش آزمون روان‌شناسی</h1>
        <small>{content.test.title}</small>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <PsychTestEditor
        testId={id}
        initial={payload}
        action={savePsychTestAction}
        submitLabel="ذخیره تغییرات"
      />
    </div>
  );
}
