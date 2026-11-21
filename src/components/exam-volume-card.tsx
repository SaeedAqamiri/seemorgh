"use client";

import { useMemo, useState } from "react";
import { formatJalaliNumeric } from "@/lib/dates";

export type VolumeChapter = {
  id: string;
  title: string;
  testCount: number;
  completedTests: number;
  exerciseCount: number;
  completedExercises: number;
  pages: number;
  completedPages: number;
};

export type VolumeResource = {
  id: string;
  title: string;
  subjectId: string;
  subjectTitle: string;
  unitType: "test" | "exercise" | "page" | "chapter";
  totalUnits: number;
  completedUnits: number;
  chapters: VolumeChapter[];
};

export type VolumeExam = {
  id: string;
  title: string;
  examDate: string;
  examType: string;
};

const UNIT_LABELS: Record<VolumeResource["unitType"], string> = {
  test: "تست",
  exercise: "تمرین",
  page: "صفحه",
  chapter: "فصل",
};

const EXAM_TYPE_LABELS: Record<string, string> = {
  konkur: "کنکور",
  final: "امتحان نهایی",
  mock: "آزمون آزمایشی",
};

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

function chapterProgress(resource: VolumeResource, chapter: VolumeChapter): { total: number; done: number } {
  if (resource.unitType === "test") {
    return { total: chapter.testCount, done: chapter.completedTests };
  }
  if (resource.unitType === "exercise") {
    return { total: chapter.exerciseCount, done: chapter.completedExercises };
  }
  if (resource.unitType === "page") {
    return { total: chapter.pages, done: chapter.completedPages };
  }
  return { total: 1, done: 0 };
}

function resourceProgress(
  resource: VolumeResource,
  chapterEnd: number | "all",
): { total: number; done: number; remainingChapters: number } {
  const chapters = resource.chapters;
  if (chapterEnd !== "all" && chapters.length > 0) {
    const limited = chapters.slice(0, Math.max(0, chapterEnd + 1));
    let total = 0;
    let done = 0;
    let remainingChapters = 0;
    for (const chapter of limited) {
      const progress = chapterProgress(resource, chapter);
      total += progress.total;
      done += Math.min(progress.done, progress.total);
      if (progress.total - progress.done > 0) remainingChapters += 1;
    }
    return { total, done, remainingChapters };
  }
  const total = resource.totalUnits;
  const done = Math.min(resource.completedUnits, total);
  const remainingChapters = chapters.length
    ? chapters.filter((chapter) => {
        const progress = chapterProgress(resource, chapter);
        return progress.total - progress.done > 0;
      }).length
    : total - done > 0
      ? 1
      : 0;
  return { total, done, remainingChapters };
}

function daysUntil(date: string, today: string): number {
  const from = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
}

