"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
} from "@/lib/exam";

type FilterSubject = {
  id: string;
  title: string;
  kind: string;
};

type FilterBook = {
  key: string;
  subjectId: string;
  subjectTitle: string;
  grade: string;
  label: string;
  chapters: string[];
  topics: string[];
};

type Group = "" | "general" | "specialized";

type Selection = {
  subjects: string[];
  books: string[];
  topics: string[];
};

export function QuestionBankFilters({
  base,
  bank,
  subjects,
  books,
  years,
  initial,
  hasFilter,
}: {
  base: string;
  bank?: string;
  subjects: FilterSubject[];
  books: FilterBook[];
  years: string[];
  initial: {
    group: Group;
    subjects: string[];
    books: string[];
    topics: string[];
    q: string;
    difficulty: string;
    sourceType: string;
    year: string;
  };
  hasFilter: boolean;
}) {
  const [group, setGroup] = useState<Group>(initial.group);
  const [selection, setSelection] = useState<Selection>({
    subjects: initial.subjects,
    books: initial.books,
    topics: initial.topics,
  });
  const [chapterSearch, setChapterSearch] = useState("");

  const bookByKey = useMemo(
    () => new Map(books.map((book) => [book.key, book])),
    [books],
  );

  const subjectInGroup = (subject: FilterSubject, nextGroup: Group) => {
    if (!nextGroup) return true;
    if (nextGroup === "general") return subject.kind !== "specialized";
    return subject.kind !== "general";
  };

  const prune = (next: Selection, nextGroup: Group): Selection => {
    const allowedSubjects = new Set(
      subjects
        .filter((subject) => subjectInGroup(subject, nextGroup))
        .map((subject) => subject.id),
    );
    const selectedSubjects = next.subjects.filter((id) => allowedSubjects.has(id));
    const selectedBooks = next.books.filter((key) => {
      const book = bookByKey.get(key);
      return Boolean(book && selectedSubjects.includes(book.subjectId));
    });
    const allowedTopics = new Set(
      selectedBooks.flatMap((key) => bookByKey.get(key)?.topics ?? []),
    );
    return {
      subjects: selectedSubjects,
      books: selectedBooks,
      topics: next.topics.filter((topic) => allowedTopics.has(topic)),
    };
  };

  const changeGroup = (nextGroup: Group) => {
    setGroup(nextGroup);
    setSelection((current) => prune(current, nextGroup));
  };

  const toggleSubject = (subjectId: string) => {
    setSelection((current) => {
      const subjectsNext = current.subjects.includes(subjectId)
        ? current.subjects.filter((id) => id !== subjectId)
        : [...current.subjects, subjectId];
      return prune({ ...current, subjects: subjectsNext }, group);
    });
  };

  const toggleBook = (key: string) => {
    setSelection((current) => {
      const booksNext = current.books.includes(key)
        ? current.books.filter((item) => item !== key)
        : [...current.books, key];
      return prune({ ...current, books: booksNext }, group);
    });
  };

  const toggleTopic = (topic: string) => {
    setSelection((current) => ({
      ...current,
      topics: current.topics.includes(topic)
        ? current.topics.filter((item) => item !== topic)
        : [...current.topics, topic],
    }));
  };

  const visibleSubjects = useMemo(
    () => subjects.filter((subject) => subjectInGroup(subject, group)),
    [subjects, group],
  );

  const selectedSubjectRows = useMemo(
    () => visibleSubjects.filter((subject) => selection.subjects.includes(subject.id)),
    [visibleSubjects, selection.subjects],
  );

  const selectedBookRows = useMemo(
    () => selection.books.map((key) => bookByKey.get(key)).filter(Boolean) as FilterBook[],
    [selection.books, bookByKey],
  );

  const availableChapters = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const book of selectedBookRows) {
      for (const topic of book.topics) {
        if (seen.has(topic)) continue;
        seen.add(topic);
        result.push(topic);
      }
    }
    const search = chapterSearch.trim();
    return search
      ? result.filter((chapter) => chapter.includes(search))
      : result;
  }, [selectedBookRows, chapterSearch]);

  const selectedCount =
    selection.subjects.length + selection.books.length + selection.topics.length;

  return (
    <form
      method="get"
      action={base}
      className="stack"
      style={{ gap: "0.9rem" }}
    >
      {bank ? <input type="hidden" name="bank" value={bank} /> : null}

      <div className="form-grid">
        <div className="field">
          <label>جستجو</label>
          <input name="q" defaultValue={initial.q} placeholder="متن، مبحث، منبع یا تگ" />
        </div>
        <div className="field">
          <label>نوع درس</label>
          <select
            name="group"
            value={group}
            onChange={(event) => changeGroup(event.target.value as Group)}
          >
            <option value="">همه درس‌ها</option>
            <option value="general">عمومی</option>
            <option value="specialized">اختصاصی</option>
          </select>
        </div>
        <div className="field">
          <label>سال</label>
          <select name="year" defaultValue={initial.year}>
            <option value="">همه</option>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>سختی</label>
          <select name="difficulty" defaultValue={initial.difficulty}>
            <option value="">همه</option>
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {DIFFICULTY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>منبع</label>
          <select name="sourceType" defaultValue={initial.sourceType}>
            <option value="">همه</option>
            {SOURCE_TYPES.map((value) => (
              <option key={value} value={value}>
                {SOURCE_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <SubmitButton className="btn-secondary">اعمال فیلتر</SubmitButton>
        </div>
      </div>

      <div className="card" style={{ boxShadow: "none", padding: "0.8rem" }}>
        <div className="section-head" style={{ marginBottom: "0.5rem" }}>
          <strong>درس‌ها</strong>
          <small>هر تعداد که بخواهید انتخاب کنید؛ خالی بگذارید تا همه بیاید.</small>
        </div>
        {visibleSubjects.length === 0 ? (
          <div className="muted">درسی در این گروه نیست.</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "0.35rem 0.8rem",
            }}
          >
            {visibleSubjects.map((subject) => (
              <label key={subject.id} className="row" style={{ margin: 0, gap: "0.35rem" }}>
                <input
                  type="checkbox"
                  name="subjects"
                  value={subject.id}
                  checked={selection.subjects.includes(subject.id)}
                  onChange={() => toggleSubject(subject.id)}
                />
                <span>{subject.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ boxShadow: "none", padding: "0.8rem" }}>
        <div className="section-head" style={{ marginBottom: "0.5rem" }}>
          <strong>پایه / کتاب</strong>
          <small>بعد از انتخاب درس، کتاب‌های همان درس را انتخاب کنید.</small>
        </div>
        {selectedSubjectRows.length === 0 ? (
          <div className="muted">اول یک درس انتخاب کنید.</div>
        ) : (
          <div className="stack" style={{ gap: "0.6rem" }}>
            {selectedSubjectRows.map((subject) => {
              const subjectBooks = books.filter((book) => book.subjectId === subject.id);
              if (subjectBooks.length === 0) {
                return (
                  <div key={subject.id} className="muted">
                    برای {subject.title} کتابی در منابع ثبت نشده است.
                  </div>
                );
              }
              return (
                <div key={subject.id}>
                  <strong style={{ fontSize: "0.85rem" }}>{subject.title}</strong>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                      gap: "0.35rem 0.8rem",
                      marginTop: "0.25rem",
                    }}
                  >
                    {subjectBooks.map((book) => (
                      <label
                        key={book.key}
                        className="row"
                        style={{ margin: 0, gap: "0.35rem" }}
                      >
                        <input
                          type="checkbox"
                          name="books"
                          value={book.key}
                          checked={selection.books.includes(book.key)}
                          onChange={() => toggleBook(book.key)}
                        />
                        <span>{book.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ boxShadow: "none", padding: "0.8rem" }}>
        <div className="section-head" style={{ marginBottom: "0.5rem" }}>
          <strong>مبحث</strong>
          <small>مباحث ثبت‌شده برای کتاب‌های انتخاب‌شده نمایش داده می‌شوند.</small>
        </div>
        {selectedBookRows.length === 0 ? (
          <div className="muted">اول یک پایه/کتاب انتخاب کنید.</div>
        ) : (
          <div className="stack" style={{ gap: "0.45rem" }}>
            <input
              value={chapterSearch}
              onChange={(event) => setChapterSearch(event.target.value)}
              placeholder="جستجوی مبحث…"
            />
            <div
              style={{
                maxHeight: "220px",
                overflowY: "auto",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: "0.3rem 0.8rem",
                paddingInlineEnd: "0.3rem",
              }}
            >
              {availableChapters.length === 0 ? (
                <div className="muted">مبحثی مطابق جستجو پیدا نشد.</div>
              ) : (
                availableChapters.map((chapter) => (
                  <label
                    key={chapter}
                    className="row"
                    style={{ margin: 0, gap: "0.35rem", alignItems: "flex-start" }}
                  >
                    <input
                      type="checkbox"
                      name="topics"
                      value={chapter}
                      checked={selection.topics.includes(chapter)}
                      onChange={() => toggleTopic(chapter)}
                    />
                    <span style={{ fontSize: "0.82rem" }}>{chapter}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="row between">
        <small className="muted">
          {selectedCount > 0
            ? `${selectedCount.toLocaleString("fa-IR")} مورد انتخاب شده است.`
            : "هیچ فیلتری انتخاب نشده؛ همه سوال‌ها نمایش داده می‌شوند."}
        </small>
        {hasFilter ? (
          <Link className="btn btn-ghost btn-sm" href={base}>
            پاک‌کردن فیلتر
          </Link>
        ) : null}
      </div>
    </form>
  );
}