import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addAvailabilityAction,
  addExamTargetAction,
  addResourceAction,
  addTaskAction,
  approvePlanAction,
  archiveStudentAction,
  deleteAvailabilityAction,
  deleteExamTargetAction,
  deleteResourceAction,
  deleteTaskAction,
  generatePlanAction,
  reopenPlanAction,
  saveConstraintsAction,
  updateResourceAction,
  updateStudentAction,
  updateTaskAction,
} from "@/app/actions/counselor";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { getPlanForWeek, getStudentDetail, getWeekReport } from "@/lib/counselor";
import {
  addDays,
  formatJalali,
  formatJalaliNumeric,
  formatTime,
  isISODate,
  parseISODate,
  startOfWeekSaturday,
  todayISO,
  WEEKDAY_LABELS,
  weekDates,
} from "@/lib/dates";
import { aiPlanningConfigured } from "@/lib/ai-plan";
import { formatChapters } from "@/lib/resources";
import { FIELDS, GRADES, TRACK_LABELS, UNIT_TYPE_LABELS } from "@/lib/subjects";

const SUCCESS: Record<string, string> = {
  created: "دانش‌آموز ساخته شد.",
  profile: "مشخصات ذخیره شد.",
  target: "هدف امتحانی اضافه شد.",
  "target-deleted": "هدف حذف شد.",
  resource: "منبع اضافه شد.",
  "resource-updated": "پیشرفت منبع ذخیره شد.",
  "resource-deleted": "منبع حذف شد.",
  availability: "بازه زمانی اضافه شد.",
  "availability-deleted": "بازه زمانی حذف شد.",
  constraints: "محدودیت‌ها ذخیره شد.",
  generated: "پیش‌نویس برنامه ساخته شد. قبل از تأیید بازبینی کنید.",
  approved: "برنامه تأیید شد و برای دانش‌آموز قابل مشاهده است.",
  reopened: "برنامه به حالت پیش‌نویس برگشت.",
  "task-updated": "تسک ویرایش شد.",
  "task-added": "تسک اضافه شد.",
  "task-deleted": "تسک حذف شد.",
};

