import Link from "next/link";
import {
  archiveQuestionAction,
  createBankAction,
  createQuestionAction,
  deleteBankAction,
  restoreQuestionAction,
  updateQuestionAction,
} from "@/app/actions/questions";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { listBanks, listQuestions } from "@/lib/questions";
import { getDb } from "@/db/client";
import { subjects } from "@/db/schema";
import { eq } from "drizzle-orm";

const SUCCESS: Record<string, string> = {
  bank: "بانک سوال ساخته شد.",
  "bank-deleted": "بانک سوال حذف شد.",
  question: "سوال اضافه شد.",
  "question-updated": "سوال ویرایش شد.",
  "question-archived": "سوال بایگانی شد.",
  "question-restored": "سوال فعال شد.",
};

const DIFFICULTY: Record<string, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "سخت",
};

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ bank?: string; success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { bank, success, error } = await searchParams;

  const db = await getDb();
  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, counselor.workspaceId));
  const banks = await listBanks(counselor.workspaceId);
  const selectedBank = bank && banks.some((item) => item.id === bank) ? bank : undefined;
  const questionRows = await listQuestions(counselor.workspaceId, {
    bankId: selectedBank,
    includeArchived: true,
  });
  const activeBanks = banks;
  const selectedBankInfo = activeBanks.find((item) => item.id === selectedBank);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>بانک سوال</h1>
          <small>سوالات اختصاصی دفتر شما؛ در آزمون‌ها فقط از همین بانک انتخاب می‌شود.</small>
        </div>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>بانک‌ها</h2>
            <small>{banks.length} بانک</small>
          </div>
          {banks.length === 0 ? (
            <div className="empty">هنوز بانکی نساخته‌اید.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>بانک</th>
                    <th>تعداد</th>
                    <th>MCQ / کوتاه</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {banks.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/counselor/questions?bank=${item.id}`}>
                          <strong>{item.title}</strong>
                        </Link>
                        {item.subjectTitle ? (
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            {item.subjectTitle}
                          </div>
                        ) : null}
                      </td>
                      <td>{item.total.toLocaleString("fa-IR")}</td>
                      <td>
                        {item.mcq.toLocaleString("fa-IR")} / {item.short.toLocaleString("fa-IR")}
                      </td>
                      <td>
                        <form action={deleteBankAction}>
                          <input type="hidden" name="bankId" value={item.id} />
                          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                            حذف
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <hr className="divider" />
          <form action={createBankAction} className="form-grid">
            <div className="field">
              <label>نام بانک</label>
              <input name="title" placeholder="مثلاً بانک زیست دوازدهم" required />
            </div>
            <div className="field">
              <label>درس (اختیاری)</label>
              <select name="subjectId">
                <option value="">—</option>
                {subjectRows.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <SubmitButton className="btn-secondary">ساخت بانک</SubmitButton>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="section-head">
            <h2>افزودن سوال</h2>
            <small>MCQ تک‌پاسخ یا کوتاه‌پاسخ</small>
          </div>
          {activeBanks.length === 0 ? (
            <div className="empty">اول یک بانک سوال بسازید.</div>
          ) : (
            <form action={createQuestionAction} className="stack">
              <div className="form-grid">
                <div className="field">
                  <label>بانک</label>
                  <select name="bankId" defaultValue={selectedBank ?? activeBanks[0].id} required>
                    {activeBanks.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>درس</label>
                  <select name="subjectId" defaultValue="" required>
                    <option value="">—</option>
                    {subjectRows.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>مبحث</label>
                  <input name="topic" placeholder="مثلاً ژنتیک" required />
                </div>
                <div className="field">
                  <label>نوع</label>
                  <select name="type" defaultValue="mcq">
                    <option value="mcq">چهارگزینه‌ای</option>
                    <option value="short">کوتاه‌پاسخ</option>
                  </select>
                </div>
                <div className="field">
                  <label>سختی</label>
                  <select name="difficulty" defaultValue="medium">
                    <option value="easy">آسان</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">سخت</option>
                  </select>
                </div>
                <div className="field">
                  <label>بارم</label>
                  <input name="score" type="number" min={1} max={100} defaultValue={1} />
                </div>
              </div>
              <div className="field">
                <label>متن سوال</label>
                <textarea name="body" required />
              </div>
              <div className="form-grid">
                {[1, 2, 3, 4].map((index) => (
                  <div className="field" key={index}>
                    <label>گزینه {index}</label>
                    <input name={`option${index}`} />
                  </div>
                ))}
                <div className="field">
                  <label>پاسخ صحیح (۱–۴ یا متن کوتاه)</label>
                  <input name="correct" required />
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>توضیح پاسخ</label>
                  <input name="explanation" />
                </div>
                <div className="field">
                  <label>تگ‌ها</label>
                  <input name="tags" placeholder="مثلاً فصل۵,کنکور" />
                </div>
                <div className="field">
                  <label>شناسه خارجی (اختیاری)</label>
                  <input name="externalKey" dir="ltr" />
                </div>
                <div className="field">
                  <SubmitButton>افزودن سوال</SubmitButton>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>
            سوالات {selectedBankInfo ? `— ${selectedBankInfo.title}` : ""}
          </h2>
          <div className="row">
            <small>{questionRows.length} سوال (شامل بایگانی)</small>
            {selectedBank ? (
              <Link className="btn btn-ghost btn-sm" href="/counselor/questions">
                همه بانک‌ها
              </Link>
            ) : null}
          </div>
        </div>

        {questionRows.length === 0 ? (
          <div className="empty">سوالی پیدا نشد.</div>
        ) : (
          <div className="stack">
            {questionRows.map((question) => (
              <div key={question.id} className="card" style={{ boxShadow: "none" }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="row">
                      <span className="badge">{question.bankTitle}</span>
                      <span className="badge">{question.subjectTitle ?? "بدون درس"}</span>
                      <span className="badge">{question.topic || "بدون مبحث"}</span>
                      <span className="badge">
                        {question.type === "mcq" ? "چهارگزینه‌ای" : "کوتاه‌پاسخ"}
                      </span>
                      <span className="badge">{DIFFICULTY[question.difficulty]}</span>
                      <span className="badge">بارم {question.score}</span>
                      {question.status === "archived" ? (
                        <span className="badge badge-warn">بایگانی</span>
                      ) : null}
                    </div>
                    <p style={{ margin: "0.5rem 0 0.3rem" }}>{question.body}</p>
                    {question.optionsJson?.length ? (
                      <div className="muted" style={{ fontSize: "0.82rem" }}>
                        {question.optionsJson.map((option, index) => (
                          <div key={index} style={{ fontWeight: Number(question.correctJson) === index + 1 ? 700 : 400 }}>
                            {index + 1}) {option}
                            {Number(question.correctJson) === index + 1 ? " ✓" : ""}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: "0.82rem" }}>
                        پاسخ: {String(question.correctJson ?? "")}
                      </div>
                    )}
                  </div>
                  <div className="stack" style={{ gap: "0.3rem" }}>
                    <form action={question.status === "active" ? archiveQuestionAction : restoreQuestionAction}>
                      <input type="hidden" name="questionId" value={question.id} />
                      <input type="hidden" name="bankId" value={question.bankId} />
                      <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                        {question.status === "active" ? "بایگانی" : "فعال‌سازی"}
                      </SubmitButton>
                    </form>
                  </div>
                </div>
                <details style={{ marginTop: "0.4rem" }}>
                  <summary className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                    ویرایش
                  </summary>
                  <form action={updateQuestionAction} className="stack" style={{ marginTop: "0.5rem" }}>
                    <input type="hidden" name="questionId" value={question.id} />
                    <input type="hidden" name="bankId" value={question.bankId} />
                    <div className="form-grid">
                      <div className="field">
                        <label>درس</label>
                        <select name="subjectId" defaultValue={question.subjectId ?? ""}>
                          <option value="">—</option>
                          {subjectRows.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                              {subject.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>مبحث</label>
                        <input name="topic" defaultValue={question.topic} />
                      </div>
                      <div className="field">
                        <label>نوع</label>
                        <select name="type" defaultValue={question.type}>
                          <option value="mcq">چهارگزینه‌ای</option>
                          <option value="short">کوتاه‌پاسخ</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>سختی</label>
                        <select name="difficulty" defaultValue={question.difficulty}>
                          <option value="easy">آسان</option>
                          <option value="medium">متوسط</option>
                          <option value="hard">سخت</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>بارم</label>
                        <input name="score" type="number" min={1} max={100} defaultValue={question.score} />
                      </div>
                    </div>
                    <div className="field">
                      <label>متن سوال</label>
                      <textarea name="body" defaultValue={question.body} required />
                    </div>
                    <div className="form-grid">
                      {[0, 1, 2, 3].map((index) => (
                        <div className="field" key={index}>
                          <label>گزینه {index + 1}</label>
                          <input name={`option${index + 1}`} defaultValue={question.optionsJson?.[index] ?? ""} />
                        </div>
                      ))}
                      <div className="field">
                        <label>پاسخ صحیح</label>
                        <input name="correct" defaultValue={String(question.correctJson ?? "")} required />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="field">
                        <label>توضیح</label>
                        <input name="explanation" defaultValue={question.explanation} />
                      </div>
                      <div className="field">
                        <label>تگ‌ها</label>
                        <input name="tags" defaultValue={question.tags} />
                      </div>
                      <div className="field">
                        <label>شناسه خارجی</label>
                        <input name="externalKey" defaultValue={question.externalKey ?? ""} dir="ltr" />
                      </div>
                      <div className="field">
                        <SubmitButton className="btn-secondary">ذخیره ویرایش</SubmitButton>
                      </div>
                    </div>
                  </form>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
