import Link from "next/link";
import { notFound } from "next/navigation";
import { saveBellSlotsAction, saveSchoolScheduleAction, saveWeeklyPanelAction } from "@/app/actions/panel";
import { BellScheduleEditor } from "@/components/bell-schedule-editor";
import { SchoolScheduleEditor, type SchoolLessonState } from "@/components/school-schedule-editor";
import { WeekGridEditor, type PanelCellState } from "@/components/week-panel";
import { requireCounselor } from "@/lib/auth";
import { getStudentDetail } from "@/lib/counselor";
import { getPanelOptions, getWeeklyPanelView, slotLabel } from "@/lib/panel";
import { getSchoolLessons } from "@/lib/school-schedule";
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

  const [panelView, options, schoolLessons] = await Promise.all([
    getWeeklyPanelView(id, weekStart),
    getPanelOptions(counselor.workspaceId, id),
    getSchoolLessons(id),
  ]);

  const dates = weekDates(weekStart);
  const dayTitles = dates.map((date) => formatJalaliNumeric(date));
  const slotLabels = panelView.slots.map((slot) => slotLabel(slot));
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

      {panelView.exams.length > 0 ? (
        <div className="alert alert-warn">
          آزمون‌های این هفته:{" "}
          {panelView.exams
            .map((exam) => `${exam.title} (${formatJalaliNumeric(exam.examDate)})`)
            .join(" · ")}
        </div>
      ) : null}

      <div className="card">
        <BellScheduleEditor
          studentId={id}
          weekStart={weekStart}
          initialSlots={panelView.slots}
          action={saveBellSlotsAction}
        />
      </div>

      <div className="card">
        <div className="section-head">
          <h2>برنامه هفتگی مدرسه</h2>
          <small>زنگ‌های مدرسه و درس هر زنگ؛ این برنامه مبنای برنامه‌ریزی خودکار است.</small>
        </div>
        <SchoolScheduleEditor
          studentId={id}
          weekdayLabels={[...WEEKDAY_LABELS]}
          slotLabels={slotLabels}
          initialLessons={schoolLessons as unknown as SchoolLessonState[]}
          subjects={options.subjects}
          subjectGroups={options.subjectGroups}
          action={saveSchoolScheduleAction}
        />
      </div>

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
          subjectGroups={options.subjectGroups}
          resources={options.resources}
          action={saveWeeklyPanelAction}
        />
      </div>
    </div>
  );
}