const TASK_TYPE_LABELS = {
  study: "مطالعه",
  review: "مرور",
  test: "تست",
} as const;

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string; success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { week, success, error } = await searchParams;

  const detail = await getStudentDetail(counselor.workspaceId, id);
  if (!detail) notFound();

  const requestedWeek = week && isISODate(week) ? week : todayISO();
  const weekStart = startOfWeekSaturday(requestedWeek);
  const planData = await getPlanForWeek(counselor.workspaceId, id, weekStart);
  const report = await getWeekReport(counselor.workspaceId, id, weekStart);
  const dates = weekDates(weekStart);

  const subjectTitle = new Map(detail.subjects.map((subject) => [subject.id, subject.title]));
  const canEdit = !planData || planData.plan.status === "draft";
  const adherence =
    report.plannedMinutes === 0 ? 0 : Math.round((report.doneMinutes / report.plannedMinutes) * 100);
  const top = planData?.tasks[0];
  const planHref = (value: string) => `/counselor/students/${id}?week=${value}`;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href="/counselor" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به فهرست
          </Link>
          <h1>{detail.student.name}</h1>
          <small>
            {detail.student.grade} / {detail.student.field} /{" "}
            {TRACK_LABELS[detail.student.track] ?? detail.student.track} — {detail.student.phone}
          </small>
        </div>
        <div className="row">
          <span className={`badge ${detail.student.userId ? "badge-green" : "badge-warn"}`}>
            {detail.student.userId ? "حساب فعال" : "در انتظار فعال‌سازی"}
          </span>
          <span className="badge">
            باقی‌مانده منابع: {detail.resources.reduce((sum, resource) => sum + Math.max(0, resource.totalUnits - resource.completedUnits), 0).toLocaleString("fa-IR")}
          </span>
        </div>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {!detail.student.userId ? (
        <div className="alert alert-warn">
          لینک دعوت دانش‌آموز:{" "}
          <code dir="ltr" style={{ userSelect: "all" }}>
            /invite/{detail.student.inviteCode}
          </code>
        </div>
      ) : null}

      <div className="card">
        <div className="row between">
          <div>
            <h2>هفته {formatJalali(weekStart)}</h2>
            <small>
              {formatJalaliNumeric(dates[0])} تا {formatJalaliNumeric(dates[6])}
            </small>
          </div>
          <div className="row">
            <Link className="btn btn-secondary btn-sm" href={planHref(addDays(weekStart, -7))}>
              هفته قبل
            </Link>
            <Link className="btn btn-secondary btn-sm" href={planHref(startOfWeekSaturday(todayISO()))}>
              این هفته
            </Link>
            <Link className="btn btn-secondary btn-sm" href={planHref(addDays(weekStart, 7))}>
              هفته بعد
            </Link>
            <a
              className="btn btn-secondary btn-sm"
              href={`/counselor/export?type=plan&studentId=${id}&week=${weekStart}`}
            >
              اکسل برنامه
            </a>
            <a
              className="btn btn-secondary btn-sm"
              href={`/counselor/export?type=report&studentId=${id}&week=${weekStart}`}
            >
              اکسل گزارش
            </a>
            <Link className="btn btn-secondary btn-sm" href={`/counselor/students/${id}/report`}>
              گزارش ماهانه
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-value">{adherence}٪</div>
          <div className="stat-label">پایبندی (دقیقه انجام‌شده / برنامه)</div>
          <div className="progress" style={{ marginTop: "0.5rem" }}>
            <span style={{ width: `${Math.min(100, adherence)}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {report.correctStarts} / {report.eligibleDays}
          </div>
          <div className="stat-label">روز با شروع درست</div>
        </div>
        <div className="stat">
          <div className="stat-value">{report.activeDays} روز</div>
          <div className="stat-label">
            {report.doneTasks} از {report.totalTasks} تسک انجام‌شده
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>برنامه هفته</h2>
            <small>
              {planData
                ? `${planData.tasks.length} تسک — وضعیت: ${
                    planData.plan.status === "draft"
                      ? "پیش‌نویس"
                      : planData.plan.status === "approved"
                        ? "تأییدشده"
                        : planData.plan.status === "active"
                          ? "در اجرا"
                          : "بایگانی"
                  }`
                : "برای این هفته برنامه‌ای ثبت نشده است."}
            </small>
          </div>
          <div className="row">
            {planData && planData.plan.status === "draft" ? (
              <form action={approvePlanAction} className="inline-form">
                <input type="hidden" name="studentId" value={id} />
                <input type="hidden" name="planId" value={planData.plan.id} />
                <SubmitButton pendingLabel="در حال تأیید…">تأیید برنامه</SubmitButton>
              </form>
            ) : null}
            {planData && planData.plan.status !== "draft" ? (
              <form action={reopenPlanAction} className="inline-form">
                <input type="hidden" name="studentId" value={id} />
                <input type="hidden" name="planId" value={planData.plan.id} />
                <SubmitButton className="btn-secondary btn-sm">ویرایش (بازگشت به پیش‌نویس)</SubmitButton>
              </form>
            ) : null}
            <form action={generatePlanAction} className="inline-form">
              <input type="hidden" name="studentId" value={id} />
              <input type="hidden" name="weekStart" value={weekStart} />
              {planData ? <input type="hidden" name="regenerate" value="1" /> : null}
              <SubmitButton
                className="btn-secondary btn-sm"
                pendingLabel={planData ? "در حال بازسازی…" : "در حال ساخت…"}
              >
                {planData ? "بازتولید پیش‌نویس" : "ساخت پیش‌نویس"}
              </SubmitButton>
            </form>
            {aiPlanningConfigured() ? (
              <form action={generatePlanAction} className="inline-form">
                <input type="hidden" name="studentId" value={id} />
                <input type="hidden" name="weekStart" value={weekStart} />
                <input type="hidden" name="useAi" value="1" />
                {planData ? <input type="hidden" name="regenerate" value="1" /> : null}
                <SubmitButton className="btn-secondary btn-sm" pendingLabel="AI در حال بررسی…">
                  ساخت با AI
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>

        {planData?.plan.warningsJson?.length ? (
          <div className="alert alert-warn">
            {planData.plan.warningsJson.map((warning) => (
              <div key={warning}>• {warning}</div>
            ))}
          </div>
        ) : null}

        {!planData ? (
          <div className="empty">
            منابع، زمان‌های آزاد و محدودیت‌ها را کامل کنید، سپس «ساخت پیش‌نویس» را بزنید.
          </div>
        ) : (
          <div className="stack" style={{ gap: "0.9rem" }}>
            {dates.map((date, index) => {
              const dayTasks = planData.tasks.filter((task) => task.planDate === date);
              if (dayTasks.length === 0) return null;
              return (
                <div key={date}>
                  <div className="section-head">
                    <h3>
                      {WEEKDAY_LABELS[index]} — {formatJalaliNumeric(date)}
                    </h3>
                    <small>
                      {dayTasks.reduce((sum, task) => sum + task.estMinutes, 0)} دقیقه
                    </small>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>زمان</th>
                          <th>درس / منبع</th>
                          <th>نوع</th>
                          <th>واحد</th>
                          <th>وضعیت</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {dayTasks.map((task) => (
                          <tr key={task.id}>
                            <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                              {formatTime(task.plannedStart)}–{formatTime(task.plannedEnd)}
                            </td>
                            <td>
                              <strong>{subjectTitle.get(task.subjectId) ?? "درس"}</strong>
                              <div className="muted" style={{ fontSize: "0.78rem" }}>
                                {task.topic || "—"}
                              </div>
                            </td>
                            <td>{TASK_TYPE_LABELS[task.type]}</td>
                            <td>{task.targetUnits.toLocaleString("fa-IR")}</td>
                            <td>
                              {task.status === "done" ? (
                                <span className="badge badge-green">انجام شد</span>
                              ) : task.status === "skipped" ? (
                                <span className="badge badge-warn">رد شد</span>
                              ) : (
                                <span className="badge">در انتظار</span>
                              )}
                            </td>
                            <td>
                              {canEdit ? (
                                <div className="stack" style={{ gap: "0.3rem" }}>
                                  <details>
                                    <summary className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                                      ویرایش
                                    </summary>
                                    <form action={updateTaskAction} className="stack" style={{ marginTop: "0.5rem", minWidth: "220px" }}>
                                      <input type="hidden" name="studentId" value={id} />
                                      <input type="hidden" name="taskId" value={task.id} />
                                      <div className="row">
                                        <div className="field" style={{ flex: 1 }}>
                                          <label>شروع</label>
                                          <input name="start" defaultValue={formatTime(task.plannedStart)} dir="ltr" />
                                        </div>
                                        <div className="field" style={{ flex: 1 }}>
                                          <label>پایان</label>
                                          <input name="end" defaultValue={formatTime(task.plannedEnd)} dir="ltr" />
                                        </div>
                                      </div>
                                      <div className="field">
                                        <label>موضوع</label>
                                        <input name="topic" defaultValue={task.topic} />
                                      </div>
                                      <div className="field">
                                        <label>یادداشت</label>
                                        <input name="note" defaultValue={task.note} />
                                      </div>
                                      <SubmitButton className="btn-sm">ذخیره</SubmitButton>
                                    </form>
                                  </details>
                                  <form action={deleteTaskAction}>
                                    <input type="hidden" name="studentId" value={id} />
                                    <input type="hidden" name="taskId" value={task.id} />
                                    <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                                      حذف
                                    </SubmitButton>
                                  </form>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {canEdit ? (
              <>
                <hr className="divider" />
                <details>
                  <summary className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                    افزودن تسک دستی
                  </summary>
                  <form action={addTaskAction} className="form-grid" style={{ marginTop: "0.6rem" }}>
                    <input type="hidden" name="studentId" value={id} />
                    <input type="hidden" name="planId" value={planData.plan.id} />
                    <div className="field">
                      <label>تاریخ</label>
                      <input name="planDate" type="date" defaultValue={dates[0]} required />
                    </div>
                    <div className="field">
                      <label>درس</label>
                      <select name="subjectId" required>
                        {detail.subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>منبع (اختیاری)</label>
                      <select name="resourceId">
                        <option value="">—</option>
                        {detail.resources.map((resource) => (
                          <option key={resource.id} value={resource.id}>
                            {resource.subjectTitle} — {resource.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>شروع</label>
                      <input name="start" defaultValue="16:00" dir="ltr" required />
                    </div>
                    <div className="field">
                      <label>پایان</label>
                      <input name="end" defaultValue="17:00" dir="ltr" required />
                    </div>
                    <div className="field">
                      <label>نوع</label>
                      <select name="type" defaultValue="study">
                        {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>واحد هدف</label>
                      <input name="targetUnits" type="number" min={0} defaultValue={10} />
                    </div>
                    <div className="field">
                      <label>موضوع</label>
                      <input name="topic" placeholder="مثلاً فصل ۳" />
                    </div>
                    <div className="field">
                      <SubmitButton>افزودن تسک</SubmitButton>
                    </div>
                  </form>
                </details>
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>منابع</h2>
            <small>{detail.resources.length} منبع</small>
          </div>
          {detail.resources.length === 0 ? (
            <div className="empty">هنوز منبعی ثبت نشده است.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>منبع</th>
                    <th>نوع</th>
                    <th>پیشرفت</th>
                    <th>اولویت</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detail.resources.map((resource) => {
                    const pct =
                      resource.totalUnits === 0
                        ? 0
                        : Math.round((resource.completedUnits / resource.totalUnits) * 100);
                    return (
                      <tr key={resource.id}>
                        <td>
                          <strong>{resource.subjectTitle}</strong>
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            {resource.title}
                          </div>
                          <div className="progress" style={{ marginTop: "0.3rem" }}>
                            <span style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          {resource.chaptersJson?.length ? (
                            <details style={{ marginTop: "0.25rem" }}>
                              <summary className="muted" style={{ fontSize: "0.76rem", cursor: "pointer" }}>
                                {resource.chaptersJson.length} فصل
                              </summary>
                              <ul style={{ margin: "0.25rem 0 0", paddingInlineStart: "1rem", fontSize: "0.76rem" }}>
                                {resource.chaptersJson.map((chapter) => (
                                  <li key={`${chapter.title}-${chapter.startPage}`}>
                                    {chapter.title} — صفحه {chapter.startPage} تا {chapter.endPage}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                        </td>
                        <td>{UNIT_TYPE_LABELS[resource.unitType]}</td>
                        <td>
                          <form action={updateResourceAction} className="stack" style={{ gap: "0.25rem" }}>
                            <input type="hidden" name="studentId" value={id} />
                            <input type="hidden" name="resourceId" value={resource.id} />
                            <div className="row" style={{ gap: "0.25rem" }}>
                              <input
                                name="completedUnits"
                                type="number"
                                min={0}
                                defaultValue={resource.completedUnits}
                                style={{ width: "72px" }}
                                aria-label="انجام‌شده"
                              />
                              <span className="muted">/</span>
                              <input
                                name="totalUnits"
                                type="number"
                                min={0}
                                defaultValue={resource.totalUnits}
                                style={{ width: "72px" }}
                                aria-label="کل"
                              />
                            </div>
                            <div className="field">
                              <label style={{ fontSize: "0.72rem" }}>فصل‌بندی (هر خط: عنوان | تعداد صفحه)</label>
                              <textarea
                                name="chapters"
                                rows={2}
                                defaultValue={formatChapters(resource.chaptersJson)}
                                style={{ minHeight: "54px", fontSize: "0.78rem" }}
                              />
                            </div>
                            <div className="row" style={{ gap: "0.25rem" }}>
                              <select
                                name="priority"
                                defaultValue={String(resource.priority)}
                                style={{ width: "80px" }}
                                aria-label="اولویت"
                              >
                                {[1, 2, 3, 4, 5].map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                              <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                                ذخیره
                              </SubmitButton>
                            </div>
                          </form>
                        </td>
                        <td>{resource.priority}</td>
                        <td>
                          <form action={deleteResourceAction}>
                            <input type="hidden" name="studentId" value={id} />
                            <input type="hidden" name="resourceId" value={resource.id} />
                            <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                              حذف
                            </SubmitButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <hr className="divider" />
          <form action={addResourceAction} className="form-grid">
            <input type="hidden" name="studentId" value={id} />
            <div className="field">
              <label>درس</label>
              <select name="subjectId" required>
                {detail.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>عنوان منبع</label>
              <input name="title" placeholder="مثلاً زیست دوازدهم" required />
            </div>
            <div className="field">
              <label>نوع واحد</label>
              <select name="unitType" defaultValue="page">
                {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>تعداد کل (صفحه/تست)</label>
              <input name="totalUnits" type="number" min={0} defaultValue={0} />
            </div>
            <div className="field">
              <label>انجام‌شده</label>
              <input name="completedUnits" type="number" min={0} defaultValue={0} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>فصل‌بندی — هر خط: عنوان فصل | تعداد صفحه (اختیاری)</label>
              <textarea
                name="chapters"
                rows={3}
                placeholder={"فصل ۱ | 24\nفصل ۲ | 30\nفصل ۳ | 18"}
              />
            </div>
            <div className="field">
              <label>اولویت</label>
              <select name="priority" defaultValue="3">
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <SubmitButton className="btn-secondary">افزودن منبع</SubmitButton>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="section-head">
            <h2>زمان‌های آزاد</h2>
            <small>{detail.availability.length} بازه</small>
          </div>
          {detail.availability.length === 0 ? (
            <div className="empty">زمان آزادی ثبت نشده است.</div>
          ) : (
            <div className="stack" style={{ gap: "0.35rem" }}>
              {WEEKDAY_LABELS.map((label, index) => {
                const slots = detail.availability.filter((slot) => slot.weekday === index);
                if (slots.length === 0) return null;
                return (
                  <div key={label} className="row between" style={{ gap: "0.5rem" }}>
                    <strong style={{ fontSize: "0.85rem", minWidth: "58px" }}>{label}</strong>
                    <div className="row" style={{ gap: "0.35rem", flex: 1 }}>
                      {slots.map((slot) => (
                        <form key={slot.id} action={deleteAvailabilityAction} className="inline-form">
                          <input type="hidden" name="studentId" value={id} />
                          <input type="hidden" name="availabilityId" value={slot.id} />
                          <span className="badge">
                            {formatTime(slot.startMin)}–{formatTime(slot.endMin)}
                          </span>
                          <SubmitButton className="btn-ghost btn-sm" pendingLabel="…" >
                            ×
                          </SubmitButton>
                        </form>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <hr className="divider" />
          <form action={addAvailabilityAction} className="form-grid">
            <input type="hidden" name="studentId" value={id} />
            <div className="field">
              <label>روز</label>
              <select name="weekday" defaultValue="0">
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>از</label>
              <input name="start" defaultValue="16:00" dir="ltr" required />
            </div>
            <div className="field">
              <label>تا</label>
              <input name="end" defaultValue="20:00" dir="ltr" required />
            </div>
            <div className="field">
              <SubmitButton className="btn-secondary">افزودن بازه</SubmitButton>
            </div>
          </form>

          <hr className="divider" />
          <h3>محدودیت‌ها</h3>
          <form action={saveConstraintsAction} className="form-grid">
            <input type="hidden" name="studentId" value={id} />
            <div className="field">
              <label>سقف دقیقه روزانه</label>
              <input
                name="maxDailyMinutes"
                type="number"
                min={30}
                max={720}
                defaultValue={detail.constraints.maxDailyMinutes}
              />
            </div>
            <div className="field">
              <label>روز تعطیل</label>
              <select name="restWeekday" defaultValue={String(detail.constraints.restWeekday)}>
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>بافر (٪)</label>
              <input
                name="bufferPct"
                type="number"
                min={0}
                max={50}
                defaultValue={detail.constraints.bufferPct}
              />
            </div>
            <div className="field">
              <SubmitButton className="btn-secondary">ذخیره</SubmitButton>
            </div>
          </form>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>اهداف امتحانی</h2>
            <small>{detail.targets.length} هدف</small>
          </div>
          {detail.targets.length === 0 ? (
            <div className="empty">هدف امتحانی ثبت نشده است.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>عنوان</th>
                    <th>نوع</th>
                    <th>تاریخ</th>
                    <th>وزن</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detail.targets.map((target) => (
                    <tr key={target.id}>
                      <td>{target.title}</td>
                      <td>{target.examType}</td>
                      <td>{formatJalaliNumeric(target.examDate)}</td>
                      <td>{target.weight}</td>
                      <td>
                        <form action={deleteExamTargetAction}>
                          <input type="hidden" name="studentId" value={id} />
                          <input type="hidden" name="targetId" value={target.id} />
                          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                            حذف
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <hr className="divider" />
          <form action={addExamTargetAction} className="form-grid">
            <input type="hidden" name="studentId" value={id} />
            <div className="field">
              <label>عنوان</label>
              <input name="title" placeholder="مثلاً کنکور ۱۴۰۶" required />
            </div>
            <div className="field">
              <label>نوع</label>
              <select name="examType" defaultValue="konkur">
                <option value="konkur">کنکور</option>
                <option value="final">امتحان نهایی</option>
                <option value="mock">آزمون آزمایشی</option>
              </select>
            </div>
            <div className="field">
              <label>تاریخ</label>
              <input name="examDate" type="date" required />
            </div>
            <div className="field">
              <label>وزن</label>
              <select name="weight" defaultValue="3">
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <SubmitButton className="btn-secondary">افزودن هدف</SubmitButton>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="section-head">
            <h2>گزارش هفته</h2>
            <small>{formatJalali(weekStart)}</small>
          </div>
          <div className="stack" style={{ gap: "0.5rem" }}>
            {report.byDay.map((day, index) => (
              <div key={day.date} className="row between" style={{ gap: "0.5rem" }}>
                <span style={{ minWidth: "110px", fontSize: "0.82rem" }}>
                  {WEEKDAY_LABELS[index]} {formatJalaliNumeric(day.date)}
                </span>
                <div className="progress" style={{ flex: 1 }}>
                  <span
                    style={{
                      width: `${day.total === 0 ? 0 : Math.round((day.done / day.total) * 100)}%`,
                    }}
                  />
                </div>
                <span className="muted" style={{ fontSize: "0.78rem", minWidth: "44px", textAlign: "left" }}>
                  {day.done}/{day.total}
                </span>
              </div>
            ))}
          </div>
          <hr className="divider" />
          <div className="grid grid-3">
            <div>
              <div className="stat-value" style={{ fontSize: "1.1rem" }}>
                {report.testsDone}
              </div>
              <div className="stat-label">تست انجام‌شده</div>
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: "1.1rem" }}>
                {report.doneMinutes}
              </div>
              <div className="stat-label">دقیقه انجام‌شده</div>
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: "1.1rem" }}>
                {top ? `${formatTime(top.plannedStart)}–${formatTime(top.plannedEnd)}` : "—"}
              </div>
              <div className="stat-label">اولین بلوک هفته</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>مشخصات دانش‌آموز</h2>
          <form action={archiveStudentAction}>
            <input type="hidden" name="studentId" value={id} />
            <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
              بایگانی دانش‌آموز
            </SubmitButton>
          </form>
        </div>
        <form action={updateStudentAction} className="form-grid">
          <input type="hidden" name="studentId" value={id} />
          <div className="field">
            <label>نام</label>
            <input name="name" defaultValue={detail.student.name} required />
          </div>
          <div className="field">
            <label>پایه</label>
            <select name="grade" defaultValue={detail.student.grade}>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>رشته</label>
            <select name="field" defaultValue={detail.student.field}>
              {FIELDS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>هدف</label>
            <select name="track" defaultValue={detail.student.track}>
              {Object.entries(TRACK_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>موبایل والد</label>
            <input name="guardianPhone" defaultValue={detail.student.guardianPhone ?? ""} />
          </div>
          <div className="field">
            <SubmitButton className="btn-secondary">ذخیره مشخصات</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
