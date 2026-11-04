import Link from "next/link";
import { PerformanceRangeReport } from "@/components/performance-range-report";
import { ReportRangeForm } from "@/components/report-range-form";
import { requireStudent } from "@/lib/auth";
import {
  formatJalaliNumeric,
  isISODate,
  startOfWeekSaturday,
  todayISO,
} from "@/lib/dates";
import { getPerformanceRangeData } from "@/lib/performance";
import { getReport } from "@/lib/reports";

export default async function StudentReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const { student } = await requireStudent();
  const { from: fromParam, to: toParam, success, error } = await searchParams;

  const today = todayISO();
  const defaultFrom = startOfWeekSaturday(today);
  const from =
    fromParam && isISODate(fromParam) ? fromParam : defaultFrom;
  const to = toParam && isISODate(toParam) ? toParam : today;
  const validRange = from <= to;

  const rangeFrom = validRange ? from : defaultFrom;
  const rangeTo = validRange ? to : today;

  const [range, savedReport] = await Promise.all([
    getPerformanceRangeData(student.id, rangeFrom, rangeTo),
    getReport(student.id, "performance", rangeFrom),
  ]);

  const savedNarrative =
    savedReport && savedReport.periodEnd === rangeTo ? savedReport.narrative : "";

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>گزارش من</h1>
          <small>
            {formatJalaliNumeric(rangeFrom)} تا {formatJalaliNumeric(rangeTo)}
          </small>
        </div>
        <Link className="btn btn-secondary btn-sm" href="/student/performance">
          دفترچه عملکرد
        </Link>
      </div>

      {success === "narrative" ? (
        <div className="alert alert-success">گزارش تحلیلی این بازه ساخته و ذخیره شد.</div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {!validRange ? (
        <div className="alert alert-error">تاریخ پایان باید بعد از تاریخ شروع باشد.</div>
      ) : null}

      <ReportRangeForm from={rangeFrom} to={rangeTo} />

      <PerformanceRangeReport
        studentId={student.id}
        from={rangeFrom}
        to={rangeTo}
        analysis={range.analysis}
        narrative={savedNarrative}
        narrativeAt={savedNarrative ? savedReport?.createdAt ?? null : null}
      />
    </div>
  );
}
