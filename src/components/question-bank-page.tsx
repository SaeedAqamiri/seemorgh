import Link from "next/link";
import {
  archiveQuestionAction,
  createBankAction,
  createQuestionAction,
  deleteBankAction,
  regenerateImportTokenAction,
  restoreQuestionAction,
  updateQuestionAction,
} from "@/app/actions/questions";
import { createPracticeExamAction } from "@/app/actions/exams";
import { addQuestionsToCollectionAction } from "@/app/actions/collections";
import { QuestionBankFilters } from "@/components/question-bank-filters";
import { QuestionTaxonomyFields } from "@/components/question-taxonomy-fields";
import { SubmitButton } from "@/components/submit-button";
import type { SessionUser } from "@/lib/auth";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  type Difficulty,
  type SourceType,
} from "@/lib/exam";
import { listCollections, type CollectionSummary } from "@/lib/collections";
import {
  countQuestions,
  getOrCreateImportToken,
  listBanks,
  listQuestions,
  listSourceYears,
  sourceLabel,
  type QuestionFilters,
} from "@/lib/questions";
import {
  listQuestionTaxonomy,
  parseQuestionBookKey,
} from "@/lib/question-taxonomy";

const SUCCESS: Record<string, string> = {
  bank: "بانک سوال ساخته شد.",
  "bank-deleted": "بانک سوال حذف شد.",
  question: "سوال اضافه شد.",
  "question-updated": "سوال ویرایش شد.",
  "question-archived": "سوال بایگانی شد.",
  "question-restored": "سوال فعال شد.",
  "questions-added": "سوال‌ها به مجموعه اضافه شدند.",
  token: "کد اتصال qprep بازسازی شد.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function many(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function optionList(values: readonly string[], labels: Record<string, string>) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value] ?? value}
    </option>
  ));
}

function DifficultyOptions() {
  return <>{optionList(DIFFICULTIES, DIFFICULTY_LABELS as Record<string, string>)}</>;
}

function SourceOptions() {
  return <>{optionList(SOURCE_TYPES, SOURCE_TYPE_LABELS as Record<string, string>)}</>;
}

