import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import {
  addDays,
  formatJalali,
  formatJalaliNumeric,
  formatTime,
  isISODate,
  startOfWeekSaturday,
  todayISO,
  WEEKDAY_LABELS,
  weekDates,
} from "@/lib/dates";
import { getStudentWeekData } from "@/lib/student";

export default async function StudentWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { student } = await requireStudent();
  const { week } = await searchParams;
  const weekStart = startOfWeekSaturday(week && isISODate(week) ? week : todayISO());
  const data = await getStudentWeekData(student.id, weekStart);
  const dates = weekDates(weekStart);
  const today = todayISO();

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>برنامه هفته</h1>
          <small>
            {formatJalaliNumeric(dates[0])} تا {formatJalaliNumeric(dates[6])} — {formatJalali(weekStart)}
          </small>
        </div>
        <div className="row">
          <Link className="btn btn-secondary btn-sm" href={`/student/week?week=${addDays(weekStart, -7)}`}>
            قبل
          </Link>
          <Link className="btn btn-secondary btn-sm" href="/student/week">
            این هفته
          </Link>
          <Link className="btn btn-secondary btn-sm" href={`/student/week?week=${addDays(weekStart, 7)}`}>
            بعد
          </Link>
        </div>
      </div>

      {!data.planId ? (
        <div className="card empty">برنامه تأییدشده‌ای برای این هفته وجود ندارد.</div>
      ) : (
        <div className="stack" style={{ gap: "0.7rem" }}>
          {dates.map((date, index) => {
            const dayTasks = data.tasks.filter((task) => task.planDate === date);
            const done = dayTasks.filter((task) => task.status === "done").length;
            return (
              <details key={date} className="card" open={date === today}>
                <summary style={{ cursor: "pointer" }}>
                  <span className="row between">
                    <strong>
                      {WEEKDAY_LABELS[index]} — {formatJalaliNumeric(date)}
                    </strong>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {dayTasks.length === 0 ? "بدون تسک" : `${done} از ${dayTasks.length} انجام‌شده`}
                    </span>
                  </span>
                </summary>
                <div className="task-list" style={{ marginTop: "0.7rem" }}>
                  {dayTasks.length === 0 ? (
                    <div className="empty" style={{ padding: "0.6rem" }}>
                      تسکی برای این روز نیست.
                    </div>
                  ) : (
                    dayTasks.map((task) => (
                      <div key={task.id} className={`task ${task.status === "done" ? "is-done" : ""}`}>
                        <div className="task-time">
                          {formatTime(task.plannedStart)}
                          <br />
                          {formatTime(task.plannedEnd)}
                        </div>
                        <div>
                          <div className="task-title">{task.subjectTitle}</div>
                          <div className="task-meta">
                            {task.estMinutes} دقیقه
                            {task.targetUnits > 0
                              ? ` · ${task.targetUnits} ${
                                  task.resourceUnitType === "page"
                                    ? "صفحه"
                                    : task.resourceUnitType === "test"
                                      ? "تست"
                                      : "واحد"
                                }`
                              : ""}
                            {task.topic ? ` · ${task.topic}` : ""}
                          </div>
                        </div>
                        <span className={`badge ${task.status === "done" ? "badge-green" : ""}`}>
                          {task.status === "done" ? "✓" : task.status === "skipped" ? "رد" : "—"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
