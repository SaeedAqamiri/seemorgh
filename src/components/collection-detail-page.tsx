import Link from "next/link";
import { notFound } from "next/navigation";
import { createPracticeExamAction } from "@/app/actions/exams";
import {
  deleteCollectionAction,
  removeQuestionFromCollectionAction,
  updateCollectionAction,
} from "@/app/actions/collections";
import { SelectAllCheckbox } from "@/components/select-all-checkbox";
import { SubmitButton } from "@/components/submit-button";
import type { SessionUser } from "@/lib/auth";
import { getCollection, listCollectionQuestions } from "@/lib/collections";
import { DIFFICULTY_LABELS, SOURCE_TYPE_LABELS } from "@/lib/exam";
import { sourceLabel } from "@/lib/questions";

const SUCCESS: Record<string, string> = {
  updated: "مجموعه به‌روزرسانی شد.",
  "questions-added": "سوال‌ها به مجموعه اضافه شدند.",
  "question-removed": "سوال از مجموعه حذف شد.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function CollectionDetailPage({
  user,
  collectionId,
  searchParams,
}: {
  user: SessionUser;
  collectionId: string;
  searchParams: SearchParams;
}) {
  const base = user.role === "counselor" ? "/counselor/collections" : "/student/collections";
  const examNewPath = user.role === "counselor" ? "/counselor/exams/new" : "";
  const formId = "collectionSelectionForm";

  const success = one(searchParams.success);
  const error = one(searchParams.error);

  const collection = await getCollection(user.workspaceId, user.id, collectionId);
  if (!collection) notFound();

  const questions = await listCollectionQuestions(user.workspaceId, user.id, collection.id);
  const activeQuestions = questions.filter((question) => question.status === "active");
  const archivedCount = questions.length - activeQuestions.length;
  const totalScore = activeQuestions.reduce((sum, question) => sum + question.score, 0);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <Link href={base} className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به مجموعه‌ها
        </Link>
        <div className="row between" style={{ alignItems: "flex-start", marginTop: "0.4rem" }}>
          <div>
            <h1 style={{ marginBottom: "0.2rem" }}>{collection.title}</h1>
            {collection.description ? (
              <small className="muted">{collection.description}</small>
            ) : null}
          </div>
          <div className="row">
            <span className="badge">{activeQuestions.length.toLocaleString("fa-IR")} سوال فعال</span>
            {archivedCount > 0 ? (
              <span className="badge badge-warn">{archivedCount.toLocaleString("fa-IR")} بایگانی</span>
            ) : null}
            <span className="badge">جمع بارم {totalScore.toLocaleString("fa-IR")}</span>
            <Link
              href={`${base}/${collection.id}/print`}
              className="btn btn-secondary btn-sm"
            >
              خروجی PDF / چاپ
            </Link>
            <Link
              href={
                user.role === "counselor"
                  ? `/counselor/questions?addToCollection=${collection.id}`
                  : `/student/questions?addToCollection=${collection.id}`
              }
              className="btn btn-secondary btn-sm"
            >
              افزودن سوال از بانک
            </Link>
          </div>
        </div>
      </div>

      {success && SUCCESS[success] ? (
        <div className="alert alert-success">{SUCCESS[success]}</div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {archivedCount > 0 ? (
        <div className="alert alert-warn">
          سوال‌های بایگانی‌شده در ساخت آزمون و خروجی PDF استفاده نمی‌شوند؛ می‌توانید از مجموعه
          حذف‌شان کنید یا در بانک سوال دوباره فعال‌شان کنید.
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <h2>ساخت آزمون از این مجموعه</h2>
          <small>سوال‌های دلخواه را تیک بزنید یا «انتخاب همه» را بزنید.</small>
        </div>
        {user.role === "counselor" ? (
          <form id={formId} action={examNewPath} method="get" className="row">
            <SelectAllCheckbox formId={formId} />
            <SubmitButton pendingLabel="در حال انتقال…">ساخت آزمون با انتخاب‌ها</SubmitButton>
            {activeQuestions.length === 0 ? (
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                سوال فعالی در این مجموعه نیست.
              </span>
            ) : null}
          </form>
        ) : (
          <form id={formId} action={createPracticeExamAction} className="form-grid">
            <div className="field">
              <label>عنوان آزمون تمرینی</label>
              <input name="title" defaultValue={collection.title} required />
            </div>
            <div className="field">
              <label>مدت (دقیقه)</label>
              <input name="durationMinutes" type="number" min={5} max={300} defaultValue={30} required />
            </div>
            <label className="row" style={{ margin: 0 }}>
              <input type="checkbox" name="shuffleQuestions" /> تصادفی‌سازی سوال‌ها
            </label>
            <label className="row" style={{ margin: 0 }}>
              <input type="checkbox" name="shuffleOptions" /> تصادفی‌سازی گزینه‌ها
            </label>
            <div className="field">
              <SelectAllCheckbox formId={formId} />
            </div>
            <div className="field">
              <SubmitButton pendingLabel="در حال ساخت…">
                ساخت آزمون تمرینی از انتخاب‌ها
              </SubmitButton>
            </div>
          </form>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="card">
          <div className="empty">
            این مجموعه خالی است. با دکمه «افزودن سوال از بانک» سوال انتخاب کنید.
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: "0.6rem" }}>
          {questions.map((question, index) => (
            <div key={question.id} className="card" style={{ boxShadow: "none" }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div className="row">
                    <label className="row" style={{ margin: 0, gap: "0.35rem" }}>
                      <input
                        type="checkbox"
                        form={formId}
                        name="questionIds"
                        value={question.id}
                        disabled={question.status === "archived"}
                        style={{ width: "18px", minHeight: "auto" }}
                      />
                      <span className="muted" style={{ fontSize: "0.78rem" }}>
                        {index + 1}
                      </span>
                    </label>
                    <span className="badge">{question.subjectTitle ?? "بدون درس"}</span>
                    <span className="badge">{question.topic || "بدون مبحث"}</span>
                    <span className="badge">
                      {question.type === "mcq" ? "چهارگزینه‌ای" : "کوتاه‌پاسخ"}
                    </span>
                    <span className="badge">
                      {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
                    </span>
                    <span className="badge">بارم {question.score}</span>
                    {question.status === "archived" ? (
                      <span className="badge badge-warn">بایگانی</span>
                    ) : null}
                  </div>
                  <p style={{ margin: "0.5rem 0 0.3rem", whiteSpace: "pre-wrap" }}>
                    {question.body}
                  </p>
                  {question.optionsJson?.length ? (
                    <div className="muted" style={{ fontSize: "0.82rem" }}>
                      {question.optionsJson.map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          style={{
                            fontWeight:
                              Number(question.correctJson) === optionIndex + 1 ? 700 : 400,
                          }}
                        >
                          {optionIndex + 1}) {option}
                          {Number(question.correctJson) === optionIndex + 1 ? " ✓" : ""}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: "0.82rem" }}>
                      پاسخ: {String(question.correctJson ?? "")}
                    </div>
                  )}
                  {question.explanation ? (
                    <details style={{ marginTop: "0.35rem" }}>
                      <summary
                        className="btn btn-ghost btn-sm"
                        style={{ cursor: "pointer", display: "inline-block" }}
                      >
                        پاسخ تشریحی
                      </summary>
                      <div
                        className="muted"
                        style={{ fontSize: "0.82rem", marginTop: "0.3rem", whiteSpace: "pre-wrap" }}
                      >
                        {question.explanation}
                      </div>
                    </details>
                  ) : null}
                  <div className="muted" style={{ fontSize: "0.78rem", marginTop: "0.35rem" }}>
                    منبع: {sourceLabel(question)}
                    {question.sourceRef ? ` — ${question.sourceRef}` : ""}
                  </div>
                </div>
                <div className="stack" style={{ gap: "0.3rem" }}>
                  <form action={removeQuestionFromCollectionAction}>
                    <input type="hidden" name="collectionId" value={collection.id} />
                    <input type="hidden" name="questionId" value={question.id} />
                    <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                      حذف از مجموعه
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>ویرایش مجموعه</h2>
          </div>
          <form action={updateCollectionAction} className="form-grid">
            <input type="hidden" name="collectionId" value={collection.id} />
            <div className="field">
              <label>نام مجموعه</label>
              <input name="title" defaultValue={collection.title} required />
            </div>
            <div className="field">
              <label>توضیح</label>
              <input name="description" defaultValue={collection.description} />
            </div>
            <div className="field">
              <SubmitButton className="btn-secondary">ذخیره</SubmitButton>
            </div>
          </form>
        </div>
        <div className="card">
          <div className="section-head">
            <h2>حذف مجموعه</h2>
            <small>سوال‌ها در بانک باقی می‌مانند؛ فقط ارجاع‌ها پاک می‌شوند.</small>
          </div>
          <form action={deleteCollectionAction}>
            <input type="hidden" name="collectionId" value={collection.id} />
            <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
              حذف این مجموعه
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
