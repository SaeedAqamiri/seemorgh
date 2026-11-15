"use client";

import { useId, useMemo, useState } from "react";
import type { QuestionTaxonomy } from "@/lib/question-taxonomy";

const GRADE_ORDER = ["دهم", "یازدهم", "دوازدهم", "فارغ‌التحصیل"];

export function QuestionTaxonomyFields({
  taxonomy,
  defaultSubjectId = "",
  defaultGrade = "",
  defaultTopic = "",
  subjectName = "subjectId",
  gradeName = "grade",
  topicName = "topic",
  subjectRequired = true,
  topicRequired = false,
}: {
  taxonomy: QuestionTaxonomy;
  defaultSubjectId?: string;
  defaultGrade?: string;
  defaultTopic?: string;
  subjectName?: string;
  gradeName?: string;
  topicName?: string;
  subjectRequired?: boolean;
  topicRequired?: boolean;
}) {
  const listId = useId();
  const booksForSubject = useMemo(
    () => taxonomy.books.filter((book) => book.subjectId === defaultSubjectId),
    [taxonomy.books, defaultSubjectId],
  );
  const initialGrade =
    defaultGrade ||
    [...booksForSubject].sort(
      (a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade),
    )[0]?.grade ||
    "";

  const [subjectId, setSubjectId] = useState(defaultSubjectId);
  const [grade, setGrade] = useState(initialGrade);
  const [topic, setTopic] = useState(defaultTopic);

  const subjectBooks = useMemo(
    () => taxonomy.books.filter((book) => book.subjectId === subjectId),
    [taxonomy.books, subjectId],
  );

  const gradeOptions = useMemo(() => {
    const grades = new Set(subjectBooks.map((book) => book.grade));
    if (grade) grades.add(grade);
    return Array.from(grades).sort(
      (a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b),
    );
  }, [subjectBooks, grade]);

  const gradeLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const book of subjectBooks) {
      if (!labels.has(book.grade)) labels.set(book.grade, book.label);
    }
    return labels;
  }, [subjectBooks]);

  const chapters = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const book of subjectBooks) {
      if (grade && book.grade !== grade) continue;
      for (const chapter of book.chapters) {
        const key = chapter.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(chapter);
      }
    }
    return result;
  }, [subjectBooks, grade]);

  const changeSubject = (nextSubjectId: string) => {
    setSubjectId(nextSubjectId);
    const firstGrade = taxonomy.books
      .filter((book) => book.subjectId === nextSubjectId)
      .map((book) => book.grade)
      .sort((a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b))[0];
    setGrade(firstGrade ?? "");
    setTopic("");
  };

  return (
    <>
      <div className="field">
        <label>درس</label>
        <select
          name={subjectName}
          value={subjectId}
          onChange={(event) => changeSubject(event.target.value)}
          required={subjectRequired}
        >
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
        <label>پایه / کتاب</label>
        <select
          name={gradeName}
          value={grade}
          onChange={(event) => {
            setGrade(event.target.value);
            setTopic("");
          }}
        >
          <option value="">—</option>
          {gradeOptions.map((item) => (
            <option key={item} value={item}>
              {gradeLabels.get(item) ?? item}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>مبحث (فصل منبع)</label>
        <input
          name={topicName}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          list={listId}
          placeholder={subjectId ? "انتخاب یا نوشتن مبحث" : "اول درس را انتخاب کنید"}
          required={topicRequired}
        />
        <datalist id={listId}>
          {chapters.map((chapter) => (
            <option key={chapter} value={chapter} />
          ))}
        </datalist>
      </div>
    </>
  );
}