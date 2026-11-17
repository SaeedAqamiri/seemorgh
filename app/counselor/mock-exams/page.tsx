import Link from "next/link";
import { requireCounselor } from "@/lib/auth";
import { formatJalaliNumeric } from "@/lib/dates";
import { listMockExamPrograms } from "@/lib/mock-exams";

export default async function CounselorMockExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string }>;
}) {
  const counselor = await requireCounselor();
  const { field } = await searchParams;
  const programs = await listMockExamPrograms(counselor.workspaceId, {
    field: field && ["تجربی", "ریاضی", "انسانی"].includes(field) ? field : undefined,
    includePast: true,
  });
  const fields = ["تجربی", "ریاضی", "انسانی"];
  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href="/counselor" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به دانش‌آموزان
          </Link>
          <h1>تقویم آزمون‌های آزمایشی</h1>
          <small>
            آزمون‌های قلم‌چی، گاج، سنجش و خیلی سبز برای پایه دوازدهم و هر سه رشته؛ بودجه‌بندی هر
            آزمون در ستون آخر خلاصه شده است.
          </small>
        </div>
        <div className="row">
          {fields.map((item) => (
            <Link
              key={item}
              className={`btn btn-sm ${field === item ? "" : "btn-secondary"}`}
              href={`/counselor/mock-exams?field=${encodeURIComponent(item)}`}
            >
              {item}
            </Link>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>موسسه</th>
                <th>رشته</th>
                <th>عنوان</th>
                <th>نوع</th>
                <th>بودجه‌بندی</th>
                <th>منبع</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((program) => (
                <tr key={program.id}>
                  <td>{formatJalaliNumeric(program.examDate)}</td>
                  <td>{program.provider}</td>
                  <td>{program.field}</td>
                  <td>{program.title}</td>
                  <td>{program.examType === "comprehensive" ? "جامع" : "مرحله‌ای"}</td>
                  <td>
                    {(program.budgetJson ?? [])
                      .map((item) => `${item.subjectTitle}: ${item.chapters.join("، ")}`)
                      .join(" · ")}
                  </td>
                  <td>
                    {program.sourceUrl ? (
                      <a href={program.sourceUrl} target="_blank" rel="noreferrer" className="muted">
                        {program.source || "منبع"}
                      </a>
                    ) : (
                      program.source || "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