export async function QuestionBankPage({
  user,
  searchParams,
}: {
  user: SessionUser;
  searchParams: SearchParams;
}) {
  const base = user.role === "counselor" ? "/counselor/questions" : "/student/questions";
  const examNewPath = user.role === "counselor" ? "/counselor/exams/new" : "";
  const bank = one(searchParams.bank);
  const success = one(searchParams.success);
  const error = one(searchParams.error);
  const q = one(searchParams.q);
  const difficulty = one(searchParams.difficulty);
  const sourceType = one(searchParams.sourceType);
  const year = one(searchParams.year);
  const groupRaw = one(searchParams.group);
  const group =
    groupRaw === "general" || groupRaw === "specialized" ? groupRaw : "";
  const subjectIds = Array.from(
    new Set([...many(searchParams.subjects), one(searchParams.subjectId)].filter(Boolean)),
  );
  const books = many(searchParams.books)
    .map((key) => parseQuestionBookKey(key))
    .filter((book): book is { subjectId: string; grade: string } => Boolean(book));
  const topics = many(searchParams.topics);
  const addToCollectionId = one(searchParams.addToCollection);

  const [taxonomy, banks, years, importToken, collections] = await Promise.all([
    listQuestionTaxonomy(user.workspaceId),
    listBanks(user.workspaceId, user.id),
    listSourceYears(user.workspaceId, user.id),
    getOrCreateImportToken(user.id),
    listCollections(user.workspaceId, user.id),
  ]);
  const addToCollection: CollectionSummary | null = addToCollectionId
    ? collections.find((collection) => collection.id === addToCollectionId) ?? null
    : null;

  const searchQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "success" || key === "error") continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry) searchQuery.append(key, entry);
    }
  }
  const bankUrl = `${base}${searchQuery.size > 0 ? `?${searchQuery.toString()}` : ""}`;

  const selectedBank = bank && banks.some((item) => item.id === bank) ? bank : undefined;
  const filters: QuestionFilters = {
    bankId: selectedBank,
    subjectIds,
    group,
    books,
    topics,
    difficulty: (DIFFICULTIES.includes(difficulty as Difficulty) ? difficulty : "") as
      | Difficulty
      | "",
    sourceType: (SOURCE_TYPES.includes(sourceType as SourceType) ? sourceType : "") as
      | SourceType
      | "",
    year: year || undefined,
    query: q?.trim() || undefined,
    includeArchived: true,
    limit: 100,
  };
  const [questionRows, matchedCount, activeCount] = await Promise.all([
    listQuestions(user.workspaceId, user.id, filters),
    countQuestions(user.workspaceId, user.id, filters),
    countQuestions(user.workspaceId, user.id, {}),
  ]);
  const selectedBankInfo = banks.find((item) => item.id === selectedBank);
  const examFormId = user.role === "counselor" ? "selectedExamForm" : "practiceExamForm";
  const filterStateKey = JSON.stringify({
    group,
    subjectIds,
    books,
    topics,
    q,
    difficulty,
    sourceType,
    year,
  });
  const hasFilter = Boolean(
    selectedBank ||
      subjectIds.length > 0 ||
      books.length > 0 ||
      topics.length > 0 ||
      group ||
      difficulty ||
      sourceType ||
      year ||
      q?.trim(),
  );

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>بانک سوال</h1>
          <small>
            بانک اختصاصی شما؛ سوال‌ها با درس، سال، منبع و سطح سختی دسته‌بندی می‌شوند و می‌توانید
            از بین آن‌ها آزمون بسازید.
          </small>
        </div>
        <div className="row">
          <span className="badge">{activeCount.toLocaleString("fa-IR")} سوال فعال</span>
          <span className="badge">{banks.length.toLocaleString("fa-IR")} بانک</span>
        </div>
      </div>

      {success && SUCCESS[success] ? (
        <div className="alert alert-success">{SUCCESS[success]}</div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {addToCollection ? (
        <div className="alert alert-success">
          حالت افزودن سوال به مجموعه «{addToCollection.title}» — سوال‌ها را تیک بزنید و دکمه
          «افزودن به مجموعه» را بزنید.{" "}
          <Link href={base} style={{ fontWeight: 700 }}>
            خروج از این حالت
          </Link>
        </div>
      ) : null}

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>بانک‌های من</h2>
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
                        <Link href={`${base}?bank=${item.id}`}>
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
                <optgroup label="عمومی">
                  {taxonomy.groups.general.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="تخصصی">
                  {taxonomy.groups.specialized.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.title}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="field">
              <SubmitButton className="btn-secondary">ساخت بانک</SubmitButton>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="section-head">
            <h2>اتصال qprep</h2>
            <small>برای افزودن گروهی سوال از فایل آزمون</small>
          </div>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            این کد را در بخش «افزودن به بانک سیمرغ» در qprep وارد کنید. فقط بانک‌های شما با این کد
            در دسترس است.
          </p>
          <div className="field">
            <label>کد اتصال</label>
            <input value={importToken} readOnly dir="ltr" />
          </div>
          <form action={regenerateImportTokenAction}>
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
              بازسازی کد
            </SubmitButton>
          </form>
          <hr className="divider" />
          <div className="muted" style={{ fontSize: "0.82rem" }}>
            آدرس qprep معمولاً{" "}
            <code dir="ltr">http://127.0.0.1:8010</code> است. آدرس سیمرغ و کد را در همان بخش وارد
            کنید.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>افزودن سوال</h2>
          <small>MCQ تک‌پاسخ یا کوتاه‌پاسخ</small>
        </div>
        {banks.length === 0 ? (
          <div className="empty">اول یک بانک سوال بسازید.</div>
        ) : (
          <form action={createQuestionAction} className="stack">
            <div className="form-grid">
              <div className="field">
                <label>بانک</label>
                <select name="bankId" defaultValue={selectedBank ?? banks[0].id} required>
                  {banks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>
              <QuestionTaxonomyFields
                taxonomy={taxonomy}
                subjectRequired
                topicRequired
              />
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
                  <DifficultyOptions />
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
                <label>پاسخ صحیح (شماره گزینه یا متن کوتاه)</label>
                <input name="correct" required />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>نوع منبع</label>
                <select name="sourceType" defaultValue="authored">
                  <SourceOptions />
                </select>
              </div>
              <div className="field">
                <label>عنوان منبع</label>
                <input name="sourceTitle" placeholder="مثلاً کنکور سراسری تجربی ۱۳۹۸" />
              </div>
              <div className="field">
                <label>سال</label>
                <input name="sourceYear" placeholder="۱۳۹۸" dir="ltr" />
              </div>
              <div className="field">
                <label>تاریخ / نوبت</label>
                <input name="sourceDate" placeholder="۱۴۰۴/۰۸/۱۶" dir="ltr" />
              </div>
              <div className="field">
                <label>شناسه منبع</label>
                <input name="sourceRef" placeholder="شماره سوال / صفحه" dir="ltr" />
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

      <div className="card">
        <div className="section-head">
          <h2>فیلتر و انتخاب</h2>
          <small>
            {matchedCount.toLocaleString("fa-IR")} سوال مطابق فیلتر
            {selectedBankInfo ? ` — ${selectedBankInfo.title}` : ""}
          </small>
        </div>
        <QuestionBankFilters
          key={filterStateKey}
          base={base}
          bank={selectedBank}
          subjects={taxonomy.subjects}
          books={taxonomy.books}
          years={years}
          initial={{
            group,
            subjects: subjectIds,
            books: many(searchParams.books),
            topics,
            q,
            difficulty,
            sourceType,
            year,
          }}
          hasFilter={hasFilter}
        />

        {user.role === "counselor" ? (
          <form id={examFormId} action={examNewPath} method="get" className="stack" style={{ marginTop: "0.8rem" }}>
            {addToCollection ? (
              <input type="hidden" name="collectionId" value={addToCollection.id} />
            ) : null}
            <input type="hidden" name="redirectTo" value={bankUrl} />
            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                سوال‌های موردنظر را تیک بزنید، سپس آزمون بسازید یا در یک مجموعه ذخیره کنید.
              </span>
              {addToCollection ? (
                <SubmitButton formAction={addQuestionsToCollectionAction} pendingLabel="…">
                  افزودن به «{addToCollection.title}»
                </SubmitButton>
              ) : null}
              <SubmitButton className="btn-secondary" pendingLabel="…">
                ساخت آزمون با انتخاب‌ها
              </SubmitButton>
              {!addToCollection ? (
                <>
                  {collections.length > 0 ? (
                    <select
                      name="collectionId"
                      defaultValue=""
                      style={{ minWidth: "11rem", height: "auto" }}
                    >
                      <option value="">— مجموعه مقصد —</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input name="newCollectionTitle" placeholder="یا نام مجموعه جدید…" style={{ minWidth: "11rem" }} />
                  <SubmitButton
                    className="btn-secondary"
                    formAction={addQuestionsToCollectionAction}
                    pendingLabel="…"
                  >
                    ذخیره در مجموعه
                  </SubmitButton>
                </>
              ) : null}
            </div>
          </form>
        ) : (
          <form id={examFormId} action={createPracticeExamAction} className="form-grid" style={{ marginTop: "0.8rem" }}>
            {addToCollection ? (
              <input type="hidden" name="collectionId" value={addToCollection.id} />
            ) : null}
            <input type="hidden" name="redirectTo" value={bankUrl} />
            <div className="field">
              <label>عنوان آزمون تمرینی</label>
              <input name="title" defaultValue="آزمون تمرینی" required />
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
              <SubmitButton>ساخت آزمون تمرینی از انتخاب‌ها</SubmitButton>
            </div>
            <div className="field">
              {addToCollection ? (
                <SubmitButton formAction={addQuestionsToCollectionAction} pendingLabel="…">
                  افزودن به «{addToCollection.title}»
                </SubmitButton>
              ) : (
                <SubmitButton
                  className="btn-secondary"
                  formAction={addQuestionsToCollectionAction}
                  pendingLabel="…"
                >
                  ذخیره در مجموعه
                </SubmitButton>
              )}
              {!addToCollection ? (
                <div className="stack" style={{ gap: "0.4rem", marginTop: "0.5rem" }}>
                  {collections.length > 0 ? (
                    <select name="collectionId" defaultValue="" style={{ minWidth: "11rem" }}>
                      <option value="">— مجموعه مقصد —</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input name="newCollectionTitle" placeholder="یا نام مجموعه جدید…" />
                </div>
              ) : null}
            </div>
          </form>
        )}

        {questionRows.length === 0 ? (
          <div className="empty">سوالی پیدا نشد.</div>
        ) : (
          <div className="stack" style={{ marginTop: "0.8rem" }}>
            {matchedCount > questionRows.length ? (
              <div className="muted" style={{ fontSize: "0.82rem" }}>
                نمایش {questionRows.length.toLocaleString("fa-IR")} سوال از{" "}
                {matchedCount.toLocaleString("fa-IR")} سوال؛ فیلترها را محدودتر کنید تا
                نتیجه دقیق‌تری ببینید.
              </div>
            ) : null}
            {questionRows.map((question) => (
              <div key={question.id} className="card" style={{ boxShadow: "none" }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div className="row">
                      <label className="row" style={{ margin: 0, gap: "0.35rem" }}>
                        <input
                          type="checkbox"
                          form={examFormId}
                          name="questionIds"
                          value={question.id}
                          disabled={question.status === "archived"}
                          style={{ width: "18px", minHeight: "auto" }}
                        />
                        <span className="muted" style={{ fontSize: "0.78rem" }}>
                          انتخاب
                        </span>
                      </label>
                      <span className="badge">{question.bankTitle}</span>
                      <span className="badge">{question.subjectTitle ?? "بدون درس"}</span>
                      {question.grade ? <span className="badge">{question.grade}</span> : null}
                      <span className="badge">{question.topic || "بدون مبحث"}</span>
                      <span className="badge">
                        {question.type === "mcq" ? "چهارگزینه‌ای" : "کوتاه‌پاسخ"}
                      </span>
                      <span className="badge">
                        {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
                      </span>
                      <span className="badge">{SOURCE_TYPE_LABELS[question.sourceType]}</span>
                      {question.sourceYear ? <span className="badge">{question.sourceYear}</span> : null}
                      <span className="badge">بارم {question.score}</span>
                      {question.status === "archived" ? (
                        <span className="badge badge-warn">بایگانی</span>
                      ) : null}
                    </div>
                    <p style={{ margin: "0.5rem 0 0.3rem" }}>{question.body}</p>
                    {question.optionsJson?.length ? (
                      <div className="muted" style={{ fontSize: "0.82rem" }}>
                        {question.optionsJson.map((option, index) => (
                          <div
                            key={index}
                            style={{ fontWeight: Number(question.correctJson) === index + 1 ? 700 : 400 }}
                          >
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
                      {question.tags ? ` — تگ: ${question.tags}` : ""}
                    </div>
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
                      <QuestionTaxonomyFields
                        taxonomy={taxonomy}
                        defaultSubjectId={question.subjectId ?? ""}
                        defaultGrade={question.grade}
                        defaultTopic={question.topic}
                        subjectRequired={false}
                      />
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
                          <DifficultyOptions />
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
                        <label>نوع منبع</label>
                        <select name="sourceType" defaultValue={question.sourceType}>
                          <SourceOptions />
                        </select>
                      </div>
                      <div className="field">
                        <label>عنوان منبع</label>
                        <input name="sourceTitle" defaultValue={question.sourceTitle} />
                      </div>
                      <div className="field">
                        <label>سال</label>
                        <input name="sourceYear" defaultValue={question.sourceYear} dir="ltr" />
                      </div>
                      <div className="field">
                        <label>تاریخ / نوبت</label>
                        <input name="sourceDate" defaultValue={question.sourceDate} dir="ltr" />
                      </div>
                      <div className="field">
                        <label>شناسه منبع</label>
                        <input name="sourceRef" defaultValue={question.sourceRef} dir="ltr" />
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
