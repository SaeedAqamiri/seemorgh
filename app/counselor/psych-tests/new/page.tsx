import Link from "next/link";
import { savePsychTestAction } from "@/app/actions/psych";
import { PsychTestEditor } from "@/components/psych-test-editor";
import { requireCounselor } from "@/lib/auth";
import type { PsychEditorPayload } from "@/lib/psych";

function initialPayload(): PsychEditorPayload {
  const dimensionId = "dimension-initial";
  return {
    title: "",
    description: "",
    dimensions: [
      {
        clientId: dimensionId,
        title: "",
        description: "",
        bands: [
          { min: 0, max: 4, label: "", code: "", analysis: "" },
          { min: 5, max: null, label: "", code: "", analysis: "" },
        ],
      },
    ],
    questions: [
      {
        clientId: "question-initial",
        body: "",
        options: [
          { clientId: "option-initial-1", body: "", scores: { [dimensionId]: 0 } },
          { clientId: "option-initial-2", body: "", scores: { [dimensionId]: 0 } },
        ],
      },
    ],
    rules: [],
  };
}

export default async function NewPsychTestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCounselor();
  const { error } = await searchParams;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <Link href="/counselor/psych-tests" className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به آزمون‌های روان‌شناسی
        </Link>
        <h1>ساخت آزمون روان‌شناسی</h1>
        <small>
          بُعدها، سوال‌ها، گزینه‌ها و امتیاز هر گزینه را مشخص کنید. بعد از ذخیره، پیش‌نمایش و
          انتشار در دسترس است.
        </small>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <PsychTestEditor
        initial={initialPayload()}
        action={savePsychTestAction}
        submitLabel="ذخیره پیش‌نویس"
      />
    </div>
  );
}
