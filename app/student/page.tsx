import Link from "next/link";
import {
  finishTaskAction,
  saveDailyLogAction,
  skipTaskAction,
  startTaskAction,
} from "@/app/actions/student";
import { SubmitButton } from "@/components/submit-button";
import { ContentCard } from "@/components/content-card";
import { requireStudent } from "@/lib/auth";
import {
  formatJalali,
  formatJalaliNumeric,
  formatTime,
  tehranMinutesNow,
  WEEKDAY_LABELS,
  weekdayIndex,
} from "@/lib/dates";
import { getStudentTodayData, summarizeWeek } from "@/lib/student";

const SUCCESS: Record<string, string> = {
  started: "شروع ثبت شد. موفق باشی!",
  done: "آفرین، تسک انجام شد.",
  skipped: "تسک رد شد.",
  log: "حال امروز ذخیره شد.",
};

const TYPE_LABELS = {
  study: "مطالعه",
  review: "مرور",
  test: "تست",
} as const;

export default async function StudentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { user, student } = await requireStudent();
  const { success, error } = await searchParams;
  const data = await getStudentTodayData(student.id);
  const week = summarizeWeek(data.weekTasks, data.weekStart);
  const doneToday = data.tasks.filter((task) => task.status === "done").length;
  const totalMinutes = data.tasks.reduce((sum, task) => sum + task.estMinutes, 0);
  const doneMinutes = data.tasks
    .filter((task) => task.status === "done")
    .reduce((sum, task) => sum + task.estMinutes, 0);
  const pct = totalMinutes === 0 ? 0 : Math.round((doneMinutes / totalMinutes) * 100);
  const nowMinutes = tehranMinutesNow();
  const pendingTasks = data.tasks.filter((task) => task.status === "pending");
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
          {data.tasks.length === 0
            ? "برای امروز تسکی ثبت نشده است."
            : `${doneToday} از ${data.tasks.length} تسک انجام شده — ${doneMinutes} از ${totalMinutes} دقیقه`}
        </p>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

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
          <Link href="/student/week" className="btn btn-secondary btn-sm">
            دیدن برنامه هفته
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
              <div key={task.id} className={`task ${task.status === "done" ? "is-done" : ""}`}>
                <div className="task-time">
                  {formatTime(task.plannedStart)}
                  <br />
                  {formatTime(task.plannedEnd)}
                </div>
                <div>
                  <div className="task-title">{task.subjectTitle}</div>
                  <div className="task-meta">
                    {TYPE_LABELS[task.type]} · {task.estMinutes} دقیقه
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
                  {task.resourceTitle ? (
                    <div className="task-meta">{task.resourceTitle}</div>
                  ) : null}
                  {task.status === "done" ? (
                    <div className="task-meta" style={{ color: "var(--brand)" }}>
                      انجام شد{" "}
                      {task.actualUnits > 0
                        ? `· ${task.actualUnits} ${
                            task.resourceUnitType === "page"
                              ? "صفحه"
                              : task.resourceUnitType === "test"
                                ? "تست"
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
                <div className="stack" style={{ gap: "0.3rem", alignItems: "flex-end" }}>
                  {task.status === "pending" ? (
                    <>
                      {!task.actualStartedAt ? (
                        <form action={startTaskAction}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <SubmitButton className="btn-sm" pendingLabel="…">
                            شروع
                          </SubmitButton>
                        </form>
                      ) : null}
                      <details>
                        <summary className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                          پایان
                        </summary>
                        <form action={finishTaskAction} className="stack" style={{ marginTop: "0.4rem", minWidth: "200px" }}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <div className="field">
                            <label>
                              {task.resourceUnitType === "page"
                                ? "چند صفحه خواندی؟"
                                : task.resourceUnitType === "test"
                                  ? "چند تست زدی؟"
                                  : "واحد انجام‌شده"}
                            </label>
                            <input
                              name="actualUnits"
                              type="number"
                              min={0}
                              defaultValue={task.targetUnits}
                            />
                          </div>
                          <div className="field">
                            <label>یادداشت (اختیاری)</label>
                            <input name="note" />
                          </div>
                          <SubmitButton className="btn-sm">ثبت انجام</SubmitButton>
                        </form>
                      </details>
                      <form action={skipTaskAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <SubmitButton className="btn-ghost btn-sm" pendingLabel="…">
                          رد کردن
                        </SubmitButton>
                      </form>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card">
        <div className="section-head">
          <h2>حال امروز</h2>
          <small>اختیاری</small>
        </div>
        <form action={saveDailyLogAction} className="stack">
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>روحیه</label>
              <select name="mood" defaultValue={String(data.log?.mood ?? 3)}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value === 1 ? "خیلی کم" : value === 5 ? "عالی" : value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>انرژی</label>
              <select name="energy" defaultValue={String(data.log?.energy ?? 3)}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value === 1 ? "خیلی کم" : value === 5 ? "عالی" : value}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>یادداشت</label>
            <textarea name="note" defaultValue={data.log?.note ?? ""} rows={2} />
          </div>
          <SubmitButton className="btn-secondary">ذخیره</SubmitButton>
        </form>
      </div>
    </div>
  );
}
