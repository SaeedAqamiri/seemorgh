import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addAvailabilityAction,
  addExamTargetAction,
  approvePlanAction,
  archiveStudentAction,
  deleteAvailabilityAction,
  deleteExamTargetAction,
  generatePlanAction,
  reopenPlanAction,
  saveConstraintsAction,
  updateStudentAction,
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
  startOfWeekSaturday,
  todayISO,
  WEEKDAY_LABELS,
  weekDates,
} from "@/lib/dates";
import { aiPlanningConfigured } from "@/lib/ai-plan";
import { summarizeResourceProgress } from "@/lib/resource-progress";
import { FIELDS, GRADES, TRACK_LABELS } from "@/lib/subjects";

const SUCCESS: Record<string, string> = {
  created: "دانش‌آموز ساخته شد.",
  profile: "مشخصات ذخیره شد.",
  target: "هدف امتحانی اضافه شد.",
  "target-deleted": "هدف حذف شد.",
  availability: "بازه زمانی اضافه شد.",
  "availability-deleted": "بازه زمانی حذف شد.",
  constraints: "محدودیت‌ها ذخیره شد.",
  generated: "پیش‌نویس برنامه ساخته شد. قبل از تأیید بازبینی کنید.",
  approved: "برنامه تأیید شد و برای دانش‌آموز قابل مشاهده است.",
  reopened: "برنامه به حالت پیش‌نویس برگشت.",
};

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  approved: "تأییدشده",
  active: "در اجرا",
  archived: "بایگانی",
};

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
  const resourceSummary = summarizeResourceProgress(detail.resources);

  const adherence =
    report.plannedMinutes === 0 ? 0 : Math.round((report.doneMinutes / report.plannedMinutes) * 100);
  const planHref = (value: string) => `/counselor/students/${id}?week=${value}`;
  const panelHref = `/counselor/students/${id}/panel?week=${weekStart}`;
  const performanceHref = `/counselor/students/${id}/performance?week=${weekStart}`;

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
            پیشرفت منابع: {resourceSummary.percent}٪ · باقی‌مانده:{" "}
            {resourceSummary.remainingUnits.toLocaleString("fa-IR")}
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
            <h2>هفته {formatJalali(weekStart)}</h2>
            <small>
              {formatJalaliNumeric(dates[0])} تا {formatJalaliNumeric(dates[6])} — وضعیت:{" "}
              {planData ? PLAN_STATUS_LABELS[planData.plan.status] ?? planData.plan.status : "بدون برنامه"}
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
          </div>
        </div>

        <div className="row" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
          <Link className="btn btn-secondary btn-sm" href={`/counselor/students/${id}/resources`}>
            مدیریت منابع
          </Link>
          <Link className="btn btn-secondary btn-sm" href={panelHref}>
            برنامه‌ریزی
          </Link>
          <Link className="btn btn-secondary btn-sm" href={performanceHref}>
            دفترچه عملکرد
          </Link>
          <Link className="btn btn-secondary btn-sm" href={`/counselor/students/${id}/report`}>
            گزارش
          </Link>
        </div>

        <hr className="divider" />

        <div className="row" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
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

        {planData?.plan.warningsJson?.length ? (
          <div className="alert alert-warn" style={{ marginTop: "0.75rem" }}>
            {planData.plan.warningsJson.map((warning) => (
              <div key={warning}>• {warning}</div>
            ))}
          </div>
        ) : null}

        {!planData ? (
          <div className="empty" style={{ marginTop: "0.75rem" }}>
            برای این هفته برنامه‌ای ثبت نشده است. از «برنامه‌ریزی» جدول هفته را پر کنید یا پیش‌نویس بسازید.
          </div>
        ) : (
          <small className="muted" style={{ display: "block", marginTop: "0.75rem" }}>
            {planData.tasks.length} تسک ثبت شده است. برای مشاهده و ویرایش جزئیات به «برنامه‌ریزی» بروید.
          </small>
        )}
      </div>

      <div className="grid grid-2">
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
                    <div className="row" style={{ gap: "0.35rem", flex: 1, flexWrap: "wrap" }}>
                      {slots.map((slot) => (
                        <form key={slot.id} action={deleteAvailabilityAction} className="inline-form">
                          <input type="hidden" name="studentId" value={id} />
                          <input type="hidden" name="availabilityId" value={slot.id} />
                          <span className="badge">
                            {formatTime(slot.startMin)}–{formatTime(slot.endMin)}
                          </span>
                          <SubmitButton className="btn-ghost btn-sm" pendingLabel="…">
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
        </div>

        <div className="card">
          <div className="section-head">
            <h2>محدودیت‌ها</h2>
            <small>سقف روزانه، روز تعطیل و بافر برنامه</small>
          </div>
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
    </div>
  );
}
