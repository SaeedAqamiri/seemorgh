"use client";

import { useState } from "react";
import {
  addPoolResourceAction,
  deletePoolResourceAction,
} from "@/app/actions/resource-pool";
import { SubmitButton } from "@/components/submit-button";
import type { PoolBookView } from "@/lib/resource-pool";
import { subjectSupportsTests } from "@/lib/subjects";

type SubjectOption = { id: string; title: string; kind: string };

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

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="card">
        <div className="section-head">
          <div>
            <h2>استخر منابع</h2>
            <small>
              منابع کمک‌آموزشی با فصل‌بندی و تعداد تست/تمرین. دانش‌آموزان و مشاور فقط از این استخر
              منبع انتخاب می‌کنند.
            </small>
          </div>
          <span className="badge">{books.length.toLocaleString("fa-IR")} منبع</span>
        </div>

        {books.length === 0 ? (
          <div className="empty">هنوز منبعی در استخر ثبت نشده است.</div>
        ) : (
          <div className="stack" style={{ gap: "0.55rem" }}>
            {books.map((book) => (
              <details key={book.id} className="card" style={{ boxShadow: "none" }}>
                <summary style={{ cursor: "pointer" }}>
                  <strong>{book.subjectTitle}</strong> — {book.title}
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    {" "}
                    · {book.publisher || "بدون ناشر"} · {book.grade || "بدون پایه"} ·{" "}
                    {book.totalUnits.toLocaleString("fa-IR")}{" "}
                    {book.unitType === "exercise" ? "تمرین" : "تست"} ·{" "}
                    {book.chapters.length} فصل
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
