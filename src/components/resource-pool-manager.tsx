"use client";

import { useMemo, useState } from "react";
import {
  addPoolResourceAction,
  deletePoolResourceAction,
} from "@/app/actions/resource-pool";
import { SubmitButton } from "@/components/submit-button";
import type { PoolBookView } from "@/lib/resource-pool";
import { FIELD_LABELS, FIELDS, subjectSupportsTests } from "@/lib/subjects";

type SubjectOption = { id: string; title: string; kind: string };

function isGeneralBook(book: PoolBookView): boolean {
  return book.fields.length === 0 || book.fields.length >= FIELDS.length;
}

type SubjectGroup = { title: string; books: PoolBookView[] };

function groupBySubject(books: PoolBookView[]): SubjectGroup[] {
  const map = new Map<string, PoolBookView[]>();
  for (const book of books) {
    const list = map.get(book.subjectTitle) ?? [];
    list.push(book);
    map.set(book.subjectTitle, list);
  }
  return [...map.entries()].map(([title, list]) => ({ title, books: list }));
}

export function ResourcePoolManager({
  books,
  subjects,
}: {
  books: PoolBookView[];
  subjects: SubjectOption[];
}) {
  const general = subjects.filter((subject) => subject.kind !== "specialized");
  const specialized = subjects.filter((subject) => subject.kind !== "general");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const supportsTests = subjectSupportsTests(selectedSubject?.kind ?? "general");
  const [activeField, setActiveField] = useState<string>("all");

  const sections = useMemo(() => {
    const result: {
      key: string;
      title: string;
      count: number;
      subjects: SubjectGroup[];
    }[] = [];
    if (activeField === "all" || activeField === "general") {
      const general = books.filter(isGeneralBook);
      if (general.length > 0) {
        result.push({
          key: "general",
          title: "عمومی — همه رشته‌ها",
          count: general.length,
          subjects: groupBySubject(general),
        });
      }
    }
    for (const field of FIELDS) {
      if (activeField !== "all" && activeField !== field) continue;
      const list = books.filter(
        (book) => !isGeneralBook(book) && book.fields.includes(field),
      );
      if (list.length > 0) {
        result.push({
          key: field,
          title: FIELD_LABELS[field] ?? field,
          count: list.length,
          subjects: groupBySubject(list),
        });
      }
    }
    return result;
  }, [activeField, books]);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="card">
        <div className="section-head">
          <div>
            <h2>استخر منابع</h2>
            <small>
              منابع کمک‌آموزشی با فصل‌بندی و تعداد تست/تمرین. دانش‌آموزان و مشاور فقط از این استخر
              منبع انتخاب می‌کنند و هر رشته فقط منابع خودش را می‌بیند.
            </small>
          </div>
          <span className="badge">{books.length.toLocaleString("fa-IR")} منبع</span>
        </div>

        {books.length === 0 ? (
          <div className="empty">هنوز منبعی در استخر ثبت نشده است.</div>
        ) : (
          <div className="stack" style={{ gap: "0.9rem" }}>
            <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`btn btn-sm ${activeField === "all" ? "" : "btn-secondary"}`}
                onClick={() => setActiveField("all")}
              >
                همه رشته‌ها
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeField === "general" ? "" : "btn-secondary"}`}
                onClick={() => setActiveField("general")}
              >
                عمومی
              </button>
              {FIELDS.map((field) => (
                <button
                  key={field}
                  type="button"
                  className={`btn btn-sm ${activeField === field ? "" : "btn-secondary"}`}
                  onClick={() => setActiveField(field)}
                >
                  {FIELD_LABELS[field] ?? field}
                </button>
              ))}
            </div>

            {sections.length === 0 ? (
              <div className="empty">برای این رشته منبعی ثبت نشده است.</div>
            ) : null}

            {sections.map((section) => (
              <div key={section.key} className="stack" style={{ gap: "0.55rem" }}>
                <div className="row between">
                  <h3 style={{ margin: 0 }}>{section.title}</h3>
                  <span className="badge">
                    {section.count.toLocaleString("fa-IR")} منبع
                  </span>
                </div>
                {section.subjects.map((subject) => (
                  <div key={subject.title} className="stack" style={{ gap: "0.4rem" }}>
                    <div className="row between">
                      <h4 style={{ margin: 0, fontSize: "0.95rem" }}>{subject.title}</h4>
                      <span className="muted" style={{ fontSize: "0.76rem" }}>
                        {subject.books.length.toLocaleString("fa-IR")} کتاب
                      </span>
                    </div>
                    {subject.books.map((book) => (
                      <details
                        key={`${section.key}-${book.id}`}
                        className="card"
                        style={{ boxShadow: "none" }}
                      >
                        <summary style={{ cursor: "pointer" }}>
                          <strong>{book.title}</strong>
                          <span className="muted" style={{ fontSize: "0.78rem" }}>
                            {" "}
                            · {book.publisher || "بدون ناشر"} · {book.grade || "بدون پایه"} ·{" "}
                            {book.totalUnits.toLocaleString("fa-IR")}{" "}
                            {book.unitType === "exercise" ? "تمرین" : "تست"} ·{" "}
                            {book.chapters.length} فصل
                            {isGeneralBook(book)
                              ? ""
                              : ` · ${book.fields.map((field) => FIELD_LABELS[field] ?? field).join("، ")}`}
                          </span>
                        </summary>
                        <div className="table-wrap" style={{ marginTop: "0.5rem" }}>
                          <table>
                            <thead>
                              <tr>
                                <th>فصل</th>
                                {book.unitType === "exercise" ? null : <th>تست</th>}
                                <th>تمرین</th>
                              </tr>
                            </thead>
                            <tbody>
                              {book.chapters.map((chapter) => (
                                <tr key={chapter.id}>
                                  <td>{chapter.title}</td>
                                  {book.unitType === "exercise" ? null : (
                                    <td>{chapter.testCount.toLocaleString("fa-IR")}</td>
                                  )}
                                  <td>{chapter.exerciseCount.toLocaleString("fa-IR")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <form action={deletePoolResourceAction} style={{ marginTop: "0.4rem" }}>
                          <input type="hidden" name="poolId" value={book.id} />
                          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                            حذف از استخر
                          </SubmitButton>
                        </form>
                      </details>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>افزودن منبع به استخر</h2>
          <small>این بخش فقط در اختیار مشاور است.</small>
        </div>
        <form action={addPoolResourceAction} className="form-grid">
          <div className="field">
            <label>درس</label>
            <select
              name="subjectId"
              required
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              <optgroup label="عمومی">
                {general.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="تخصصی">
                {specialized.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label>عنوان منبع</label>
            <input name="title" placeholder="مثلاً زیست‌شناسی دوازدهم — خیلی سبز" required />
          </div>
          <div className="field">
            <label>ناشر</label>
            <input name="publisher" placeholder="خیلی سبز، گاج، مبتکران…" />
          </div>
          <div className="field">
            <label>پایه</label>
            <select name="grade" defaultValue="دوازدهم">
              <option value="دهم">دهم</option>
              <option value="یازدهم">یازدهم</option>
              <option value="دوازدهم">دوازدهم</option>
              <option value="فارغ‌التحصیل">فارغ‌التحصیل</option>
            </select>
          </div>
          <div className="field">
            <label>
              تعداد کل {supportsTests ? "تست" : "تمرین"} (اگر فصل نمی‌دهید)
            </label>
            <input name="totalUnits" type="number" min={0} defaultValue={0} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>
              {supportsTests
                ? "فصل‌بندی — هر خط: عنوان | تست | تمرین"
                : "فصل‌بندی — هر خط: عنوان | تمرین"}
            </label>
            <textarea
              name="chapters"
              rows={6}
              placeholder={
                supportsTests
                  ? "فصل ۱ | 120 | 30\nفصل ۲ | 110 | 25\nفصل ۳ | 90 | 20"
                  : "فصل ۱ | 120\nفصل ۲ | 110\nفصل ۳ | 90"
              }
            />
          </div>
          <div className="field">
            <label>اولویت</label>
            <select name="priority" defaultValue="3">
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <SubmitButton className="btn-secondary">افزودن به استخر</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
