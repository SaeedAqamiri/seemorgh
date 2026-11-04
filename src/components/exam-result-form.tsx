import { saveExternalExamAction } from "@/app/actions/exam-analysis";
import { SubmitButton } from "@/components/submit-button";
import { todayISO } from "@/lib/dates";
import type { ExamResultView } from "@/lib/exam-analysis";

const EXAM_TYPE_OPTIONS = [
  { value: "mock", label: "آزمون آزمایشی" },
  { value: "school", label: "آزمون مدرسه" },
  { value: "external", label: "آزمون بیرونی" },
  { value: "other", label: "سایر" },
];

export function ExamResultForm({
  studentId,
  subjects,
  exam,
}: {
  studentId: string;
  subjects: { id: string; title: string }[];
  exam?: ExamResultView | null;
}) {
  const subjectValue = (subjectId: string, title: string, key: "percent" | "correct" | "wrong" | "blank" | "total") => {
    const match = exam?.subjects.find(
      (item) => item.subjectId === subjectId || item.subjectTitle === title,
    );
    return match ? String(match[key]) : "";
  };

  return (
    <form action={saveExternalExamAction} className="stack">
      <input type="hidden" name="studentId" value={studentId} />
      {exam ? <input type="hidden" name="examId" value={exam.id} /> : null}

      <div className="form-grid">
        <div className="field">
          <label>نام آزمون</label>
          <input
            name="title"
            defaultValue={exam?.title ?? ""}
            placeholder="مثلاً آزمون آزمایشی قلم‌چی — آبان"
            required
          />
        </div>
        <div className="field">
          <label>تاریخ آزمون</label>
          <input
            name="examDate"
            type="date"
            defaultValue={exam?.examDate ?? todayISO()}
            required
          />
        </div>
        <div className="field">
          <label>نوع آزمون</label>
          <select name="examType" defaultValue={exam?.examType ?? "mock"}>
            {EXAM_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ارائه‌دهنده</label>
          <input
            name="provider"
            defaultValue={exam?.provider ?? ""}
            placeholder="مثلاً قلم‌چی، گاج، مدرسه"
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>یادداشت</label>
          <input name="note" defaultValue={exam?.note ?? ""} placeholder="اختیاری" />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>درس</th>
              <th>درصد</th>
              <th>صحیح</th>
              <th>غلط</th>
              <th>نزده</th>
              <th>کل</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.id}>
                <td>{subject.title}</td>
                <td>
                  <input
                    name={`percent_${subject.id}`}
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={subjectValue(subject.id, subject.title, "percent")}
                    style={{ width: "76px" }}
                    aria-label={`درصد ${subject.title}`}
                  />
                </td>
                <td>
                  <input
                    name={`correct_${subject.id}`}
                    type="number"
                    min={0}
                    defaultValue={subjectValue(subject.id, subject.title, "correct")}
                    style={{ width: "68px" }}
                    aria-label={`صحیح ${subject.title}`}
                  />
                </td>
                <td>
                  <input
                    name={`wrong_${subject.id}`}
                    type="number"
                    min={0}
                    defaultValue={subjectValue(subject.id, subject.title, "wrong")}
                    style={{ width: "68px" }}
                    aria-label={`غلط ${subject.title}`}
                  />
                </td>
                <td>
                  <input
                    name={`blank_${subject.id}`}
                    type="number"
                    min={0}
                    defaultValue={subjectValue(subject.id, subject.title, "blank")}
                    style={{ width: "68px" }}
                    aria-label={`نزده ${subject.title}`}
                  />
                </td>
                <td>
                  <input
                    name={`total_${subject.id}`}
                    type="number"
                    min={0}
                    defaultValue={subjectValue(subject.id, subject.title, "total")}
                    style={{ width: "68px" }}
                    aria-label={`کل ${subject.title}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
        فقط درس‌هایی را که درصدشان را می‌دانید پر کنید. درصدها بین ۰ تا ۱۰۰ وارد شوند.
      </p>

      <div className="row">
        <SubmitButton pendingLabel="در حال ذخیره…">
          {exam ? "ذخیره ویرایش آزمون" : "ثبت نتیجه آزمون"}
        </SubmitButton>
      </div>
    </form>
  );
}
