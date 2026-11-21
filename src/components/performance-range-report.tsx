import {
  generatePerformanceRangeNarrativeAction,
} from "@/app/actions/performance";
import { PrintButton } from "@/components/print-button";
import { StartChart } from "@/components/start-chart";
import { SubmitButton } from "@/components/submit-button";
import { aiPerformanceConfigured } from "@/lib/ai-performance";
import { formatJalaliNumeric, WEEKDAY_LABELS, weekdayIndex } from "@/lib/dates";
import { faNumber } from "@/lib/panel";
import type {
  PerformanceAnalysis,
  SubjectDayCell,
  SubjectDayRow,
} from "@/lib/performance";

function faHours(minutes: number): string {
  return (minutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 1 });
}

type MirrorLine = { key: string; label: string; value: string };

function mirrorLines(cell: SubjectDayCell): MirrorLine[] {
  return [
    { key: "topic", label: "مبحث", value: cell.topics.join("؛ ") },
    {
      key: "test",
      label: "تعداد تست",
      value: cell.testCount > 0 ? `${faNumber(cell.testCount)}` : "",
    },
    {
      key: "exercise",
      label: "تعداد تمرین",
      value: cell.exerciseCount > 0 ? `${faNumber(cell.exerciseCount)}` : "",
    },
    {
      key: "study",
      label: "مجموع ساعات مطالعه",
      value: cell.studyMinutes > 0 ? `${faHours(cell.studyMinutes)} ساعت` : "",
    },
    { key: "resource", label: "منبع مطالعاتی", value: cell.resources.join("؛ ") },
  ];
}

function MirrorCell({ cell }: { cell: SubjectDayCell }) {
  if (
    cell.topics.length === 0 &&
    cell.resources.length === 0 &&
    cell.studyMinutes === 0 &&
    cell.testMinutes === 0 &&
    cell.exerciseMinutes === 0 &&
    cell.testCount === 0 &&
    cell.exerciseCount === 0
  ) {
    return <span className="mirror-empty">—</span>;
  }

  return (
    <div className="mirror-cell">
      {mirrorLines(cell).map((line) => (
        <div key={line.key} className="mirror-line">
          <span className="mirror-label">{line.label}:</span>{" "}
          {line.value ? <span className="mirror-value">{line.value}</span> : <span className="mirror-na">—</span>}
        </div>
      ))}
    </div>
  );
}

function MirrorTotalCell({
  studyMinutes,
  testMinutes,
  exerciseMinutes,
  testCount,
  exerciseCount,
}: {
  studyMinutes: number;
  testMinutes: number;
  exerciseMinutes: number;
  testCount: number;
  exerciseCount: number;
}) {
  const isEmpty =
    studyMinutes === 0 &&
    testCount === 0 &&
    exerciseCount === 0 &&
    testMinutes === 0 &&
    exerciseMinutes === 0;
  if (isEmpty) return <span className="mirror-empty">—</span>;

  return (
    <div className="mirror-cell mirror-total-cell">
      <div className="mirror-line">
        <span className="mirror-label">مطالعه:</span>{" "}
        <span className="mirror-value">{faHours(studyMinutes)} ساعت</span>
      </div>
      <div className="mirror-line">
        <span className="mirror-label">تست:</span>{" "}
        <span className="mirror-value">
          {faNumber(testCount)} عدد
          {testMinutes > 0 ? ` (${faHours(testMinutes)} ساعت)` : ""}
        </span>
      </div>
      <div className="mirror-line">
        <span className="mirror-label">تمرین:</span>{" "}
        <span className="mirror-value">
          {faNumber(exerciseCount)} عدد
          {exerciseMinutes > 0 ? ` (${faHours(exerciseMinutes)} ساعت)` : ""}
        </span>
      </div>
    </div>
  );
}

const emptyCell: SubjectDayCell = {
  date: "",
  practiceMinutes: 0,
  studyMinutes: 0,
  testMinutes: 0,
  exerciseMinutes: 0,
  testCount: 0,
  exerciseCount: 0,
  topics: [],
  resources: [],
};

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

  const dayTotals = (date: string) => {
    let studyMinutes = 0;
    let testMinutes = 0;
    let exerciseMinutes = 0;
    let testCount = 0;
    let exerciseCount = 0;
    for (const subject of subjectDayMatrix) {
      const cell = subject.days.find((day) => day.date === date);
      if (!cell) continue;
      studyMinutes += cell.studyMinutes;
      testMinutes += cell.testMinutes;
      exerciseMinutes += cell.exerciseMinutes;
      testCount += cell.testCount;
      exerciseCount += cell.exerciseCount;
    }
    return { studyMinutes, testMinutes, exerciseMinutes, testCount, exerciseCount };
  };

  const grandTotals = () => {
    let studyMinutes = 0;
    let testMinutes = 0;
    let exerciseMinutes = 0;
    let testCount = 0;
    let exerciseCount = 0;
    for (const subject of subjectDayMatrix) {
      studyMinutes += subject.totalStudyMinutes;
      testMinutes += subject.totalTestMinutes;
      exerciseMinutes += subject.totalExerciseMinutes;
      testCount += subject.totalTestCount;
      exerciseCount += subject.totalExerciseCount;
    }
    return { studyMinutes, testMinutes, exerciseMinutes, testCount, exerciseCount };
  };

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
            <h2>آینه عملکرد</h2>
            <small>
              عملکرد را در یک نگاه ببین: هر درس یک ردیف و هر روز یک ستون؛ در هر خانه مبحث، تعداد
              تست و تمرین، ساعت مطالعه و منبع همان روز آمده است. برای دیدن روزهای بیشتر جدول را
              افقی بکشید.
            </small>
          </div>
        </div>
        {subjectDayMatrix.length === 0 ? (
          <div className="empty">برای این بازه داده‌ای ثبت نشده است.</div>
        ) : (
          <div className="table-wrap mirror-wrap">
            <table
              className="mirror-table"
              style={{ minWidth: `${170 + dates.length * 210}px` }}
            >
              <thead>
                <tr>
                  <th className="mirror-subject">درس / روز</th>
                  {dates.map((date) => (
                    <th key={date} className="mirror-day">
                      <span>{WEEKDAY_LABELS[weekdayIndex(date)]}</span>
                      <small>{formatJalaliNumeric(date)}</small>
                    </th>
                  ))}
                  <th className="mirror-total">جمع بازه</th>
                </tr>
              </thead>
              <tbody>
                {subjectDayMatrix.map((subject) => (
                  <tr key={subject.subjectId}>
                    <th scope="row" className="mirror-subject">
                      {subject.title}
                    </th>
                    {dates.map((date) => {
                      const cell = subject.days.find((day) => day.date === date) ?? {
                        ...emptyCell,
                        date,
                      };
                      return (
                        <td key={date}>
                          <MirrorCell cell={cell} />
                        </td>
                      );
                    })}
                    <td className="mirror-total">
                      <MirrorTotalCell
                        studyMinutes={subject.totalStudyMinutes}
                        testMinutes={subject.totalTestMinutes}
                        exerciseMinutes={subject.totalExerciseMinutes}
                        testCount={subject.totalTestCount}
                        exerciseCount={subject.totalExerciseCount}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="mirror-sumrow">
                  <th scope="row" className="mirror-subject">
                    جمع روز
                  </th>
                  {dates.map((date) => {
                    const totals = dayTotals(date);
                    return (
                      <td key={date}>
                        <MirrorTotalCell {...totals} />
                      </td>
                    );
                  })}
                  <td className="mirror-total">
                    <MirrorTotalCell {...grandTotals()} />
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
