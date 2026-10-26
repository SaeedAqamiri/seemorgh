import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteExamAction,
  publishExamAction,
} from "@/app/actions/exams";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import {
  getExamResults,
  previewExamQuestions,
} from "@/lib/exams-server";

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "پیش‌نویس", className: "badge-warn" },
  scheduled: { label: "زمان‌بندی‌شده", className: "badge" },
  open: { label: "در حال اجرا", className: "badge-green" },
  closed: { label: "بسته", className: "badge" },
  graded: { label: "تصحیح‌شده", className: "badge-green" },
};

const DIFFICULTY: Record<string, string> = { easy: "آسان", medium: "متوسط", hard: "سخت" };

export default async function ExamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string; ai?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { success, error, ai } = await searchParams;

  const preview = await previewExamQuestions(counselor.workspaceId, id);
  if (!preview) notFound();

  const results = preview.exam.status === "draft" ? null : await getExamResults(counselor.workspaceId, id);
  const status = STATUS[preview.exam.status] ?? { label: preview.exam.status, className: "badge" };
  const now = Date.now();

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href="/counselor/exams" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به آزمون‌ها
          </Link>
          <h1>{preview.exam.title}</h1>
          <small>
            {formatTehranDateTime(preview.exam.startAt)} تا {formatTehranDateTime(preview.exam.endAt)} —{" "}
            {preview.exam.durationMinutes} دقیقه
          </small>
        </div>
        <div className="row">
          <span className={`badge ${status.className}`}>{status.label}</span>
          {now >= preview.exam.endAt.getTime() && preview.exam.status !== "draft" ? (
            <span className="badge badge-warn">مهلت تمام شده</span>
          ) : null}
          {preview.exam.status === "draft" ? (
            <>
              <form action={publishExamAction}>
                <input type="hidden" name="examId" value={id} />
                <SubmitButton pendingLabel="در حال انتشار…">انتشار آزمون</SubmitButton>
              </form>
              <form action={deleteExamAction}>
                <input type="hidden" name="examId" value={id} />
                <SubmitButton className="btn-danger" pendingLabel="…">
                  حذف پیش‌نویس
                </SubmitButton>
              </form>
            </>
          ) : null}
        </div>
      </div>

      {success === "published" ? (
        <div className="alert alert-success">
          آزمون منتشر شد؛ snapshot سوالات قفل شد و دیگر ویرایش بانک روی آن اثر ندارد.
          {ai === "ai" ? " گزینش سوال با AI انجام شد." : ""}
          {ai === "fallback" ? " گزینش AI نامعتبر بود؛ گزینش قطعی استفاده شد." : ""}
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {preview.exam.status === "draft" && preview.shortages.length > 0 ? (
        <div className="alert alert-error">
          {preview.shortages.map((message) => (
            <div key={message}>• {message}</div>
          ))}
        </div>
      ) : null}
      {preview.exam.status === "draft" && preview.warnings.length > 0 ? (
        <div className="alert alert-warn">
          {preview.warnings.map((message) => (
            <div key={message}>• {message}</div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-value">
            {results ? results.snapshot.items.length : preview.selected.length}
          </div>
          <div className="stat-label">سوال انتخاب‌شده</div>
        </div>
        <div className="stat">
          <div className="stat-value">{results?.snapshot.totalScore ?? preview.selected.reduce((sum, item) => sum + item.score, 0)}</div>
          <div className="stat-label">بارم کل</div>
        </div>
        <div className="stat">
          <div className="stat-value">{results?.attempts.length ?? 0}</div>
          <div className="stat-label">تلاش ثبت‌شده</div>
        </div>
      </div>

      {!results ? (
        <div className="card">
          <div className="section-head">
            <h2>پیش‌نمایش گزینش</h2>
            <small>در زمان انتشار همین گزینش به‌صورت snapshot ذخیره می‌شود.</small>
          </div>
          {preview.selected.length === 0 ? (
            <div className="empty">با این blueprint سوالی انتخاب نشد.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>درس</th>
                    <th>مبحث</th>
                    <th>سختی</th>
                    <th>نوع</th>
                    <th>بارم</th>
                    <th>متن</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.selected.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.subjectTitle}</td>
                      <td>{item.topic}</td>
                      <td>{DIFFICULTY[item.difficulty]}</td>
                      <td>{item.type === "mcq" ? "چهارگزینه‌ای" : "کوتاه‌پاسخ"}</td>
                      <td>{item.score}</td>
                      <td>
                        {item.body.length > 80 ? `${item.body.slice(0, 80)}…` : item.body}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <h2>دانش‌آموزان و تلاش‌ها</h2>
          <small>{results ? `${results.assignments.length} دانش‌آموز` : ""}</small>
        </div>
        {!results ? (
          <div className="empty">پس از انتشار، وضعیت شرکت دانش‌آموزان اینجا نمایش داده می‌شود.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>دانش‌آموز</th>
                  <th>وضعیت تخصیص</th>
                  <th>شروع</th>
                  <th>ارسال</th>
                  <th>نمره</th>
                  <th>وضعیت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.assignments.map((row) => (
                  <tr key={row.assignment.id}>
                    <td>{row.student.name}</td>
                    <td>{row.assignment.status === "assigned" ? "در انتظار" : row.assignment.status}</td>
                    <td>
                      {row.attempt ? formatTehranDateTime(row.attempt.startedAt) : "—"}
                    </td>
                    <td>
                      {row.attempt?.submittedAt ? formatTehranDateTime(row.attempt.submittedAt) : "—"}
                    </td>
                    <td>
                      {row.attempt ? `${row.attempt.score} از ${row.attempt.maxScore}` : "—"}
                    </td>
                    <td>
                      {row.attempt ? (
                        <span className={`badge ${row.attempt.status === "graded" ? "badge-green" : "badge-warn"}`}>
                          {row.attempt.status === "graded"
                            ? "تصحیح‌شده"
                            : row.attempt.status === "submitted"
                              ? "در انتظار تصحیح"
                              : "در حال آزمون"}
                        </span>
                      ) : (
                        <span className="badge">—</span>
                      )}
                    </td>
                    <td>
                      {row.attempt && row.attempt.status !== "in_progress" ? (
                        <Link
                          className="btn btn-secondary btn-sm"
                          href={`/counselor/exams/${id}/grade/${row.attempt.id}`}
                        >
                          کارنامه / تصحیح
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {results ? (
        <>
          <div className="card">
            <div className="section-head">
              <h2>تحلیل دقت مباحث</h2>
              <small>بر اساس پاسخ‌های ثبت‌شده</small>
            </div>
            {results.topics.length === 0 ? (
              <div className="empty">داده‌ای نیست.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>مبحث</th>
                      <th>پاسخ‌ها</th>
                      <th>صحیح</th>
                      <th>دقت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.topics.map((topic) => (
                      <tr key={topic.topic}>
                        <td>{topic.topic}</td>
                        <td>{topic.answered}</td>
                        <td>{topic.correct}</td>
                        <td>{topic.accuracy === null ? "—" : `${topic.accuracy}٪`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-head">
              <h2>دقت هر سوال (p-value)</h2>
              <small>درصد پاسخ صحیح بین شرکت‌کنندگان</small>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>مبحث</th>
                    <th>نوع</th>
                    <th>پاسخ‌داده</th>
                    <th>صحیح</th>
                    <th>p-value</th>
                  </tr>
                </thead>
                <tbody>
                  {results.questionsStats.map((stat, index) => (
                    <tr key={stat.item.id}>
                      <td>{index + 1}</td>
                      <td>{stat.item.topic || "—"}</td>
                      <td>{stat.item.type === "mcq" ? "چهارگزینه‌ای" : "کوتاه‌پاسخ"}</td>
                      <td>{stat.answered}</td>
                      <td>{stat.correct}</td>
                      <td>
                        {stat.pValue === null ? (
                          "—"
                        ) : (
                          <span className={`badge ${stat.pValue < 50 ? "badge-danger" : "badge-green"}`}>
                            {stat.pValue}٪
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
