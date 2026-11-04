import { ocrExternalExamAction } from "@/app/actions/exam-analysis";
import { SubmitButton } from "@/components/submit-button";

export function ExamOcrForm({ studentId }: { studentId: string }) {
  return (
    <form action={ocrExternalExamAction} className="stack" encType="multipart/form-data">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="field">
        <label>تصویر کارنامه</label>
        <input name="image" type="file" accept="image/*" required />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
        اگر سرویس OCR فعال باشد، اطلاعات استخراج می‌شود و بعد از ثبت می‌توانید آن را ویرایش کنید.
        در غیر این صورت از فرم دستی استفاده کنید.
      </p>
      <div>
        <SubmitButton className="btn-secondary" pendingLabel="در حال خواندن تصویر…">
          خواندن کارنامه با OCR
        </SubmitButton>
      </div>
    </form>
  );
}
