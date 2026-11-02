import Link from "next/link";
import { StartChart } from "@/components/start-chart";
import { requireCounselor } from "@/lib/auth";
import {
  addDays,
  formatJalaliNumeric,
  isISODate,
  startOfWeekSaturday,
  todayISO,
  weekDates,
} from "@/lib/dates";
import { faNumber } from "@/lib/panel";
import { getPerformanceAnalysis, listActiveStudents } from "@/lib/performance";

export default async function CounselorPerformanceOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const counselor = await requireCounselor();
  const { week } = await searchParams;

  const requestedWeek = week && isISODate(week) ? week : todayISO();
  const weekStart = startOfWeekSaturday(requestedWeek);
  const dates = weekDates(weekStart);
  const studentsList = await listActiveStudents(counselor.workspaceId);

  const analyses = await Promise.all(
    studentsList.map(async (student) => ({
      student,
      analysis: await getPerformanceAnalysis(student.id, weekStart),
    })),
  );

  const overviewHref = (value: string) => `/counselor/performance?week=${value}`;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>تحلیل عملکرد دانش‌آموزان</h1>
          <small>
            هفته {formatJalaliNumeric(dates[0])} تا {formatJalaliNumeric(dates[6])} — نرخ شروع طبق
            برنامه و حجم فعالیت هر دانش‌آموز
          </small>
        </div>
        <div className="row">
          <Link className="btn btn-secondary btn-sm" href={overviewHref(addDays(weekStart, -7))}>
            هفته قبل
          </Link>
          <Link className="btn btn-secondary btn-sm" href={overviewHref(startOfWeekSaturday(todayISO()))}>
            این هفته
          </Link>
          <Link className="btn btn-secondary btn-sm" href={overviewHref(addDays(weekStart, 7))}>
            هفته بعد
          </Link>
        </div>
      </div>

      {analyses.length === 0 ? (
        <div className="card empty">دانش‌آموز فعالی ثبت نشده است.</div>
      ) : (
        analyses.map(({ student, analysis }) => (
          <details key={student.id} className="card" open={analysis.hasAnyData}>
            <summary style={{ cursor: "pointer" }}>
              <span className="row between">
                <strong>{student.name}</strong>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  {analysis.hasAnyData
                    ? `${faNumber(analysis.onplanDays)} طبق برنامه · ${faNumber(analysis.offplanDays)} خارج · ${faNumber(analysis.totalMinutes)} دقیقه · ${faNumber(analysis.totalPractice)} تمرین`
                    : "بدون ثبت عملکرد"}
                </span>
              </span>
            </summary>
            <div className="stack" style={{ gap: "0.7rem", marginTop: "0.8rem" }}>
              {analysis.hasAnyData ? (
                <StartChart days={analysis.days} compact />
              ) : (
                <div className="empty">برای این هفته عملکردی ثبت نشده است.</div>
              )}
              <Link
                className="btn btn-secondary btn-sm"
                href={`/counselor/students/${student.id}/performance?week=${weekStart}`}
              >
                دفترچه عملکرد {student.name}
              </Link>
            </div>
          </details>
        ))
      )}
    </div>
  );
}
