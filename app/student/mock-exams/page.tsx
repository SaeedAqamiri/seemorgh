import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { formatJalaliNumeric } from "@/lib/dates";
import { listMockExamPrograms, listStudentMockExams } from "@/lib/mock-exams";

export default async function StudentMockExamsPage() {
  const { user, student } = await requireStudent();
  const [programs, selected] = await Promise.all([
    listMockExamPrograms(user.workspaceId, { field: student.field }),
    listStudentMockExams(student.id),
  ]);
  const selectedIds = new Set(selected.map((row) => row.program.id));
  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href="/student" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت
          </Link>
          <h1>تقویم آزمون‌های آزمایشی</h1>
          <small>آزمون‌های پیش‌روی رشته {student.field}؛ انتخاب نهایی از صفحه برنامه‌ریزی خودکار انجام می‌شود.</small>
        </div>
        <Link className="btn btn-secondary btn-sm" href="/student/panel">
          دفترچه برنامه‌ریزی
        </Link>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>موسسه</th>
                <th>عنوان</th>
                <th>بودجه‌بندی</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((program) => (
                <tr key={program.id}>
                  <td>{selectedIds.has(program.id) ? "انتخاب‌شده" : "—"}</td>
                  <td>{formatJalaliNumeric(program.examDate)}</td>
                  <td>{program.provider}</td>
                  <td>{program.title}</td>
                  <td>{program.budgetJson?.map((item) => item.subjectTitle).join("، ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
