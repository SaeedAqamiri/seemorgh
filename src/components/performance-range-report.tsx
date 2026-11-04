import {
  generatePerformanceRangeNarrativeAction,
} from "@/app/actions/performance";
import { PrintButton } from "@/components/print-button";
import { StartChart } from "@/components/start-chart";
import { StartTimeTable } from "@/components/start-time-table";
import { SubmitButton } from "@/components/submit-button";
import { aiPerformanceConfigured } from "@/lib/ai-performance";
import { formatJalaliNumeric } from "@/lib/dates";
import { faNumber } from "@/lib/panel";
import type { PerformanceAnalysis } from "@/lib/performance";

export function PerformanceRangeReport({
  studentId,
  from,
  to,
  analysis,
  narrative,
  narrativeAt,
}: {
  studentId: string;
  from: string;
  to: string;
  analysis: PerformanceAnalysis;
  narrative: string;
  narrativeAt: Date | null;
}) {
  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="card">
        <div className="section-head">
          <div>
            <h2>تحلیل عملکرد</h2>
            <small>
              {analysis.hasAnyData
                ? `${faNumber(analysis.onplanDays)} روز طبق برنامه، ${faNumber(analysis.offplanDays)} روز خارج از برنامه — ${faNumber(analysis.totalMinutes)} دقیقه و ${faNumber(analysis.totalPractice)} تمرین`
                : "در این بازه عملکردی ثبت نشده است."}
            </small>
          </div>
        </div>
        {analysis.hasAnyData ? (
          <StartChart days={analysis.days} />
        ) : (
          <div className="empty">با ثبت عملکرد در دفترچه عملکرد، نمودار تحلیل همین‌جا ساخته می‌شود.</div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>ساعت شروع هر روز</h2>
            <small>
              اولین فعالیت ثبت‌شدهٔ هر روز؛ اختلاف تا ۳۰ دقیقه از برنامه سبز و بیشتر از آن قرمز است.
            </small>
          </div>
        </div>
        <StartTimeTable days={analysis.days} />
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>گزارش تحلیلی</h2>
            <small>گزارش این بازه بر اساس ساعت شروع، حجم تمرین، برنامه و یادداشت‌ها ساخته می‌شود.</small>
          </div>
          <div className="row">
            {analysis.hasAnyData ? (
              <form action={generatePerformanceRangeNarrativeAction} className="inline-form">
                <input type="hidden" name="studentId" value={studentId} />
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <SubmitButton className="btn-sm" pendingLabel="در حال تحلیل…">
                  {narrative ? "بازتولید گزارش تحلیلی" : "ساخت گزارش تحلیلی"}
                  {aiPerformanceConfigured() ? " (AI)" : ""}
                </SubmitButton>
              </form>
            ) : null}
            {narrative ? <PrintButton /> : null}
          </div>
        </div>
        {narrative ? (
          <div className="narrative" id="performance-narrative">
            <p style={{ margin: 0, lineHeight: 1.9 }}>{narrative}</p>
            <small className="muted">
              تاریخ ساخت:{" "}
              {narrativeAt
                ? formatJalaliNumeric(narrativeAt.toISOString().slice(0, 10))
                : "—"}
            </small>
          </div>
        ) : (
          <div className="empty">
            {analysis.hasAnyData
              ? "هنوز گزارشی برای این بازه ساخته نشده است."
              : "برای ساخت گزارش تحلیلی، اول عملکرد این بازه را در دفترچه عملکرد ثبت کنید."}
          </div>
        )}
      </div>
    </div>
  );
}
