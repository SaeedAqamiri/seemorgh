import Link from "next/link";
import { notFound } from "next/navigation";
import { PerformanceRangeReport } from "@/components/performance-range-report";
import { ReportRangeForm } from "@/components/report-range-form";
import { requireCounselor } from "@/lib/auth";
import { getStudentDetail } from "@/lib/counselor";
import {
  formatJalaliNumeric,
  isISODate,
  startOfWeekSaturday,
  todayISO,
} from "@/lib/dates";
import { getPerformanceRangeData } from "@/lib/performance";
import { getReport } from "@/lib/reports";

export default async function StudentPeriodReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { from: fromParam, to: toParam, success, error } = await searchParams;

  const detail = await getStudentDetail(counselor.workspaceId, id);
  if (!detail) notFound();

  const today = todayISO();
  const defaultFrom = startOfWeekSaturday(today);
  const from = fromParam && isISODate(fromParam) ? fromParam : defaultFrom;
  const to = toParam && isISODate(toParam) ? toParam : today;
  const validRange = from <= to;

  const rangeFrom = validRange ? from : defaultFrom;
  const rangeTo = validRange ? to : today;

  const [range, savedReport] = await Promise.all([
    getPerformanceRangeData(id, rangeFrom, rangeTo),
    getReport(id, "performance", rangeFrom),
  ]);
  const savedNarrative =
    savedReport && savedReport.periodEnd === rangeTo ? savedReport.narrative : "";

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
          <h1>گزارش — {detail.student.name}</h1>
          <small>
            {formatJalaliNumeric(rangeFrom)} تا {formatJalaliNumeric(rangeTo)}
          </small>
        </div>
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
        studentId={id}
        from={rangeFrom}
        to={rangeTo}
        analysis={range.analysis}
        narrative={savedNarrative}
        narrativeAt={savedNarrative ? savedReport?.createdAt ?? null : null}
      />
    </div>
  );
}