export function ExamVolumeCard({
  today,
  resources,
  exams,
}: {
  today: string;
  resources: VolumeResource[];
  exams: VolumeExam[];
}) {
  const upcoming = useMemo(
    () =>
      exams
        .filter((exam) => exam.examDate >= today)
        .sort((a, b) => a.examDate.localeCompare(b.examDate)),
    [exams, today],
  );

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const resource of resources) map.set(resource.subjectId, resource.subjectTitle);
    return [...map.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title, "fa"));
  }, [resources]);

  const [examId, setExamId] = useState(upcoming[0]?.id ?? "none");
  const [subjectId, setSubjectId] = useState("all");
  const [resourceId, setResourceId] = useState("all");
  const [chapterEnd, setChapterEnd] = useState<string>("all");

  const exam = upcoming.find((item) => item.id === examId) ?? null;
  const days = exam ? daysUntil(exam.examDate, today) : null;
  const weeks = days !== null && days > 0 ? Math.max(1, Math.ceil(days / 7)) : null;

  const filtered = useMemo(
    () =>
      resources.filter(
        (resource) =>
          (subjectId === "all" || resource.subjectId === subjectId) &&
          (resourceId === "all" || resource.id === resourceId),
      ),
    [resources, subjectId, resourceId],
  );

  const resourcesForSelect = useMemo(
    () => (subjectId === "all" ? resources : resources.filter((r) => r.subjectId === subjectId)),
    [resources, subjectId],
  );

  const selectedResource = resources.find((resource) => resource.id === resourceId) ?? null;
  const limit: number | "all" =
    selectedResource && chapterEnd !== "all" ? Number(chapterEnd) : "all";

  const rows = useMemo(
    () =>
      filtered
        .map((resource) => {
          const rowLimit = resource.id === resourceId ? limit : "all";
          const progress = resourceProgress(resource, rowLimit);
          const remaining = Math.max(0, progress.total - progress.done);
          const perWeek = weeks && remaining > 0 ? Math.ceil(remaining / weeks) : 0;
          return { resource, ...progress, remaining, perWeek };
        })
        .filter((row) => row.total > 0),
    [filtered, resourceId, limit, weeks],
  );

  const totals = useMemo(() => {
    const byUnit = new Map<VolumeResource["unitType"], { remaining: number; perWeek: number }>();
    let chapters = 0;
    for (const row of rows) {
      const entry = byUnit.get(row.resource.unitType) ?? { remaining: 0, perWeek: 0 };
      entry.remaining += row.remaining;
      entry.perWeek += row.perWeek;
      byUnit.set(row.resource.unitType, entry);
      chapters += row.remainingChapters;
    }
    return { byUnit: [...byUnit.entries()], chapters };
  }, [rows]);

  return (
    <div className="volume-wrap">
      <div className="volume-controls">
        <div className="field">
          <label htmlFor="volume-exam">آزمون بعدی</label>
          <select
            id="volume-exam"
            value={examId}
            onChange={(event) => setExamId(event.target.value)}
          >
            <option value="none">بدون آزمون (کل منابع)</option>
            {upcoming.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} — {formatJalaliNumeric(item.examDate)} (
                {EXAM_TYPE_LABELS[item.examType] ?? item.examType})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="volume-subject">درس</label>
          <select
            id="volume-subject"
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
              setResourceId("all");
              setChapterEnd("all");
            }}
          >
            <option value="all">همه دروس</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.title}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="volume-resource">منبع / آزمون بعدی</label>
          <select
            id="volume-resource"
            value={resourceId}
            onChange={(event) => {
              setResourceId(event.target.value);
              setChapterEnd("all");
            }}
          >
            <option value="all">همه منابع</option>
            {resourcesForSelect.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.title}
              </option>
            ))}
          </select>
        </div>

        {selectedResource && selectedResource.chapters.length > 0 ? (
          <div className="field">
            <label htmlFor="volume-chapter">تا فصل (بودجهٔ آزمون)</label>
            <select
              id="volume-chapter"
              value={chapterEnd}
              onChange={(event) => setChapterEnd(event.target.value)}
            >
              <option value="all">همهٔ فصل‌ها</option>
              {selectedResource.chapters.map((chapter, index) => (
                <option key={chapter.id} value={index}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {exam ? (
        <div className="volume-deadline">
          <span>
            تا <b>{exam.title}</b> ({formatJalaliNumeric(exam.examDate)})
          </span>
          <span className="badge badge-green">
            {days !== null && days >= 0 ? `${fa(days)} روز` : "گذشته"} · {weeks ? `${fa(weeks)} هفته` : "—"}
          </span>
        </div>
      ) : (
        <div className="volume-deadline">
          <span>بدون آزمون انتخاب‌شده؛ فقط حجم باقی‌ماندهٔ منابع نمایش داده می‌شود.</span>
        </div>
      )}

      <div className="volume-summary">
        {totals.byUnit.length === 0 ? (
          <div className="empty">منبعی برای این فیلتر پیدا نشد.</div>
        ) : (
          totals.byUnit.map(([unit, entry]) => (
            <div key={unit} className="stat volume-stat">
              <div className="stat-value">
                {fa(entry.remaining)}
                <span className="volume-unit">{UNIT_LABELS[unit]}</span>
              </div>
              <div className="stat-label">حجم باقی‌مانده</div>
              {weeks ? (
                <div className="volume-weekly">
                  ≈ {fa(entry.perWeek)} {UNIT_LABELS[unit]} در هفته
                </div>
              ) : null}
            </div>
          ))
        )}
        <div className="stat volume-stat">
          <div className="stat-value">
            {fa(totals.chapters)}
            <span className="volume-unit">فصل</span>
          </div>
          <div className="stat-label">فصل‌های ناتمام</div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="volume-table">
            <thead>
              <tr>
                <th>منبع</th>
                <th>درس</th>
                <th>کل</th>
                <th>انجام‌شده</th>
                <th>باقی‌مانده</th>
                <th>فصل ناتمام</th>
                {weeks ? <th>سهم هفتگی</th> : null}
                <th>پیشرفت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const percent =
                  row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
                return (
                  <tr key={row.resource.id}>
                    <td>
                      <strong>{row.resource.title}</strong>
                    </td>
                    <td>{row.resource.subjectTitle}</td>
                    <td>
                      {fa(row.total)} {UNIT_LABELS[row.resource.unitType]}
                    </td>
                    <td>{fa(row.done)}</td>
                    <td>
                      <b className={row.remaining === 0 ? "volume-zero" : undefined}>
                        {fa(row.remaining)}
                      </b>
                    </td>
                    <td>{fa(row.remainingChapters)}</td>
                    {weeks ? <td>{fa(row.perWeek)}</td> : null}
                    <td>
                      <div className="progress volume-progress">
                        <span style={{ width: `${Math.min(100, percent)}%` }} />
                      </div>
                      <small className="muted">{fa(percent)}٪</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {exam && rows.length > 0 ? (
        <small className="muted">
          «سهم هفتگی» یعنی اگر حجم باقی‌ماندهٔ همین فیلتر را تا تاریخ آزمون بین {fa(weeks ?? 1)} هفته
          پخش کنیم، هر هفته چند{" "}
          {totals.byUnit.length === 1 ? UNIT_LABELS[totals.byUnit[0][0]] : "واحد"} لازم است. با انتخاب
          «تا فصل» می‌توانی بودجهٔ آزمون را محدود کنی.
        </small>
      ) : null}
    </div>
  );
}
