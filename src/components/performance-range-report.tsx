import {
  generatePerformanceRangeNarrativeAction,
} from "@/app/actions/performance";
import { PrintButton } from "@/components/print-button";
import { StartChart } from "@/components/start-chart";
import { SubmitButton } from "@/components/submit-button";
import { aiPerformanceConfigured } from "@/lib/ai-performance";
import { formatJalaliNumeric, WEEKDAY_LABELS, weekdayIndex } from "@/lib/dates";
import { faNumber } from "@/lib/panel";
import type { PerformanceAnalysis, SubjectDayRow } from "@/lib/performance";

function faHours(minutes: number): string {
  return (minutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 1 });
}

function PulseCell({
  study,
  test,
  exercise,
}: {
  study: number;
  test: number;
  exercise: number;
}) {
  const metrics = [
    { key: "study", label: "مطالعه", value: study },
    { key: "test", label: "تست", value: test },
    { key: "exercise", label: "تمرین", value: exercise },
  ].filter((metric) => metric.value > 0);

  if (metrics.length === 0) {
    return <span className="pulse-empty">—</span>;
  }

  return (
    <div className="pulse-cell">
      {metrics.map((metric) => (
        <span key={metric.key} className="pulse-metric">
          <i className={`pulse-dot is-${metric.key}`} /> {metric.label} {faHours(metric.value)}
        </span>
      ))}
    </div>
  );
}

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
  const onplanRate =
    analysis.activeDays > 0
      ? Math.round((analysis.onplanDays / analysis.activeDays) * 100)
      : 0;
  const totalStudyMinutes = analysis.days.reduce(
    (sum, day) => sum + day.studyMinutes + day.reviewMinutes,
    0,
  );
  const totalPracticeMinutes = analysis.days.reduce((sum, day) => sum + day.testMinutes, 0);
  const narrativeParagraphs = narrative
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="stack report-tab" style={{ gap: "1rem" }}>
      <div className="card report-hero">
        <div className="section-head">
          <div>
            <h2>تحلیل عملکرد</h2>
            <small>
              {analysis.hasAnyData
                ? `${faNumber(analysis.onplanDays)} روز طبق برنامه و ${faNumber(analysis.offplanDays)} روز خارج از برنامه`
                : "در این بازه عملکردی ثبت نشده است."}
            </small>
          </div>
        </div>
        <div className="grid grid-4 report-kpis">
          <div className="stat report-kpi">
            <div className="stat-value">{faNumber(analysis.activeDays)}</div>
            <div className="stat-label">روز فعال</div>
          </div>
          <div className="stat report-kpi">
            <div className="stat-value">
              {faNumber(onplanRate)}
              <span className="report-kpi-unit">٪</span>
            </div>
            <div className="stat-label">شروع طبق برنامه</div>
          </div>
          <div className="stat report-kpi">
            <div className="stat-value">
              {faHours(totalStudyMinutes)}
              <span className="report-kpi-unit">ساعت</span>
            </div>
            <div className="stat-label">مطالعه و مرور</div>
          </div>
          <div className="stat report-kpi">
            <div className="stat-value">
              {faHours(totalPracticeMinutes)}
              <span className="report-kpi-unit">ساعت</span>
            </div>
            <div className="stat-label">
              تست و تمرین · {faNumber(analysis.totalPractice)} عدد
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>ساعت شروع روز</h2>
            <small>
              مقایسهٔ ساعت واقعی شروع با ساعت برنامه. نقطه‌های سبز به‌موقع، قرمز خارج از برنامه و
              خاکستری بدون برنامه بوده‌اند.
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
            <h2>ضربان هفته</h2>
            <small>
              هر درس یک ردیف و هر روز یک ستون؛ عددها ساعت مطالعه، تست و تمرین همان درس در آن روز
              هستند. برای دیدن روزهای بیشتر جدول را افقی بکشید.
            </small>
          </div>
        </div>
        {subjectDayMatrix.length === 0 ? (
          <div className="empty">برای این بازه داده‌ای ثبت نشده است.</div>
        ) : (
          <div className="table-wrap pulse-wrap">
            <table
              className="pulse-table"
              style={{ minWidth: `${170 + dates.length * 152}px` }}
            >
              <thead>
                <tr>
                  <th className="pulse-subject">درس / روز</th>
                  {dates.map((date) => (
                    <th key={date} className="pulse-day">
                      <span>{WEEKDAY_LABELS[weekdayIndex(date)]}</span>
                      <small>{formatJalaliNumeric(date)}</small>
                    </th>
                  ))}
                  <th className="pulse-total">جمع بازه</th>
                </tr>
              </thead>
              <tbody>
                {subjectDayMatrix.map((subject) => (
                  <tr key={subject.subjectId}>
                    <th scope="row" className="pulse-subject">
                      {subject.title}
                    </th>
                    {dates.map((date) => {
                      const cell = subject.days.find((day) => day.date === date) ?? {
                        date,
                        practiceMinutes: 0,
                        studyMinutes: 0,
                        testMinutes: 0,
                        exerciseMinutes: 0,
                      };
                      return (
                        <td key={date}>
                          <PulseCell
                            study={cell.studyMinutes}
                            test={cell.testMinutes}
                            exercise={cell.exerciseMinutes}
                          />
                        </td>
                      );
                    })}
                    <td className="pulse-total">
                      <PulseCell
                        study={subject.totalStudyMinutes}
                        test={subject.totalTestMinutes}
                        exercise={subject.totalExerciseMinutes}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="pulse-sumrow">
                  <th scope="row" className="pulse-subject">
                    جمع روز
                  </th>
                  {dates.map((date) => {
                    const study = subjectDayMatrix.reduce(
                      (sum, subject) =>
                        sum +
                        (subject.days.find((day) => day.date === date)?.studyMinutes ?? 0),
                      0,
                    );
                    const test = subjectDayMatrix.reduce(
                      (sum, subject) =>
                        sum + (subject.days.find((day) => day.date === date)?.testMinutes ?? 0),
                      0,
                    );
                    const exercise = subjectDayMatrix.reduce(
                      (sum, subject) =>
                        sum +
                        (subject.days.find((day) => day.date === date)?.exerciseMinutes ?? 0),
                      0,
                    );
                    return (
                      <td key={date}>
                        <PulseCell study={study} test={test} exercise={exercise} />
                      </td>
                    );
                  })}
                  <td className="pulse-total">
                    <PulseCell
                      study={subjectDayMatrix.reduce(
                        (sum, subject) => sum + subject.totalStudyMinutes,
                        0,
                      )}
                      test={subjectDayMatrix.reduce(
                        (sum, subject) => sum + subject.totalTestMinutes,
                        0,
                      )}
                      exercise={subjectDayMatrix.reduce(
                        (sum, subject) => sum + subject.totalExerciseMinutes,
                        0,
                      )}
                    />
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
            <small>
              گزارش این بازه بر اساس ساعت شروع، حجم مطالعه و تست، پیشرفت منابع، برنامه و
              یادداشت‌ها ساخته می‌شود.
            </small>
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
            {narrativeParagraphs.length > 1 ? (
              narrativeParagraphs.map((paragraph, index) => (
                <p key={index} style={{ margin: 0, lineHeight: 1.9 }}>
                  {paragraph}
                </p>
              ))
            ) : (
              <p style={{ margin: 0, lineHeight: 1.9 }}>{narrative}</p>
            )}
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
