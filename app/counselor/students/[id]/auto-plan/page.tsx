import Link from "next/link";
import { notFound } from "next/navigation";
import {
  generateAutoPlanAction,
  savePlanningSetupAction,
} from "@/app/actions/auto-plan";
import { SubmitButton } from "@/components/submit-button";
import { aiAutoPlanningConfigured } from "@/lib/ai-auto-plan";
import { defaultCurrentFor, defaultTargetFor, getAutoPlanContext } from "@/lib/auto-plan-data";
import {
  DEFAULT_PLANNING_POLICY,
  type GoalMetric,
} from "@/lib/auto-plan";
import { requireCounselor } from "@/lib/auth";
import { summarizeResourceProgress } from "@/lib/resource-progress";
import {
  addDays,
  formatJalali,
  formatJalaliNumeric,
  isISODate,
  startOfWeekSaturday,
  todayISO,
} from "@/lib/dates";

const POLICY_LABELS: Record<string, string> = {
  balanced: "متعادل — توزیع بر اساس فاصله هدف و وزن درس",
  weakest_first: "ضعیف‌ترین درس اول — تمرکز بیشتر روی فاصله‌های بزرگ",
  exam_weighted: "وزن آزمون — تمرکز بیشتر روی درس‌های با وزن بالاتر",
};

