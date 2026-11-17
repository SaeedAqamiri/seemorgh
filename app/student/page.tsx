import Link from "next/link";
import { ContentCard } from "@/components/content-card";
import { DailyChallengeCard } from "@/components/daily-challenge-card";
import { requireStudent } from "@/lib/auth";
import { getDailyChallengeState, recordStudentDailyOpen } from "@/lib/daily";
import {
  formatJalali,
  formatJalaliNumeric,
  formatTime,
  tehranMinutesNow,
  WEEKDAY_LABELS,
  weekdayIndex,
} from "@/lib/dates";
import { getStudentTodayData, summarizeWeek } from "@/lib/student";

const TYPE_LABELS: Record<string, string> = {
  study: "مطالعه",
  review: "مرور",
  test: "تست آموزشی",
  timed_test: "تست زمان‌دار",
  exercise: "تمرین",
  school: "مدرسه",
  exam: "آزمون آزمایشی",
  exam_analysis: "تحلیل آزمون",
};

export default async function StudentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { user, student } = await requireStudent();
  const { error, success } = await searchParams;
  await recordStudentDailyOpen(student.id);
  const [data, challenge] = await Promise.all([
    getStudentTodayData(student.id),
    getDailyChallengeState(student.id),
  ]);
  const week = summarizeWeek(data.weekTasks, data.weekStart);
  const countedTasks = data.tasks.filter(
    (task) => task.type !== "school" && task.type !== "exam" && task.type !== "exam_analysis",
  );
  const doneToday = countedTasks.filter((task) => task.status === "done").length;
  const totalMinutes = countedTasks.reduce((sum, task) => sum + task.estMinutes, 0);
  const doneMinutes = countedTasks
    .filter((task) => task.status === "done")
    .reduce((sum, task) => sum + task.estMinutes, 0);
  const pct = totalMinutes === 0 ? 0 : Math.round((doneMinutes / totalMinutes) * 100);
  const nowMinutes = tehranMinutesNow();
  const pendingTasks = countedTasks.filter((task) => task.status === "pending");
  const firstPending = pendingTasks[0];
  const overdueCount = pendingTasks.filter((task) => task.plannedEnd < nowMinutes).length;
  const lateStart =
    Boolean(firstPending) &&
    !firstPending.actualStartedAt &&
    nowMinutes > firstPending.plannedStart + 30;

  return (
    <div className="stack" style={{ gap: "0.9rem" }}>
      <div>
        <small>{formatJalali(data.today)}</small>
        <h1>سلام {user.name.split(" ")[0]}!</h1>
        <p className="muted" style={{ margin: 0 }}>
          {countedTasks.length === 0
            ? "برای امروز تسک مطالعه‌ای ثبت نشده است."
            : `${doneToday} از ${countedTasks.length} تسک انجام شده — ${doneMinutes} از ${totalMinutes} دقیقه`}
        </p>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success === "challenge" ? (
        <div className="alert alert-success">چالش امروز ثبت شد. روز خوبی داشته باشی!</div>
      ) : null}

      {challenge.challenge ? <DailyChallengeCard question={challenge.challenge.question} /> : null}

      {data.examsToday.length > 0 ? (
        <div className="alert alert-warn">
          امروز روز آزمون است:{" "}
          {data.examsToday.map((exam) => exam.title).join(" · ")}. برنامه امروز به استراحت و
          جمع‌بندی کوتاه اختصاص داده شده است.
        </div>
      ) : null}

      {lateStart ? (
        <div className="alert alert-warn">
          پنجره «شروع درست» امروز گذشته است. با یک تسک کوتاه شروع کن؛ مهم ادامه دادن است.
        </div>
      ) : null}
      {overdueCount > 0 ? (
        <div className="alert alert-warn">
          {overdueCount.toLocaleString("fa-IR")} تسک از زمان برنامه‌ریزی‌شده گذشته و هنوز انجام نشده است.
        </div>
      ) : null}
      {firstPending ? (
        <div className="alert alert-success">
          پیام شروع: اولین تسک امروز «{firstPending.subjectTitle}» ساعت{" "}
          {formatTime(firstPending.plannedStart)} است.
          {firstPending.topic ? ` موضوع: ${firstPending.topic}.` : ""}
        </div>
      ) : null}

      <div className="week-strip">
        {WEEKDAY_LABELS.map((label, index) => {
          const day = week[index];
          const isToday = index === weekdayIndex(data.today);
          return (
            <div key={label} className={`week-day ${isToday ? "is-today" : ""}`}>
              <strong>{label}</strong>
              <span className="muted" style={{ fontSize: "0.72rem" }}>
                {formatJalaliNumeric(day.date).slice(-5)}
              </span>
              <div style={{ marginTop: "0.25rem" }}>
                {day.total === 0 ? (
                  <span className="muted">—</span>
                ) : day.done === day.total ? (
                  <span className="badge badge-green">✓</span>
                ) : (
                  <span className="muted">
                    {day.done}/{day.total}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!data.plan ? (
        <div className="card empty">
          <p>هنوز برنامه‌ای برای این هفته تأیید نشده است.</p>
          <p className="muted">از مشاورت بپرس تا برنامه‌ات را آماده کند.</p>
        </div>
      ) : data.tasks.length === 0 ? (
        <div className="card empty">
          <p>امروز تسکی نداری.</p>
          <p className="muted">روز تعطیل یا استراحت است؛ فردا ادامه بده.</p>
          <Link href="/student/panel" className="btn btn-secondary btn-sm">
            دیدن برنامه‌ریزی
          </Link>
        </div>
      ) : (
        <>
          <div className="stat">
            <div className="row between">
              <span className="stat-label">پایبندی امروز</span>
              <strong>{pct}٪</strong>
            </div>
            <div className="progress" style={{ marginTop: "0.45rem" }}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="task-list">
            {data.tasks.map((task) => (
              <div
                key={task.id}
                className={`task ${task.status === "done" ? "is-done" : ""} task-action-${task.actionKind}`}
                style={{ borderInlineStartColor: task.subjectColor || "var(--brand)" }}
              >
                <div className="task-time">
                  {formatTime(task.plannedStart)}
                  <br />
                  {formatTime(task.plannedEnd)}
                </div>
                <div>
                  <div className="task-title">{task.subjectTitle}</div>
                  <div className="task-meta">
                    {task.actionKind === "routine"
                      ? `روتین (${task.routineMode === "study" ? "مطالعه" : "تست"})`
                      : TYPE_LABELS[task.type] ?? task.type}{" "}
                    · {task.estMinutes} دقیقه
                    {task.targetUnits > 0
                      ? ` · ${task.targetUnits} ${
                          task.resourceUnitType === "test"
                            ? "تست"
                            : task.resourceUnitType === "exercise"
                              ? "تمرین"
                              : "واحد"
                        }`
                      : ""}
                    {task.chapterTitle
                      ? ` · ${task.chapterTitle}`
                      : task.topic
                        ? ` · ${task.topic}`
                        : ""}
                  </div>
                  {task.resourceTitle ? (
                    <div className="task-meta">{task.resourceTitle}</div>
                  ) : null}
                  {task.status === "done" ? (
                    <div className="task-meta" style={{ color: "var(--brand)" }}>
                      انجام شد{" "}
                      {task.actualUnits > 0
                        ? `· ${task.actualUnits} ${
                            task.resourceUnitType === "test"
                              ? "تست"
                              : task.resourceUnitType === "exercise"
                                ? "تمرین"
                                : "واحد"
                          }`
                        : ""}
                      {task.note ? ` · ${task.note}` : ""}
                    </div>
                  ) : null}
                  {task.status === "skipped" ? <div className="task-meta">رد شد</div> : null}
                  {task.resourceId &&
                  data.content.some((item) => item.resourceId === task.resourceId) ? (
                    <details style={{ marginTop: "0.35rem" }}>
                      <summary className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                        محتوای مرتبط
                      </summary>
                      <div className="stack" style={{ gap: "0.4rem", marginTop: "0.35rem" }}>
                        {data.content
                          .filter((item) => item.resourceId === task.resourceId)
                          .map((item) => (
                            <ContentCard key={item.id} item={item} compact />
                          ))}
                      </div>
                    </details>
                  ) : null}
                </div>
                <span
                  className={`badge ${
                    task.status === "done"
                      ? "badge-green"
                      : task.status === "skipped"
                        ? "badge-warn"
                        : ""
                  }`}
                >
                  {task.status === "done" ? "انجام شد" : task.status === "skipped" ? "رد شد" : "در انتظار"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
