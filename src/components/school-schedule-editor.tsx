"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "./submit-button";

type SubjectOption = { id: string; title: string; kind: string; color: string };

export type SchoolLessonState = {
  weekday: number;
  slotIndex: number;
  subjectId: string;
};

export function SchoolScheduleEditor({
  studentId,
  weekdayLabels,
  slotLabels,
  initialLessons,
  subjects,
  subjectGroups,
  action,
}: {
  studentId: string;
  weekdayLabels: string[];
  slotLabels: string[];
  initialLessons: SchoolLessonState[];
  subjects: SubjectOption[];
  subjectGroups: { general: string[]; specialized: string[] };
  action: (formData: FormData) => Promise<void>;
}) {
  const subjectById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  );
  const [editing, setEditing] = useState(false);
  const [lessons, setLessons] = useState<SchoolLessonState[]>(() => [...initialLessons]);
  const [groups, setGroups] = useState<Record<string, "general" | "specialized">>({});

  const keyFor = (weekday: number, slotIndex: number) => `${weekday}-${slotIndex}`;

  const lessonFor = (weekday: number, slotIndex: number) =>
    lessons.find((lesson) => lesson.weekday === weekday && lesson.slotIndex === slotIndex)?.subjectId ?? "";

  const groupFor = (weekday: number, slotIndex: number, subjectId: string): "general" | "specialized" => {
    const subject = subjectId ? subjectById.get(subjectId) : undefined;
    if (subject) {
      if (subjectGroups.specialized.includes(subject.id) && !subjectGroups.general.includes(subject.id)) {
        return "specialized";
      }
      if (subjectGroups.general.includes(subject.id) && !subjectGroups.specialized.includes(subject.id)) {
        return "general";
      }
    }
    return groups[keyFor(weekday, slotIndex)] ?? "general";
  };

  const setGroup = (weekday: number, slotIndex: number, group: "general" | "specialized") => {
    setGroups((current) => ({ ...current, [keyFor(weekday, slotIndex)]: group }));
    setLessons((current) => current.filter((lesson) => !(lesson.weekday === weekday && lesson.slotIndex === slotIndex)));
  };

  const setLesson = (weekday: number, slotIndex: number, subjectId: string) => {
    setLessons((current) => [
      ...current.filter((lesson) => !(lesson.weekday === weekday && lesson.slotIndex === slotIndex)),
      ...(subjectId ? [{ weekday, slotIndex, subjectId }] : []),
    ]);
  };

  const startEdit = () => {
    setLessons([...initialLessons]);
    setGroups({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setLessons([...initialLessons]);
    setGroups({});
    setEditing(false);
  };

  return (
    <form action={action} className="stack" style={{ gap: "0.9rem" }}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="schoolJson" value={JSON.stringify(lessons)} />
      <div className="row between">
        <small className="muted">
          زنگ‌هایی که در مدرسه هستید را با نام درس مشخص کنید. این زمان‌ها در برنامه‌ریزی خودکار
          رزرو می‌شوند و در آمار مطالعه/تست/تمرین حساب نمی‌شوند.
        </small>
        <div className="row">
          {!editing ? (
            <button type="button" className="btn btn-sm" onClick={startEdit}>
              ویرایش برنامه مدرسه
            </button>
          ) : (
            <>
              <SubmitButton className="btn-sm" pendingLabel="در حال ثبت…">
                ثبت برنامه مدرسه
              </SubmitButton>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                انصراف
              </button>
            </>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <table className="panel-grid">
          <thead>
            <tr>
              <th>روز / زنگ</th>
              {slotLabels.map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekdayLabels.map((label, weekday) => (
              <tr key={label}>
                <th scope="row" className="panel-day">{label}</th>
                {slotLabels.map((_, slotIndex) => {
                  const subjectId = lessonFor(weekday, slotIndex);
                  const group = groupFor(weekday, slotIndex, subjectId);
                  const subjectIds = group === "general" ? subjectGroups.general : subjectGroups.specialized;
                  const options = subjectIds
                    .map((id) => subjectById.get(id))
                    .filter((subject): subject is SubjectOption => Boolean(subject));
                  return (
                    <td key={slotIndex} className="panel-cell">
                      {!editing ? (
                        subjectId ? (
                          <div className="panel-action action-school">
                            <strong>مدرسه</strong>
                            <div className="panel-action-subject">
                              {subjectById.get(subjectId)?.title ?? "درس"}
                            </div>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )
                      ) : (
                        <div className="panel-edit">
                          <select
                            aria-label={`گروه ${label} زنگ ${slotIndex + 1}`}
                            value={group}
                            onChange={(event) => setGroup(weekday, slotIndex, event.target.value as "general" | "specialized")}
                          >
                            <option value="general">عمومی</option>
                            <option value="specialized">تخصصی</option>
                          </select>
                          <select
                            aria-label={`درس ${label} زنگ ${slotIndex + 1}`}
                            value={subjectId}
                            onChange={(event) => setLesson(weekday, slotIndex, event.target.value)}
                          >
                            <option value="">مدرسه نیست</option>
                            {options.map((subject) => (
                              <option key={subject.id} value={subject.id}>
                                {subject.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
