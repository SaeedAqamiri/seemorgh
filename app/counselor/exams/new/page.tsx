import Link from "next/link";
import { eq } from "drizzle-orm";
import { createExamAction } from "@/app/actions/exams";
import { SubmitButton } from "@/components/submit-button";
import { getDb } from "@/db/client";
import { subjects } from "@/db/schema";
import { requireCounselor } from "@/lib/auth";
import { listStudents } from "@/lib/counselor";
import { tehranDateTimeInput } from "@/lib/dates";
import { getBankQuestionCount, loadSelectableQuestions } from "@/lib/exams-server";
import { DIFFICULTY_LABELS } from "@/lib/exam";
import { aiSelectionConfigured } from "@/lib/ai-exam";

export default async function NewExamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; questionIds?: string | string[] }>;
}) {
  const counselor = await requireCounselor();
  const { error, questionIds } = await searchParams;
  const selectedIds = [
    ...new Set(
      (Array.isArray(questionIds) ? questionIds : [questionIds ?? ""])
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const db = await getDb();
  const [subjectRows, students, questionCount, pool] = await Promise.all([
    db.select().from(subjects).where(eq(subjects.workspaceId, counselor.workspaceId)),
    listStudents(counselor.workspaceId, counselor.id),
    getBankQuestionCount(counselor.workspaceId, counselor.id),
    loadSelectableQuestions(counselor.workspaceId, counselor.id),
  ]);
  const selectedPool = new Map(pool.map((item) => [item.id, item]));
  const selectedQuestions = selectedIds
    .map((id) => selectedPool.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const start = new Date(Date.now() + 60 * 60_000);
  const end = new Date(Date.now() + 3 * 60 * 60_000);

  return (
    <div className="stack">
      <div>
        <Link href="/counselor/exams" className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به آزمون‌ها
        </Link>
        <h1>ساخت آزمون</h1>
        <small>
          {questionCount.toLocaleString("fa-IR")} سوال فعال در بانک شما موجود است.
        </small>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {questionCount === 0 ? (
        <div className="alert alert-warn">
          هنوز سوالی در بانک نیست. اول <Link href="/counselor/questions">بانک سوال</Link> را کامل کنید.
        </div>
      ) : null}

      {selectedQuestions.length > 0 ? (
        <div className="card">
          <div className="section-head">
            <h2>سوال‌های انتخاب‌شده</h2>
            <small>{selectedQuestions.length.toLocaleString("fa-IR")} سوال از بانک شما</small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>درس</th>
                  <th>مبحث</th>
                  <th>سختی</th>
                  <th>متن</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuestions.map((question, index) => (
                  <tr key={question.id}>
                    <td>{index + 1}</td>
                    <td>{question.subjectTitle || "—"}</td>
                    <td>{question.topic || "—"}</td>
                    <td>{DIFFICULTY_LABELS[question.difficulty]}</td>
                    <td>{question.body.length > 80 ? `${question.body.slice(0, 80)}…` : question.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: "0.82rem", marginTop: "0.5rem" }}>
            در این حالت گزینش بر اساس همان سوال‌های انتخاب‌شده انجام می‌شود و ردیف‌های blueprint لازم نیست.
          </div>
        </div>
      ) : null}

      <form id="createExamForm" action={createExamAction} className="stack">
        {selectedQuestions.map((question) => (
          <input key={question.id} type="hidden" name="questionIds" value={question.id} />
        ))}
        <div className="card stack">
          <h2>مشخصات آزمون</h2>
          <div className="form-grid">
            <div className="field">
              <label>عنوان</label>
              <input name="title" placeholder="مثلاً آزمون زیست — هفته چهارم" required />
            </div>
            <div className="field">
              <label>شروع (وقت تهران)</label>
              <input
                name="startAt"
                type="datetime-local"
                defaultValue={tehranDateTimeInput(start)}
                dir="ltr"
                required
              />
            </div>
            <div className="field">
              <label>پایان (وقت تهران)</label>
              <input
                name="endAt"
                type="datetime-local"
                defaultValue={tehranDateTimeInput(end)}
                dir="ltr"
                required
              />
            </div>
            <div className="field">
              <label>مدت (دقیقه)</label>
              <input name="durationMinutes" type="number" min={5} max={300} defaultValue={60} required />
            </div>
          </div>
          <div className="row">
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", margin: 0 }}>
              <input type="checkbox" name="shuffleQuestions" style={{ width: "18px", minHeight: "auto" }} />
              تصادفی‌سازی ترتیب سوال‌ها
            </label>
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", margin: 0 }}>
              <input type="checkbox" name="shuffleOptions" style={{ width: "18px", minHeight: "auto" }} />
              تصادفی‌سازی ترتیب گزینه‌ها
            </label>
            {aiSelectionConfigured() ? (
              <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", margin: 0 }}>
                <input type="checkbox" name="aiSelection" style={{ width: "18px", minHeight: "auto" }} />
                گزینش سوال با AI (اختیاری)
              </label>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h2>تخصیص دانش‌آموزان</h2>
            <small>{students.length} دانش‌آموز فعال</small>
          </div>
          {students.length === 0 ? (
            <div className="empty">اول دانش‌آموز اضافه کنید.</div>
          ) : (
            <div className="grid grid-3">
              {students.map((student) => (
                <label
                  key={student.id}
                  style={{
                    display: "flex",
                    gap: "0.45rem",
                    alignItems: "center",
                    fontWeight: 400,
                    margin: 0,
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "0.45rem 0.6rem",
                  }}
                >
                  <input
                    type="checkbox"
                    name="studentIds"
                    value={student.id}
                    style={{ width: "18px", minHeight: "auto" }}
                  />
                  <span>
                    {student.name}
                    <small style={{ display: "block" }}>{student.grade} / {student.field}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ display: selectedQuestions.length > 0 ? "none" : undefined }}>
          <div className="section-head">
            <h2>Blueprint سوالات</h2>
            <small>درس/مبحث/سختی و تعداد؛ ردیف‌های خالی نادیده گرفته می‌شوند.</small>
          </div>
          <div className="stack">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="form-grid" key={index}>
                <div className="field">
                  <label>درس</label>
                  <select name="blueprintSubject" defaultValue="">
                    <option value="">—</option>
                    {subjectRows.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>مبحث (اختیاری)</label>
                  <input name="blueprintTopic" placeholder="مثلاً ژنتیک" />
                </div>
                <div className="field">
                  <label>سختی</label>
                  <select name="blueprintDifficulty" defaultValue="">
                    <option value="">همه</option>
                    <option value="easy">آسان</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">سخت</option>
                    <option value="very_hard">خیلی سخت</option>
                  </select>
                </div>
                <div className="field">
                  <label>تعداد</label>
                  <input name="blueprintCount" type="number" min={0} max={100} defaultValue={0} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="row">
          <SubmitButton pendingLabel="در حال ساخت…">ساخت پیش‌نویس آزمون</SubmitButton>
          <Link href="/counselor/exams" className="btn btn-secondary">
            انصراف
          </Link>
        </div>
      </form>
    </div>
  );
}
