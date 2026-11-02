import Link from "next/link";
import { notFound } from "next/navigation";
import { saveWeeklyPanelAction } from "@/app/actions/panel";
import { WeekGridEditor, type PanelCellState } from "@/components/week-panel";
import { requireCounselor } from "@/lib/auth";
import { getStudentDetail } from "@/lib/counselor";
import { getPanelOptions, getWeeklyPanelView, PANEL_SLOTS, slotLabel } from "@/lib/panel";
import {
  addDays,
  formatJalaliNumeric,
  isISODate,
  startOfWeekSaturday,
  todayISO,
  WEEKDAY_LABELS,
  weekDates,
} from "@/lib/dates";

const SUCCESS: Record<string, string> = {
  saved: "پنل هفته با موفقیت ثبت شد.",
};

export default async function CounselorPanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string; success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { week, success, error } = await searchParams;

  const requestedWeek = week && isISODate(week) ? week : todayISO();
  const weekStart = startOfWeekSaturday(requestedWeek);

  const detail = await getStudentDetail(counselor.workspaceId, id);
  if (!detail) notFound();

  const [panelView, options] = await Promise.all([
    getWeeklyPanelView(id, weekStart),
    getPanelOptions(counselor.workspaceId, id),
  ]);

  const dates = weekDates(weekStart);
  const dayTitles = dates.map((date) => formatJalaliNumeric(date));
  const slotLabels = PANEL_SLOTS.map((slot) => slotLabel(slot));
  const statusLabel =
    panelView.planStatus === "approved"
      ? "تأییدشده"
      : panelView.planStatus === "active"
        ? "در اجرا"
        : panelView.planStatus === "draft"
          ? "پیش‌نویس"
          : panelView.planStatus
            ? "بایگانی"
            : "بدون برنامه";
  const panelHref = (value: string) => `/counselor/students/${id}/panel?week=${value}`;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href={`/counselor/students/${id}`} className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به پرونده {detail.student.name}
          </Link>
          <h1>پنل برنامه‌ریزی — {detail.student.name}</h1>
          <small>
            هفته {formatJalaliNumeric(dates[0])} تا {formatJalaliNumeric(dates[6])} — وضعیت برنامه: {statusLabel}
            {panelView.updatedAt
              ? ` — آخرین ثبت: ${panelView.updatedByName ?? "—"} (${formatJalaliNumeric(
                  panelView.updatedAt.toISOString().slice(0, 10),
                )})`
              : ""}
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
          <small>ثبت این جدول، برنامه تسک‌شده همین هفته را هم به‌روز می‌کند.</small>
        </div>
        <WeekGridEditor
          studentId={id}
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
