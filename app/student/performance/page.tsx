import Link from "next/link";
import { savePerformancePanelAction } from "@/app/actions/performance";
import { PerformancePanel, type PerfCellState } from "@/components/performance-panel";
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
import {
  getPanelOptions,
  getWeeklyPanelView,
  PANEL_SLOTS,
  plannedCellLabel,
  slotLabel,
} from "@/lib/panel";
import { getPerformanceView } from "@/lib/performance";

const SUCCESS: Record<string, string> = {
  saved: "گزارش عملکرد با موفقیت ثبت شد.",
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

  const [plan, perf, options] = await Promise.all([
    getWeeklyPanelView(student.id, weekStart),
    getPerformanceView(student.id, weekStart),
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
            می‌شوند و با «ثبت گزارش عملکرد» کل جدول یکجا ذخیره می‌شود. تحلیل و گزارش تحلیلی در تب
            «گزارش من» است.
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
    </div>
  );
}
