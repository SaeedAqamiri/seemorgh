import Link from "next/link";
import { notFound } from "next/navigation";
import {
  generateAiAutoPlanAction,
  generateAutoPlanAction,
  replanAutoPlanAction,
  savePlanningSetupAction,
} from "@/app/actions/auto-plan";
import {
  prepareAutoPlanAction,
  runCounselingAction,
} from "@/app/actions/counseling";
import { SubmitButton } from "@/components/submit-button";
import { MockExamPicker } from "@/components/mock-exam-picker";
import { SubjectGoalsEditor } from "@/components/subject-goals-editor";
import { PsychProfileCard } from "@/components/psych-profile-card";
import { CounselingReportCard } from "@/components/counseling-report-card";
import { aiAutoPlanningConfigured } from "@/lib/ai-auto-plan";
import { defaultCurrentFor, defaultTargetFor, getAutoPlanContext } from "@/lib/auto-plan-data";
import {
  DEFAULT_PLANNING_POLICY,
  levelFactor,
  type GoalMetric,
} from "@/lib/auto-plan";
import { requireCounselor } from "@/lib/auth";
import { getLatestCounselingReport } from "@/lib/counseling-report";
import { summarizeResourceProgress } from "@/lib/resource-progress";
import {
  addDays,
  formatJalali,
  formatJalaliNumeric,
  formatTehranDateTime,
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
    stage?: string;
    counseling?: string;
  }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { success, error, weeks, source, skipped, stage, counseling } = await searchParams;

  const context = await getAutoPlanContext(counselor.workspaceId, id);
  if (!context) notFound();
  const counselingReport = await getLatestCounselingReport(id);
  const reviewStage = stage === "review";

  const { detail, goals, policy, targetDate, currentPercentBySubject } = context;
  const selectedIds = new Set(context.mockExams.map((program) => program.id));
  const levelDefaults = levelFactor(context.level);
  const defaultTestsPerHour = Math.round(policy.testsPerHour * levelDefaults);
  const defaultExercisesPerHour = Math.round(policy.exercisesPerHour * levelDefaults);
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

  const subjectRows = detail.subjects
    .filter((subject) => subject.kind === "specialized")
    .map((subject) => {
      const existing = goalBySubject.get(subject.id);
      const metric: GoalMetric = existing?.metric ?? defaultMetric;
      const examPercent = currentPercentBySubject.get(subject.id) ?? null;
      const current =
        metric === "percent" && examPercent !== null
          ? examPercent
          : existing?.currentValue ?? defaultCurrentFor(context, subject.id, metric);
      const target = existing?.targetValue ?? defaultTargetFor(current, metric);
      return {
        id: subject.id,
        title: subject.title,
        enabled: Boolean(existing),
        metric,
        current,
        target,
        weight: existing?.weight ?? 3,
        examPercent,
        resourceRemaining:
          summary.bySubject.find((row) => row.subjectId === subject.id)?.remainingUnits ?? 0,
        testsPerHour:
          context.subjectSpeeds[subject.id]?.testsPerHour ?? defaultTestsPerHour,
        exercisesPerHour:
          context.subjectSpeeds[subject.id]?.exercisesPerHour ?? defaultExercisesPerHour,
      };
    });

  const mockExamOptions = context.allMockExams.map((program) => ({
    id: program.id,
    dateLabel: formatJalaliNumeric(program.examDate),
    provider: program.provider,
    title: program.title,
    budgetText: (program.budgetJson ?? [])
      .slice(0, 3)
      .map((item) => `${item.subjectTitle}: ${item.chapters.slice(0, 2).join("، ")}`)
      .join(" · "),
  }));

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
      {counseling === "reused" ? (
        <div className="alert alert-warn">
          برنامه‌ریزی خودکار از <strong>آخرین گزارش مشاوره موجود</strong> استفاده کرد و تحلیل
          جدیدی ساخته نشد (صرفه‌جویی در هزینه AI). اگر گزارش مناسب نیست یا قدیمی است، یک‌بار دکمه
          «مشاوره تحصیلی» را بزنید تا تحلیل تازه ساخته شود و بعد برنامه‌ریزی خودکار را انجام دهید.
        </div>
      ) : counseling ? (
        <div className="alert alert-success">
          گزارش مشاوره‌ای موجود نبود؛ یک‌بار تحلیل مشاوره جدید ساخته و ذخیره شد و نتیجه در همین
          صفحه قابل مشاهده است. از این پس برنامه‌ریزی خودکار همین گزارش را استفاده می‌کند.
        </div>
      ) : null}
      {reviewStage && counselingReport ? (
        <div className="alert alert-warn">
          <strong>برنامه‌ریزی خودکار — مرحله بازبینی:</strong> برنامه بر اساس آخرین گزارش مشاوره
          ({formatTehranDateTime(counselingReport.createdAt)}
          {counselingReport.source === "ai" ? " — تحلیل AI" : " — تحلیل پایه"}) تنظیم می‌شود.
          نتیجه تحلیل پایین نمایش داده شده است؛ تنظیمات زیر (اهداف دروس، آزمون‌ها و سیاست‌ها) را
          بازبینی کنید و در صورت نیاز اصلاح کنید، سپس دکمه «تأیید و انجام برنامه‌ریزی خودکار» را
          بزنید. اگر گزارش قدیمی است یا مورد پسندتان نیست، اول «مشاوره تحصیلی» را بزنید.
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="section-head">
          <div>
            <h2>مشاوره تحصیلی و برنامه‌ریزی خودکار</h2>
            <small>
              برنامه‌ریزی خودکار همیشه از آخرین گزارش مشاوره استفاده می‌کند؛ اگر گزارش موجود
              مناسب است، نیازی به تحلیل جدید نیست (تحلیل AI هزینه دارد).
            </small>
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: "0.8rem" }}>
          <div
            className="stack"
            style={{
              gap: "0.5rem",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "0.8rem",
              background: "#fff",
            }}
          >
            <strong style={{ fontSize: "0.92rem" }}>۱) مشاوره تحصیلی</strong>
            <small className="muted" style={{ lineHeight: 1.8 }}>
              هر بار کلیک، یک تحلیل <strong>جدید</strong> با AI می‌سازد و ذخیره می‌کند (نتایج
              آزمون‌های روان‌شناسی، آزمون‌های آزمایشی و پیشرفت منابع را تحلیل می‌کند — هزینه
              دارد). اگر گزارش موجود مناسب است، دوباره نگیرید.
            </small>
            <form action={runCounselingAction}>
              <input type="hidden" name="studentId" value={id} />
              <SubmitButton pendingLabel="در حال تحلیل مشاوره…">مشاوره تحصیلی</SubmitButton>
            </form>
          </div>
          <div
            className="stack"
            style={{
              gap: "0.5rem",
              border: "1px solid var(--brand)",
              borderRadius: "12px",
              padding: "0.8rem",
              background: "var(--brand-soft, #eef2ff)",
            }}
          >
            <strong style={{ fontSize: "0.92rem" }}>۲) برنامه‌ریزی خودکار</strong>
            <small className="muted" style={{ lineHeight: 1.8 }}>
              همیشه از <strong>آخرین گزارش مشاوره موجود</strong> استفاده می‌کند؛ اگر هنوز گزارشی
              وجود ندارد، یک‌بار تحلیل ساخته می‌شود. بعد از بازبینی نتیجه و اصلاح تنظیمات،
              برنامه‌ریزی انجام می‌شود. برای تحلیل تازه، اول دکمه «مشاوره تحصیلی» را بزنید.
            </small>
            <form action={prepareAutoPlanAction}>
              <input type="hidden" name="studentId" value={id} />
              <SubmitButton pendingLabel="در حال آماده‌سازی…">
                {reviewStage ? "رفتن به مرحله بازبینی گزارش" : "برنامه‌ریزی خودکار"}
              </SubmitButton>
            </form>
          </div>
        </div>
      </div>

      {counselingReport ? (
        <CounselingReportCard report={counselingReport} />
      ) : (
        <div className="alert alert-warn">
          هنوز گزارش مشاوره‌ای برای این دانش‌آموز ثبت نشده است؛ یکی از دو دکمه بالا را بزنید تا
          تحلیل انجام شود.
        </div>
      )}

      <PsychProfileCard profile={context.psychProfile} studentId={id} compact />

      <div className="card">
        <div className="section-head">
          <div>
            <h2>وضعیت فعلی دروس اختصاصی</h2>
            <small>
              وضعیت هر درس اختصاصی از جدیدترین کارنامه ثبت‌شده پیش‌پر می‌شود. اگر سابقه آزمون
              دارید آن را با همین اعداد هماهنگ نگه دارید؛ اگر ندارید، در بخش اهداف دستی وارد کنید.
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
              <label>تاریخ رسیدن به هدف (از آزمون هدف پر می‌شود)</label>
              <input
                type="date"
                name="targetDate"
                defaultValue={effectiveTargetDate}
                min={todayISO()}
                required
              />
            </div>
            <div className="field">
              <label>شروع برنامه‌ریزی / بازبرنامه‌ریزی</label>
              <input type="date" name="startDate" defaultValue={todayISO()} min={todayISO()} />
            </div>
            <div className="field">
              <label>سطح فعلی دانش‌آموز</label>
              <select name="studentLevel" defaultValue={context.level}>
                <option value="weak">ضعیف (۷۰٪ سرعت پایه)</option>
                <option value="normal">نرمال (۳۰ تمرین و ۴۰ تست در ساعت)</option>
                <option value="strong">قوی (۱۲۰٪ سرعت پایه)</option>
              </select>
            </div>
            <div className="field">
              <label>دقیقه تحلیل هر آزمون</label>
              <input
                type="number"
                name="analysisMinutesPerExam"
                min={0}
                max={720}
                step={15}
                defaultValue={context.analysisMinutesPerExam}
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

          <SubjectGoalsEditor rows={subjectRows} />
          <small className="muted" style={{ display: "block", marginTop: "0.5rem" }}>
            فقط دروس اختصاصی در این بخش آمده‌اند. دروس عمومی در آزمون‌های آزمایشی و کنکور نیستند
            و برای امتحان نهایی در برنامه حفظ می‌شوند. اگر نمره از ۲۰ انتخاب شود، مقدار مطلوب هم
            از ۲۰ است و برنامه به سمت مطالعه و تسلط مفهومی وزن بیشتری می‌دهد.
          </small>
        </div>

        <div className="card">
          <div className="section-head">
            <div>
              <h2>آزمون‌های آزمایشی</h2>
              <small>
                آزمون‌هایی را که دانش‌آموز شرکت می‌کند انتخاب کنید؛ هدف، آخرین آزمون انتخاب‌شده
                است و بقیه آزمون‌ها و زمان تحلیل‌شان در برنامه رزرو می‌شوند.
              </small>
            </div>
            <Link className="btn btn-secondary btn-sm" href="/counselor/mock-exams">
              تقویم آزمون‌ها
            </Link>
          </div>
          <MockExamPicker
            exams={mockExamOptions}
            selectedIds={[...selectedIds]}
            goalExamId={context.goalExamId ?? null}
          />
          <div className="form-grid" style={{ marginTop: "0.8rem" }}>
            <div className="field">
              <label>شروع بازبرنامه‌ریزی (اختیاری)</label>
              <input
                type="date"
                name="replanFromDate"
                defaultValue={context.replanFromDate ?? ""}
              />
            </div>
          </div>
          <small className="muted" style={{ display: "block", marginTop: "0.5rem" }}>
            اگر آزمونی انتخاب نشود، برنامه بر اساس اهداف دستی و تاریخ هدف ساخته می‌شود.
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
              <label>دقیقه به ازای هر تست (پایه)</label>
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
              <label>تست در ساعت (پایه)</label>
              <input
                type="number"
                name="testsPerHour"
                min={5}
                max={120}
                defaultValue={policy.testsPerHour}
              />
            </div>
            <div className="field">
              <label>تمرین در ساعت (پایه)</label>
              <input
                type="number"
                name="exercisesPerHour"
                min={5}
                max={120}
                defaultValue={policy.exercisesPerHour}
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
            formAction={replanAutoPlanAction}
            pendingLabel="در حال بازبرنامه‌ریزی…"
          >
            بازبرنامه‌ریزی از تاریخ شروع
          </SubmitButton>
          <SubmitButton
            formAction={generateAutoPlanAction}
            pendingLabel="در حال ساخت برنامه…"
            className={reviewStage ? "" : "btn-secondary"}
          >
            {reviewStage ? "تأیید و انجام برنامه‌ریزی خودکار" : "ذخیره و ساخت برنامه"}
          </SubmitButton>
          {aiAutoPlanningConfigured() ? (
            <SubmitButton
              className="btn-secondary"
              formAction={generateAiAutoPlanAction}
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
