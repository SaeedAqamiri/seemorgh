import Link from "next/link";
import { formatJalaliNumeric } from "@/lib/dates";
import { faNumber } from "@/lib/panel";
import type { ExamResultView } from "@/lib/exam-analysis";

export function ExamResultsList({
  results,
  basePath,
  from,
  to,
  selectedExamId,
}: {
  results: ExamResultView[];
  basePath: string;
  from: string;
  to: string;
  selectedExamId?: string;
}) {
  if (results.length === 0) {
    return (
      <div className="empty">
        هنوز آزمونی ثبت نشده است. نتیجه آزمون بیرونی را دستی یا با OCR اضافه کنید.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>تاریخ</th>
            <th>آزمون</th>
            <th>منبع</th>
            <th>درصدها</th>
            <th>میانگین</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {results.map((exam) => {
            const selected = selectedExamId === `${exam.source}:${exam.id}`;
            const params = new URLSearchParams({
              exam: `${exam.source}:${exam.id}`,
              from,
              to,
            });
            return (
              <tr key={`${exam.source}-${exam.id}`}>
                <td style={{ whiteSpace: "nowrap" }}>{formatJalaliNumeric(exam.examDate)}</td>
                <td>
                  <strong>{exam.title}</strong>
                  <div className="muted" style={{ fontSize: "0.76rem" }}>
                    {exam.provider || "—"}
                  </div>
                </td>
                <td>
                  <span className={`badge ${exam.source === "internal" ? "badge-green" : ""}`}>
                    {exam.source === "internal" ? "درون سامانه" : "بیرونی"}
                  </span>
                </td>
                <td>
                  <div className="row" style={{ flexWrap: "wrap", gap: "0.25rem" }}>
                    {exam.subjects.map((subject) => (
                      <span key={`${exam.id}-${subject.subjectTitle}`} className="badge">
                        {subject.subjectTitle}: {faNumber(subject.percent)}٪
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <strong>{faNumber(exam.overallPercent)}٪</strong>
                </td>
                <td>
                  <Link
                    className={`btn btn-sm ${selected ? "" : "btn-secondary"}`}
                    href={`${basePath}?${params.toString()}`}
                  >
                    تحلیل
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
