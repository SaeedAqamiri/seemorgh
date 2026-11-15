import { SubmitButton } from "./submit-button";
import type { PsychTestQuestion } from "@/lib/psych-server";

export function PsychTestForm({
  testId,
  attemptId,
  title,
  description,
  questions,
  action,
}: {
  testId: string;
  attemptId: string;
  title: string;
  description: string;
  questions: PsychTestQuestion[];
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="stack" style={{ gap: "0.9rem" }}>
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="attemptId" value={attemptId} />

      <div className="card">
        <h1>{title}</h1>
        <small>
          {description ||
            "برای هر سوال یک گزینه انتخاب کنید. پاسخ همه سوال‌ها برای ثبت نتیجه لازم است."}
        </small>
        <div className="alert alert-warn" style={{ marginTop: "0.6rem" }}>
          {questions.length.toLocaleString("fa-IR")} سوال — بدون محدودیت زمانی
        </div>
      </div>

      <div className="stack" style={{ gap: "0.8rem" }}>
        {questions.map((question, index) => (
          <div key={question.id} className="card">
            <strong style={{ lineHeight: 1.8 }}>
              {index + 1}. {question.body}
            </strong>
            <div className="stack" style={{ gap: "0.35rem", marginTop: "0.6rem" }}>
              {question.options.map((option, optionIndex) => (
                <label
                  key={option.id}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "flex-start",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "0.5rem 0.65rem",
                    margin: 0,
                    fontWeight: 400,
                    cursor: "pointer",
                    background: "#fff",
                  }}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={option.id}
                    required
                    style={{ width: "18px", minHeight: "auto", marginTop: "0.25rem" }}
                  />
                  <span>
                    {optionIndex + 1}) {option.body}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row between">
          <small>
            پس از ثبت، نتیجه بر اساس امتیاز گزینه‌ها به‌صورت خودکار محاسبه می‌شود. این آزمون
            تحلیل ثابت دارد و از هوش مصنوعی استفاده نمی‌کند.
          </small>
          <SubmitButton pendingLabel="در حال محاسبه…">ثبت پاسخ‌ها و دیدن نتیجه</SubmitButton>
        </div>
      </div>
    </form>
  );
}
