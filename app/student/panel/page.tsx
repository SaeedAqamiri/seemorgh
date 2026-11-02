import Link from "next/link";
import { saveWeeklyPanelAction } from "@/app/actions/panel";
import { WeekGridEditor, type PanelCellState } from "@/components/week-panel";
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
import { getPanelOptions, getWeeklyPanelView, PANEL_SLOTS, slotLabel } from "@/lib/panel";

const SUCCESS: Record<string, string> = {
  saved: "پنل هفته با موفقیت ثبت شد.",
};

export default async function StudentPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; success?: string; error?: string }>;
}) {
  const { user, student } = await requireStudent();
  const { week, success, error } = await searchParams;

  const requestedWeek = week && isISODate(week) ? week : todayISO();
  const weekStart = startOfWeekSaturday(requestedWeek);

  const [panelView, options] = await Promise.all([
    getWeeklyPanelView(student.id, weekStart),
    getPanelOptions(user.workspaceId, student.id),
  ]);

  const dates = weekDates(weekStart);
  const dayTitles = dates.map((date) => formatJalaliNumeric(date));
  const slotLabels = PANEL_SLOTS.map((slot) => slotLabel(slot));
  const panelHref = (value: string) => `/student/panel?week=${value}`;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>پنل برنامه‌ریزی</h1>
          <small>
            هفته {formatJalaliNumeric(dates[0])} تا {formatJalaliNumeric(dates[6])}
          </small>
        </div>
        <div className="row">
          <Link className="btn btn-secondary btn-sm" href={panelHref(addDays(weekStart, -7))}>
            هفته قبل
          </Link>
          <Link className="btn btn-secondary btn-sm" href={panelHref(startOfWeekSaturday(todayISO()))}>
            این هفته
          </Link>
          <Link className="btn btn-secondary btn-sm" href={panelHref(addDays(weekStart, 7))}>
            هفته بعد
          </Link>
        </div>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="section-head">
          <h2>جدول هفتگی</h2>
          <small>ثبت این جدول، برنامه همین هفته را به‌روز می‌کند.</small>
        </div>
        <WeekGridEditor
          studentId={student.id}
          weekStart={weekStart}
          weekdayLabels={[...WEEKDAY_LABELS]}
          dayTitles={dayTitles}
          slotLabels={slotLabels}
          initialGrid={panelView.grid as unknown as PanelCellState[][]}
          initialRoutine={panelView.dailyRoutine}
          initialHomework={panelView.nextWeekHomework}
          subjects={options.subjects}
          resources={options.resources}
          action={saveWeeklyPanelAction}
        />
      </div>
    </div>
  );
}
