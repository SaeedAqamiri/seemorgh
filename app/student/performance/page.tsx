import Link from "next/link";
import {
  generatePerformanceNarrativeAction,
  savePerformancePanelAction,
} from "@/app/actions/performance";
import { PrintButton } from "@/components/print-button";
import { PerformancePanel, type PerfCellState } from "@/components/performance-panel";
import { StartChart } from "@/components/start-chart";
import { SubmitButton } from "@/components/submit-button";
import { requireStudent } from "@/lib/auth";
import {
  addDays,
  formatJalaliNumeric,
  isISODate,
  startOfWeekSaturday,
  todayISO,
  WEEKDAY_LABELS,
  weekDates,
} from "@/lib/dates";
import { aiPerformanceConfigured } from "@/lib/ai-performance";
import { faNumber, getPanelOptions, getWeeklyPanelView, PANEL_SLOTS, plannedCellLabel, slotLabel } from "@/lib/panel";
import { getPerformanceAnalysis, getPerformanceView } from "@/lib/performance";

const SUCCESS: Record<string, string> = {
  saved: "گزارش عملکرد با موفقیت ثبت شد.",
  narrative: "گزارش تحلیلی ساخته شد.",
};

export default async function StudentPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; success?: string; error?: string }>;
}) {
  const { user, student } = await requireStudent();
  const { week, success, error } = await searchParams;

  const requestedWeek = week && isISODate(week) ? week : todayISO();
  const weekStart = startOfWeekSaturday(requestedWeek);

  const [plan, perf, analysis, options] = await Promise.all([
    getWeeklyPanelView(student.id, weekStart),
    getPerformanceView(student.id, weekStart),
    getPerformanceAnalysis(student.id, weekStart),
    getPanelOptions(user.workspaceId, student.id),
  ]);

  const subjectTitles = new Map(options.subjects.map((s) => [s.id, s.title]));
  const resourceTitles = new Map(options.resources.map((r) => [r.id, r.title]));
  const plannedLabels = plan.grid.map((row) =>
    row.map((cell) => plannedCellLabel(cell, subjectTitles, resourceTitles)),
  );

  const dates = weekDates(weekStart);
  const dayTitles = dates.map((date) => formatJalaliNumeric(date));
  const slotLabels = PANEL_SLOTS.map((slot) => slotLabel(slot));
  const perfHref = (value: string) => `/student/performance?week=${value}`;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>دفترچه عملکرد</h1>
          <small>
            هفته {formatJalaliNumeric(dates[0])} تا {formatJalaliNumeric(dates[6])}
          </small>
        </div>
        <div className="row">
          <Link className="btn btn-secondary btn-sm" href={perfHref(addDays(weekStart, -7))}>
            هفته قبل
          </Link>
          <Link className="btn btn-secondary btn-sm" href={perfHref(startOfWeekSaturday(todayISO()))}>
            این هفته
          </Link>
          <Link className="btn btn-secondary btn-sm" href={perfHref(addDays(weekStart, 7))}>
            هفته بعد
          </Link>
        </div>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="section-head">
          <h2>ثبت عملکرد هفته</h2>
          <small>
            سطرها بازه‌های دو ساعت‌اند و ستون‌ها روزهای هفته. با «ثبت عملکرد» همه خانه‌ها قابل نوشتن
            می‌شوند و با «ثبت گزارش عملکرد» کل جدول یکجا ذخیره می‌شود.
          </small>
        </div>
        <PerformancePanel
          studentId={student.id}
          weekStart={weekStart}
          weekdayLabels={[...WEEKDAY_LABELS]}
          dayTitles={dayTitles}
          slotLabels={slotLabels}
          plannedLabels={plannedLabels}
          initialGrid={perf.grid as unknown as PerfCellState[][]}
          subjects={options.subjects}
          resources={options.resources}
          action={savePerformancePanelAction}
        />
      </div>

      <div className="card">
        <div className="section-head">
          <h2>تحلیل عملکرد من</h2>
          <small>
            {analysis.hasAnyData
              ? `${faNumber(analysis.onplanDays)} روز طبق برنامه، ${faNumber(analysis.offplanDays)} روز خارج از برنامه — ${faNumber(analysis.totalMinutes)} دقیقه و ${faNumber(analysis.totalPractice)} تمرین`
              : "هنوز عملکردی برای این هفته ثبت نشده است."}
          </small>
        </div>

        {analysis.hasAnyData ? (
          <StartChart days={analysis.days} />
        ) : (
          <div className="empty">با ثبت عملکرد در جدول بالا، نمودار و گزارش تحلیلی همین‌جا ظاهر می‌شود.</div>
        )}

        <hr className="divider" />
        <div className="section-head">
          <h3>گزارش تحلیلی</h3>
          <div className="row">
            <form action={generatePerformanceNarrativeAction} className="inline-form">
              <input type="hidden" name="weekStart" value={weekStart} />
              <SubmitButton className="btn-sm" pendingLabel="در حال تحلیل…">
                ساخت گزارش تحلیلی{aiPerformanceConfigured() ? " (AI)" : ""}
              </SubmitButton>
            </form>
            {perf.narrative ? <PrintButton /> : null}
          </div>
        </div>
        {perf.narrative ? (
          <div className="narrative" id="performance-narrative">
            <p style={{ margin: 0, lineHeight: 1.9 }}>{perf.narrative}</p>
            <small className="muted">
              تاریخ ساخت: {perf.narrativeAt ? formatJalaliNumeric(perf.narrativeAt.toISOString().slice(0, 10)) : "—"}
            </small>
          </div>
        ) : (
          <div className="empty">
            گزارش تحلیلی از ساعت شروع/پایان، حجم تمرین، برنامه و یادداشت‌های تو ساخته می‌شود.
          </div>
        )}
      </div>
    </div>
  );
}
