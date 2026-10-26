import Link from "next/link";
import { notFound } from "next/navigation";
import { generateReportNarrativeAction } from "@/app/actions/reports";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { getPeriodReport, getStudentDetail } from "@/lib/counselor";
import { getReport } from "@/lib/reports";
import { aiConfigured } from "@/lib/ai";
import {
  addDays,
  currentJalaliMonthRange,
  formatJalali,
  formatJalaliNumeric,
  jalaliMonthRange,
  shiftJalaliMonth,
  startOfWeekSaturday,
  todayISO,
} from "@/lib/dates";

export default async function StudentPeriodReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; period?: string; month?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { success, period: periodParam, month: monthParam } = await searchParams;

  const detail = await getStudentDetail(counselor.workspaceId, id);
  if (!detail) notFound();

  const period = periodParam === "4w" ? "4w" : "month";
  const monthRange =
    period === "month" ? jalaliMonthRange(monthParam ?? "") ?? currentJalaliMonthRange() : null;

  let from: string;
  let to: string;

  if (monthRange) {
    from = monthRange.from;
    to = monthRange.to;
  } else {
    const currentWeek = startOfWeekSaturday(todayISO());
    from = addDays(currentWeek, -21);
    to = addDays(currentWeek, 6);
  }

  const report = await getPeriodReport(counselor.workspaceId, id, from, to);
  const savedReport = await getReport(id, period, from);

  const monthHref = (key: string) =>
    `/counselor/students/${id}/report?period=month&month=${key}`;
  const exportHref = monthRange
    ? `/counselor/export?type=month&studentId=${id}&month=${monthRange.key}`
    : `/counselor/export?type=period&studentId=${id}`;

  const adherence =
    report.plannedMinutes === 0 ? 0 : Math.round((report.doneMinutes / report.plannedMinutes) * 100);
  const remainingUnits = detail.resources.reduce(
    (sum, resource) => sum + Math.max(0, resource.totalUnits - resource.completedUnits),
    0,
  );

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <Link href={`/counselor/students/${id}`} className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به دانش‌آموز
          </Link>
          <h1>
            {monthRange ? `گزارش ماه ${monthRange.label}` : "گزارش ۴ هفته"} — {detail.student.name}
          </h1>
          <small>
            {formatJalaliNumeric(from)} تا {formatJalaliNumeric(to)}
          </small>
        </div>
        <div className="row">
          <Link
            className={`btn btn-sm ${period === "month" ? "" : "btn-secondary"}`}
            href={monthRange ? monthHref(monthRange.key) : `/counselor/students/${id}/report`}
          >
            گزارش ماه
          </Link>
          <Link
            className={`btn btn-sm ${period === "4w" ? "" : "btn-secondary"}`}
            href={`/counselor/students/${id}/report?period=4w`}
          >
            ۴ هفته اخیر
          </Link>
          <a className="btn btn-secondary btn-sm" href={exportHref}>
            خروجی اکسل
          </a>
        </div>
      </div>

      {monthRange ? (
        <div className="row">
          <Link className="btn btn-secondary btn-sm" href={monthHref(shiftJalaliMonth(monthRange.key, -1))}>
            ماه قبل
          </Link>
          <Link className="btn btn-secondary btn-sm" href={monthHref(shiftJalaliMonth(monthRange.key, 1))}>
            ماه بعد
          </Link>
        </div>
      ) : null}

      {success === "narrative" ? (
        <div className="alert alert-success">روایت تحلیلی گزارش تولید و ذخیره شد.</div>
      ) : null}

      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-value">{adherence}٪</div>
          <div className="stat-label">پایبندی دوره (دقیقه)</div>
          <div className="progress" style={{ marginTop: "0.5rem" }}>
            <span style={{ width: `${Math.min(100, adherence)}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {report.correctStarts} / {report.eligibleDays}
          </div>
          <div className="stat-label">
            {report.correctStarts} بار شروع درست از {report.eligibleDays} روز
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">{report.activeDays}</div>
          <div className="stat-label">
            روز فعال از {report.eligibleDays} روز دارای برنامه
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>هفته به هفته</h2>
          <small>
            {report.doneTasks} از {report.totalTasks} تسک — {report.doneMinutes} دقیقه
          </small>
        </div>
        {report.byWeek.length === 0 ? (
          <div className="empty">در این دوره برنامه‌ای ثبت نشده است.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>هفته</th>
                  <th>تسک</th>
                  <th>انجام‌شده</th>
                  <th>دقیقه</th>
                  <th>پیشرفت</th>
                </tr>
              </thead>
              <tbody>
                {report.byWeek.map((week) => (
                  <tr key={week.weekStart}>
                    <td>{formatJalali(week.weekStart)}</td>
                    <td>{week.total}</td>
                    <td>{week.done}</td>
                    <td>{week.minutes}</td>
                    <td style={{ minWidth: "140px" }}>
                      <div className="progress">
                        <span
                          style={{
                            width: `${week.total === 0 ? 0 : Math.round((week.done / week.total) * 100)}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>وضعیت منابع</h2>
          <small>{remainingUnits.toLocaleString("fa-IR")} واحد باقی‌مانده</small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>درس</th>
                <th>منبع</th>
                <th>پیشرفت</th>
                <th>باقی‌مانده</th>
                <th>اولویت</th>
              </tr>
            </thead>
            <tbody>
              {detail.resources.map((resource) => {
                const remaining = Math.max(0, resource.totalUnits - resource.completedUnits);
                const pct =
                  resource.totalUnits === 0
                    ? 0
                    : Math.round((resource.completedUnits / resource.totalUnits) * 100);
                return (
                  <tr key={resource.id}>
                    <td>{resource.subjectTitle}</td>
                    <td>{resource.title}</td>
                    <td>{pct}٪</td>
                    <td>{remaining.toLocaleString("fa-IR")}</td>
                    <td>{resource.priority}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>روایت تحلیلی</h2>
          <div className="row">
            <small>{aiConfigured() ? "AI اختیاری فعال است" : "حالت قطعی (AI خاموش)"}</small>
            <form action={generateReportNarrativeAction}>
              <input type="hidden" name="studentId" value={id} />
              <input type="hidden" name="period" value={period} />
              {monthRange ? <input type="hidden" name="month" value={monthRange.key} /> : null}
              <SubmitButton className="btn-secondary btn-sm" pendingLabel="در حال تولید…">
                {savedReport ? "بازتولید روایت" : "تولید روایت"}
              </SubmitButton>
            </form>
          </div>
        </div>
        {savedReport?.narrative ? (
          <p style={{ margin: 0, lineHeight: 2 }}>{savedReport.narrative}</p>
        ) : (
          <div className="empty">
            هنوز روایتی تولید نشده است. با دکمه بالا، متن قالبی (یا AI در صورت فعال بودن) ساخته
            می‌شود.
          </div>
        )}
      </div>

      <div className="card">
        <h2>پیشنهاد برای هفته بعد</h2>
        <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
          <li>
            {adherence < 60
              ? "بار برنامه را کمی کم کنید یا بلوک‌ها را کوتاه‌تر کنید؛ پایبندی زیر ۶۰٪ است."
              : "پایبندی قابل قبول است؛ توزیع دروس را حفظ کنید."}
          </li>
          <li>
            {report.correctStarts < Math.ceil(report.eligibleDays / 2)
              ? "روی «شروع درست» کار کنید: اولین بلوک را ثابت و کوتاه نگه دارید."
              : "شروع درست پایدار است؛ همان ساختار صبح/عصر را ادامه دهید."}
          </li>
          <li>
            {remainingUnits > 0
              ? `برای پوشش منابع باقی‌مانده، ظرفیت هفته را با ${Math.min(20, Math.round((remainingUnits / 100) * 5))}٪ جبران افزایش دهید.`
              : "منابع تکمیل شده‌اند؛ تمرکز را به مرور و آزمون منتقل کنید."}
          </li>
        </ul>
      </div>
    </div>
  );
}
