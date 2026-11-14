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
import type { PerformanceAnalysis, SubjectDayRow } from "@/lib/performance";

export function PerformanceRangeReport({
  studentId,
  from,
  to,
  dates,
  analysis,
  subjectDayMatrix,
  narrative,
  narrativeAt,
}: {
  studentId: string;
  from: string;
  to: string;
  dates: string[];
  analysis: PerformanceAnalysis;
  subjectDayMatrix: SubjectDayRow[];
  narrative: string;
  narrativeAt: Date | null;
}) {
  const faHours = (minutes: number) =>
    (minutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 1 });

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
              معیار: اولین بار باز شدن صفحه دانش‌آموز در آن روز؛ اختلاف تا ۳۰ دقیقه از برنامه سبز و
              بیشتر از آن قرمز است.
            </small>
          </div>
        </div>
        <StartTimeTable days={analysis.days} />
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>ضربان هفته</h2>
            <small>
              تست/تمرین و مطالعه هر درس، روز به روز. عدد اول ساعت تست/تمرین و عدد دوم ساعت
              مطالعه/مرور است.
            </small>
          </div>
        </div>
        {subjectDayMatrix.length === 0 ? (
          <div className="empty">برای این بازه داده‌ای ثبت نشده است.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>روز</th>
                  {subjectDayMatrix.map((subject) => (
                    <th key={subject.subjectId}>{subject.title}</th>
                  ))}
                  <th>جمع روز</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const dayCells = subjectDayMatrix.map(
                    (subject) =>
                      subject.days.find((day) => day.date === date) ?? {
                        date,
                        practiceMinutes: 0,
                        studyMinutes: 0,
                      },
                  );
                  const dayPractice = dayCells.reduce(
                    (sum, cell) => sum + cell.practiceMinutes,
                    0,
                  );
                  const dayStudy = dayCells.reduce((sum, cell) => sum + cell.studyMinutes, 0);
                  return (
                    <tr key={date}>
                      <td>
                        <strong>{formatJalaliNumeric(date)}</strong>
                      </td>
                      {dayCells.map((cell, index) => (
                        <td key={subjectDayMatrix[index].subjectId} dir="rtl">
                          <div style={{ fontSize: "0.74rem" }}>
                            تست/تمرین: {faHours(cell.practiceMinutes)} س
                          </div>
                          <div className="muted" style={{ fontSize: "0.74rem" }}>
                            مطالعه: {faHours(cell.studyMinutes)} س
                          </div>
                        </td>
                      ))}
                      <td className="panel-total">
                        <div>تست/تمرین: {faHours(dayPractice)} س</div>
                        <div className="muted">مطالعه: {faHours(dayStudy)} س</div>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td>
                    <strong>جمع بازه</strong>
                  </td>
                  {subjectDayMatrix.map((subject) => (
                    <td key={subject.subjectId} className="panel-total">
                      <div>تست/تمرین: {faHours(subject.totalPracticeMinutes)} س</div>
                      <div className="muted">مطالعه: {faHours(subject.totalStudyMinutes)} س</div>
                    </td>
                  ))}
                  <td className="panel-total">
                    <div>
                      تست/تمرین:{" "}
                      {faHours(
                        subjectDayMatrix.reduce(
                          (sum, subject) => sum + subject.totalPracticeMinutes,
                          0,
                        ),
                      )}{" "}
                      س
                    </div>
                    <div className="muted">
                      مطالعه:{" "}
                      {faHours(
                        subjectDayMatrix.reduce(
                          (sum, subject) => sum + subject.totalStudyMinutes,
                          0,
                        ),
                      )}{" "}
                      س
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>گزارش تحلیلی</h2>
            <small>گزارش این بازه بر اساس اولین ورود روز، حجم تست/تمرین و مطالعه، پیشرفت منابع، برنامه و یادداشت‌ها ساخته می‌شود.</small>
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