export default async function AutoPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    success?: string;
    error?: string;
    weeks?: string;
    source?: string;
    skipped?: string;
  }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { success, error, weeks, source, skipped } = await searchParams;

  const context = await getAutoPlanContext(counselor.workspaceId, id);
  if (!context) notFound();

  const { detail, goals, policy, targetDate, currentPercentBySubject } = context;
  const summary = summarizeResourceProgress(detail.resources);
  const goalBySubject = new Map(goals.map((goal) => [goal.subjectId, goal]));
  const defaultMetric: GoalMetric = detail.student.track === "final" ? "score" : "percent";
  const effectiveTargetDate =
    targetDate && isISODate(targetDate) ? targetDate : addDays(todayISO(), 90);
  const todayWeek = startOfWeekSaturday(todayISO());
  const upcomingPlans = detail.plans
    .filter((plan) => plan.weekStart >= todayWeek)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(0, 8);

  const subjectRows = detail.subjects.map((subject) => {
    const existing = goalBySubject.get(subject.id);
    const metric: GoalMetric = existing?.metric ?? defaultMetric;
    const current = existing?.currentValue ?? defaultCurrentFor(context, subject.id, metric);
    const target = existing?.targetValue ?? defaultTargetFor(current, metric);
    return {
      id: subject.id,
      title: subject.title,
      enabled: Boolean(existing),
      metric,
      current,
      target,
      weight: existing?.weight ?? 3,
      examPercent: currentPercentBySubject.get(subject.id) ?? null,
      resourceRemaining:
        summary.bySubject.find((row) => row.subjectId === subject.id)?.remainingUnits ?? 0,
    };
  });

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link
            href={`/counselor/students/${id}`}
            className="muted"
            style={{ fontSize: "0.82rem" }}
          >
            ← بازگشت به {detail.student.name}
          </Link>
          <h1>برنامه‌ریزی خودکار — {detail.student.name}</h1>
          <small>
            اهداف درسی را تعیین کنید تا برنامه تا {formatJalali(effectiveTargetDate)} در
            دفترچه برنامه‌ریزی هفتگی پر شود. منابع لازم نیست کامل شوند.
          </small>
        </div>
        <span className="badge">
          پیشرفت منابع: {summary.percent}٪ · باقی‌مانده:{" "}
          {summary.remainingUnits.toLocaleString("fa-IR")}
        </span>
      </div>

      {success === "saved" ? (
        <div className="alert alert-success">تنظیمات برنامه‌ریزی خودکار ذخیره شد.</div>
      ) : null}
      {success === "generated" ? (
        <div className="alert alert-success">
          برنامه برای {Number(weeks ?? 0).toLocaleString("fa-IR")} هفته ساخته و در دفترچه
          برنامه‌ریزی ثبت شد
          {source === "ai" ? " (تخصیص با AI)" : " (موتور قطعی)"}.
          {skipped && Number(skipped) > 0
            ? ` ${Number(skipped).toLocaleString("fa-IR")} هفته تأییدشده دست‌نخورده ماند.`
            : ""}
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="section-head">
          <div>
            <h2>وضعیت فعلی</h2>
            <small>
              وضعیت هر درس از جدیدترین کارنامه ثبت‌شده پیش‌پر می‌شود؛ می‌توانید آن را دستی
              تغییر دهید.
            </small>
          </div>
          <Link className="btn btn-secondary btn-sm" href={`/counselor/students/${id}/exam-analysis`}>
            تحلیل آزمون
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>درس</th>
                <th>درصد/نمره فعلی</th>
                <th>باقی‌مانده منبع</th>
              </tr>
            </thead>
            <tbody>
              {subjectRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>
                    {row.examPercent === null
                      ? "ثبت نشده"
                      : `${row.examPercent.toLocaleString("fa-IR")}٪`}
                    {row.enabled ? (
                      <span className="muted" style={{ marginInlineStart: "0.4rem" }}>
                        (هدف: {row.target.toLocaleString("fa-IR")})
                      </span>
                    ) : null}
                  </td>
                  <td>{row.resourceRemaining.toLocaleString("fa-IR")} واحد</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form action={savePlanningSetupAction} className="stack" style={{ gap: "1rem" }}>
        <input type="hidden" name="studentId" value={id} />

        <div className="card">
          <div className="section-head">
            <div>
              <h2>اهداف و بازه زمانی</h2>
              <small>
                برای هر درس، وضعیت فعلی و مقدار مطلوب را وارد کنید. درصد برای کنکور و نمره
                (از ۲۰) برای امتحان تشریحی است.
              </small>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>تاریخ رسیدن به هدف</label>
              <input
                type="date"
                name="targetDate"
                defaultValue={effectiveTargetDate}
                min={todayISO()}
                required
              />
            </div>
            <div className="field">
              <label>سیاست برنامه‌ریزی</label>
              <select name="strategy" defaultValue={policy.strategy}>
                {Object.entries(POLICY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>فعال</th>
                  <th>درس</th>
                  <th>نوع سنجش</th>
                  <th>وضعیت فعلی</th>
                  <th>مقدار مطلوب</th>
                  <th>وزن</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        name="enabled"
                        value={row.id}
                        defaultChecked={row.enabled}
                      />
                    </td>
                    <td>
                      {row.title}
                      <input type="hidden" name="subjectId" value={row.id} />
                    </td>
                    <td>
                      <select name="metric" defaultValue={row.metric}>
                        <option value="percent">درصد کنکور</option>
                        <option value="score">نمره از ۲۰</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        name="currentValue"
                        step="0.5"
                        min={0}
                        max={100}
                        defaultValue={row.current}
                        style={{ width: "90px" }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        name="targetValue"
                        step="0.5"
                        min={0}
                        max={100}
                        defaultValue={row.target}
                        style={{ width: "90px" }}
                      />
                    </td>
                    <td>
                      <select name="weight" defaultValue={String(row.weight)}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="muted" style={{ display: "block", marginTop: "0.5rem" }}>
            اگر نمره از ۲۰ انتخاب شود، مقدار مطلوب هم از ۲۰ است و برنامه به سمت مطالعه و
            تسلط مفهومی وزن بیشتری می‌دهد.
          </small>
        </div>

        <div className="card">
          <div className="section-head">
            <div>
              <h2>سیاست‌های برنامه‌ریزی</h2>
              <small>
                این مقادیر پیش‌فرض‌اند و فقط در صورت نیاز تغییر دهید. سیاست روی چگونگی
                تقسیم زمان بین تست، مرور و مطالعه اثر می‌گذارد.
              </small>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>دقیقه به ازای هر ۱٪ پیشرفت</label>
              <input
                type="number"
                name="minutesPerPercentPoint"
                min={5}
                max={240}
                defaultValue={policy.minutesPerPercentPoint}
              />
            </div>
            <div className="field">
              <label>دقیقه به ازای هر تست</label>
              <input
                type="number"
                name="minutesPerTest"
                step="0.5"
                min={0.5}
                max={10}
                defaultValue={policy.minutesPerTest}
              />
            </div>
            <div className="field">
              <label>سهم تست (٪)</label>
              <input
                type="number"
                name="testRatioPct"
                min={0}
                max={90}
                defaultValue={policy.testRatioPct}
              />
            </div>
            <div className="field">
              <label>سهم مرور (٪)</label>
              <input
                type="number"
                name="reviewRatioPct"
                min={0}
                max={50}
                defaultValue={policy.reviewRatioPct}
              />
            </div>
            <div className="field">
              <label>حداکثر درس در هر روز</label>
              <input
                type="number"
                name="maxSubjectsPerDay"
                min={1}
                max={6}
                defaultValue={policy.maxSubjectsPerDay}
              />
            </div>
            <div className="field">
              <label>حداقل طول بلوک (دقیقه)</label>
              <input
                type="number"
                name="minBlockMinutes"
                min={15}
                max={120}
                defaultValue={policy.minBlockMinutes}
              />
            </div>
            <div className="field">
              <label>حداکثر طول بلوک (دقیقه)</label>
              <input
                type="number"
                name="maxBlockMinutes"
                min={30}
                max={180}
                defaultValue={policy.maxBlockMinutes}
              />
            </div>
            <div className="field">
              <label>پر کردن کل زمان آزاد</label>
              <select name="fillCapacity" defaultValue={policy.fillCapacity ? "1" : "0"}>
                <option value="1">بله، زمان آزاد با تمرین/مطالعه پر شود</option>
                <option value="0">نه، فقط به اندازه نیاز اهداف</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>یادداشت سیاست (اختیاری)</label>
              <textarea name="notes" rows={3} defaultValue={policy.notes} />
            </div>
          </div>
        </div>

        <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <SubmitButton className="btn-secondary" formAction={savePlanningSetupAction}>
            ذخیره تنظیمات
          </SubmitButton>
          <label className="row" style={{ gap: "0.35rem", fontSize: "0.82rem" }}>
            <input type="checkbox" name="overwrite" value="1" />
            جایگزینی هفته‌های تأییدشده
          </label>
          <SubmitButton
            formAction={generateAutoPlanAction}
            pendingLabel="در حال ساخت برنامه…"
          >
            ذخیره و ساخت برنامه
          </SubmitButton>
          {aiAutoPlanningConfigured() ? (
            <SubmitButton
              className="btn-secondary"
              name="useAi"
              value="1"
              formAction={generateAutoPlanAction}
              pendingLabel="AI در حال برنامه‌ریزی…"
            >
              ذخیره و ساخت با AI
            </SubmitButton>
          ) : null}
        </div>
      </form>

      {upcomingPlans.length > 0 ? (
        <div className="card">
          <div className="section-head">
            <div>
              <h2>برنامه‌های ساخته‌شده این بازه</h2>
              <small>وضعیت پیش‌نویس‌ها را در پنل برنامه‌ریزی هر هفته ببینید و تأیید کنید.</small>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>هفته</th>
                  <th>وضعیت</th>
                  <th>هشدارها</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {upcomingPlans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{formatJalaliNumeric(plan.weekStart)}</td>
                    <td>{plan.status === "draft" ? "پیش‌نویس" : plan.status === "approved" ? "تأییدشده" : plan.status}</td>
                    <td>
                      {plan.warningsJson?.length
                        ? plan.warningsJson.slice(0, 2).join(" · ")
                        : "—"}
                    </td>
                    <td>
                      <Link
                        className="btn btn-secondary btn-sm"
                        href={`/counselor/students/${id}/panel?week=${plan.weekStart}`}
                      >
                        مشاهده
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <h2>سیاست پیش‌فرض</h2>
          <small>این متن فقط برای راهنمایی است و در برنامه‌ریزی اعمال می‌شود.</small>
        </div>
        <p className="muted" style={{ margin: 0, lineHeight: 1.9 }}>
          {DEFAULT_PLANNING_POLICY.notes}
        </p>
        <small className="muted" style={{ display: "block", marginTop: "0.5rem" }}>
          مبنای پیش‌فرض: {DEFAULT_PLANNING_POLICY.minutesPerPercentPoint} دقیقه برای هر ۱٪
          پیشرفت، {DEFAULT_PLANNING_POLICY.testRatioPct}٪ زمان برای تست،{" "}
          {DEFAULT_PLANNING_POLICY.reviewRatioPct}٪ برای مرور و بقیه برای مطالعه.
        </small>
      </div>
    </div>
  );
}
