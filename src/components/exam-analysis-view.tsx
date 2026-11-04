import Link from "next/link";
import { deleteExternalExamAction } from "@/app/actions/exam-analysis";
import { ExamOcrForm } from "@/components/exam-ocr-form";
import { ExamResultForm } from "@/components/exam-result-form";
import { ExamResultsList } from "@/components/exam-results-list";
import { ExamTrendReport } from "@/components/exam-trend-report";
import { ReportRangeForm } from "@/components/report-range-form";
import { SingleExamAnalysisCard } from "@/components/single-exam-analysis-card";
import { SubmitButton } from "@/components/submit-button";
import type {
  ExamResultView,
  SingleExamAnalysis,
  TrendAnalysis,
} from "@/lib/exam-analysis";

export function ExamAnalysisView({
  studentId,
  studentName,
  basePath,
  backHref,
  backLabel,
  subjects,
  results,
  trend,
  from,
  to,
  selectedExam,
  selectedAnalysis,
  success,
  error,
}: {
  studentId: string;
  studentName?: string;
  basePath: string;
  backHref: string;
  backLabel: string;
  subjects: { id: string; title: string }[];
  results: ExamResultView[];
  trend: TrendAnalysis;
  from: string;
  to: string;
  selectedExam: ExamResultView | null;
  selectedAnalysis: SingleExamAnalysis | null;
  success?: string;
  error?: string;
}) {
  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href={backHref} className="muted" style={{ fontSize: "0.82rem" }}>
            ← {backLabel}
          </Link>
          <h1>تحلیل آزمون{studentName ? ` — ${studentName}` : ""}</h1>
          <small>کارنامه‌های درون سامانه و آزمون‌های بیرونی، در یک جا</small>
        </div>
      </div>

      {success === "saved" ? (
        <div className="alert alert-success">نتیجه آزمون ذخیره شد.</div>
      ) : success === "deleted" ? (
        <div className="alert alert-success">نتیجه آزمون حذف شد.</div>
      ) : success === "ocr" ? (
        <div className="alert alert-success">
          نتیجه آزمون با OCR ثبت شد؛ لطفاً مقادیر را در بخش ویرایش بررسی و اصلاح کنید.
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {selectedExam && selectedAnalysis ? (
        <div className="stack" style={{ gap: "0.8rem" }}>
          <SingleExamAnalysisCard analysis={selectedAnalysis} />
          {selectedExam.source === "external" ? (
            <div className="card">
              <div className="section-head">
                <h2>ویرایش نتیجه آزمون</h2>
                <form action={deleteExternalExamAction}>
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="examId" value={selectedExam.id} />
                  <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                    حذف این آزمون
                  </SubmitButton>
                </form>
              </div>
              <details>
                <summary className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                  باز کردن فرم ویرایش
                </summary>
                <div style={{ marginTop: "0.8rem" }}>
                  <ExamResultForm
                    studentId={studentId}
                    subjects={subjects}
                    exam={selectedExam}
                  />
                </div>
              </details>
            </div>
          ) : null}
          <Link className="btn btn-secondary btn-sm" href={basePath} style={{ alignSelf: "flex-start" }}>
            بازگشت به فهرست آزمون‌ها
          </Link>
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <div>
            <h2>فهرست آزمون‌ها</h2>
            <small>{results.length} آزمون ثبت‌شده</small>
          </div>
        </div>
        <ExamResultsList
          results={results}
          basePath={basePath}
          from={from}
          to={to}
          selectedExamId={
            selectedExam ? `${selectedExam.source}:${selectedExam.id}` : undefined
          }
        />
      </div>

      <ReportRangeForm from={from} to={to} />

      <ExamTrendReport trend={trend} />

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <div>
              <h2>ثبت دستی نتیجه آزمون</h2>
              <small>درصد هر درس، نام و تاریخ آزمون را خودتان وارد کنید.</small>
            </div>
          </div>
          <details open={results.length === 0}>
            <summary className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
              باز کردن فرم ثبت دستی
            </summary>
            <div style={{ marginTop: "0.8rem" }}>
              <ExamResultForm studentId={studentId} subjects={subjects} />
            </div>
          </details>
        </div>

        <div className="card">
          <div className="section-head">
            <div>
              <h2>ثبت با OCR</h2>
              <small>تصویر کارنامه را بدهید تا در صورت پشتیبانی، خودکار خوانده شود.</small>
            </div>
          </div>
          <ExamOcrForm studentId={studentId} />
        </div>
      </div>
    </div>
  );
}
