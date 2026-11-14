"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "./submit-button";

export type PanelCellState = {
  kind: "empty" | "rest" | "study" | "review" | "test" | "timedTest" | "exercise" | "routine";
  subjectId?: string;
  resourceText?: string;
  resourceId?: string | null;
  chapterId?: string | null;
  count?: number;
  routineMode?: "study" | "test";
};

type SubjectOption = { id: string; title: string; kind: string; color: string };
type ResourceOption = {
  id: string;
  subjectId: string;
  title: string;
  chapters: {
    id: string;
    title: string;
    testCount: number;
    completedTests: number;
    exerciseCount: number;
    completedExercises: number;
  }[];
};

export type WeekGridEditorProps = {
  studentId: string;
  weekStart: string;
  weekdayLabels: string[];
  dayTitles: string[];
  slotLabels: string[];
  initialGrid: PanelCellState[][];
  initialRoutine: string;
  initialHomework: string;
  subjects: SubjectOption[];
  subjectGroups: { general: string[]; specialized: string[] };
  resources: ResourceOption[];
  action: (formData: FormData) => Promise<void>;
};

const KIND_OPTIONS: { value: PanelCellState["kind"]; label: string }[] = [
  { value: "empty", label: "خالی" },
  { value: "rest", label: "استراحت" },
  { value: "study", label: "مطالعه" },
  { value: "review", label: "مرور" },
  { value: "test", label: "تست آموزشی" },
  { value: "timedTest", label: "تست زمان‌دار" },
  { value: "exercise", label: "تمرین" },
  { value: "routine", label: "روتین" },
];

const ACTION_LABELS: Record<PanelCellState["kind"], string> = {
  empty: "—",
  rest: "استراحت",
  study: "مطالعه",
  review: "مرور",
  test: "تست آموزشی",
  timedTest: "تست زمان‌دار",
  exercise: "تمرین",
  routine: "روتین",
};

function isCountKind(kind: PanelCellState["kind"]): boolean {
  return kind === "test" || kind === "timedTest" || kind === "exercise";
}

function countKindFor(cell: PanelCellState): boolean {
  return isCountKind(cell.kind) || (cell.kind === "routine" && cell.routineMode === "test");
}

function textKindFor(cell: PanelCellState): boolean {
  return cell.kind === "study" || cell.kind === "review" || (cell.kind === "routine" && cell.routineMode === "study");
}

function cloneGrid(grid: PanelCellState[][]): PanelCellState[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

function defaultCell(kind: PanelCellState["kind"]): PanelCellState {
  if (kind === "empty") return { kind: "empty" };
  if (kind === "rest") return { kind: "rest" };
  if (kind === "study" || kind === "review") return { kind, subjectId: "", resourceText: "" };
  if (kind === "routine") {
    return {
      kind: "routine",
      routineMode: "test",
      subjectId: "",
      resourceText: "",
      resourceId: null,
      chapterId: null,
      count: 30,
    };
  }
  return { kind, subjectId: "", resourceId: null, chapterId: null, count: 30 };
}

export function WeekGridEditor(props: WeekGridEditorProps) {
  const [editing, setEditing] = useState(false);
  const [grid, setGrid] = useState<PanelCellState[][]>(() => cloneGrid(props.initialGrid));
  const [routine, setRoutine] = useState(props.initialRoutine);
  const [homework, setHomework] = useState(props.initialHomework);
  const [groups, setGroups] = useState<Record<string, "general" | "specialized">>({});

  const subjectById = useMemo(
    () => new Map(props.subjects.map((subject) => [subject.id, subject])),
    [props.subjects],
  );
  const resourceById = useMemo(
    () => new Map(props.resources.map((resource) => [resource.id, resource])),
    [props.resources],
  );

  const startEdit = () => {
    setGrid(cloneGrid(props.initialGrid));
    setRoutine(props.initialRoutine);
    setHomework(props.initialHomework);
    setGroups({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setGrid(cloneGrid(props.initialGrid));
    setRoutine(props.initialRoutine);
    setHomework(props.initialHomework);
    setGroups({});
    setEditing(false);
  };

  const updateCell = (day: number, slot: number, next: PanelCellState) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      copy[day][slot] = next;
      return copy;
    });
  };

  const groupKey = (day: number, slot: number) => `${day}-${slot}`;

  const groupFor = (day: number, slot: number, cell: PanelCellState): "general" | "specialized" => {
    const remembered = groups[groupKey(day, slot)];
    const subject = cell.subjectId ? subjectById.get(cell.subjectId) : undefined;
    if (subject) {
      const inSpecialized = props.subjectGroups.specialized.includes(subject.id);
      const inGeneral = props.subjectGroups.general.includes(subject.id);
      if (inSpecialized && !inGeneral) return "specialized";
      if (inGeneral && !inSpecialized) return "general";
      if (subject.kind === "specialized") return "specialized";
    }
    return remembered ?? "general";
  };

  const setGroup = (day: number, slot: number, group: "general" | "specialized") => {
    setGroups((current) => ({ ...current, [groupKey(day, slot)]: group }));
    const cell = grid[day][slot];
    if (cell.subjectId) updateCell(day, slot, { ...cell, subjectId: "", resourceId: null, chapterId: null });
  };

  const setKind = (day: number, slot: number, kind: PanelCellState["kind"]) => {
    updateCell(day, slot, defaultCell(kind));
  };

  const setSubject = (day: number, slot: number, subjectId: string) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      const cell = copy[day][slot];
      if (countKindFor(cell)) {
        copy[day][slot] = { ...cell, subjectId, resourceId: null, chapterId: null };
      } else {
        copy[day][slot] = { ...cell, subjectId };
      }
      return copy;
    });
  };

  const setRoutineMode = (day: number, slot: number, routineMode: "study" | "test") => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      const cell = copy[day][slot];
      copy[day][slot] = {
        ...cell,
        kind: "routine",
        routineMode,
        resourceId: null,
        chapterId: null,
        count: 30,
      };
      return copy;
    });
  };

  const cellLabel = (cell: PanelCellState) => {
    if (cell.kind === "empty") return <span className="muted">—</span>;
    if (cell.kind === "rest") return <span className="panel-rest action-rest">استراحت</span>;
    const subject = cell.subjectId ? subjectById.get(cell.subjectId) : undefined;
    const title = subject?.title ?? "درس";
    const color = subject?.color ?? "#1f6f4a";
    const resource = cell.resourceId ? resourceById.get(cell.resourceId) : undefined;
    const chapter = resource?.chapters.find((item) => item.id === cell.chapterId);

    return (
      <div
        className={`panel-action action-${cell.kind}`}
        style={{ borderInlineStartColor: color }}
      >
        <strong>{cell.kind === "routine" ? `روتین (${cell.routineMode === "test" ? "تست" : "مطالعه"})` : ACTION_LABELS[cell.kind]}</strong>
        <div className="panel-action-subject" style={{ color }}>
          {title}
        </div>
        {textKindFor(cell) && cell.resourceText ? (
          <div className="muted" style={{ fontSize: "0.72rem" }}>{cell.resourceText}</div>
        ) : null}
        {countKindFor(cell) && resource ? (
          <div className="muted" style={{ fontSize: "0.72rem" }}>
            {resource.title}
            {chapter ? ` — ${chapter.title}` : ""}
          </div>
        ) : null}
        {countKindFor(cell) && (cell.count ?? 0) > 0 ? (
          <div style={{ fontSize: "0.72rem" }}>{(cell.count ?? 0).toLocaleString("fa-IR")} عدد</div>
        ) : null}
      </div>
    );
  };

  const actionControls = (day: number, slot: number, cell: PanelCellState) => {
    const needsSubject = cell.kind !== "empty" && cell.kind !== "rest";
    const group = groupFor(day, slot, cell);
    const subjectIds = group === "general" ? props.subjectGroups.general : props.subjectGroups.specialized;
    const availableSubjects = subjectIds
      .map((id) => subjectById.get(id))
      .filter((subject): subject is SubjectOption => Boolean(subject));
    const resource = cell.resourceId ? resourceById.get(cell.resourceId) : undefined;
    const isRoutine = cell.kind === "routine";
    const countMode = countKindFor(cell);
    const textMode = textKindFor(cell);

    return (
      <>
        {isRoutine ? (
          <select
            aria-label={`نوع روتین ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
            value={cell.routineMode ?? "test"}
            onChange={(event) =>
              setRoutineMode(day, slot, event.target.value === "study" ? "study" : "test")
            }
          >
            <option value="test">روتین تست</option>
            <option value="study">روتین مطالعه</option>
          </select>
        ) : null}

        {needsSubject ? (
          <>
            <select
              aria-label={`گروه درس ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
              value={group}
              onChange={(event) => setGroup(day, slot, event.target.value as "general" | "specialized")}
            >
              <option value="general">عمومی</option>
              <option value="specialized">تخصصی</option>
            </select>
            <select
              aria-label={`درس ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
              value={cell.subjectId ?? ""}
              onChange={(event) => setSubject(day, slot, event.target.value)}
            >
              <option value="">درس را انتخاب کنید…</option>
              {availableSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
          </>
        ) : null}

        {textMode ? (
          <input
            type="text"
            aria-label={`منبع ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
            placeholder="نام منبع (متن آزاد)…"
            value={cell.resourceText ?? ""}
            onChange={(event) => updateCell(day, slot, { ...cell, resourceText: event.target.value })}
          />
        ) : null}

        {countMode ? (
          <>
            <select
              aria-label={`منبع ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
              value={cell.resourceId ?? ""}
              onChange={(event) =>
                updateCell(day, slot, {
                  ...cell,
                  resourceId: event.target.value || null,
                  chapterId: null,
                })
              }
            >
              <option value="">منبع را انتخاب کنید…</option>
              {props.resources
                .filter((item) => item.subjectId === cell.subjectId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
            <select
              aria-label={`فصل ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
              value={cell.chapterId ?? ""}
              disabled={!resource}
              onChange={(event) =>
                updateCell(day, slot, { ...cell, chapterId: event.target.value || null })
              }
            >
              <option value="">{resource ? "فصل/بخش را انتخاب کنید…" : "اول منبع را انتخاب کنید"}</option>
              {(resource?.chapters ?? []).map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title} — تست {chapter.completedTests.toLocaleString("fa-IR")}/
                  {chapter.testCount.toLocaleString("fa-IR")} · تمرین{" "}
                  {chapter.completedExercises.toLocaleString("fa-IR")}/
                  {chapter.exerciseCount.toLocaleString("fa-IR")}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={1000}
              aria-label={`تعداد ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
              value={cell.count ?? 0}
              onChange={(event) =>
                updateCell(day, slot, {
                  ...cell,
                  count: Math.max(0, Math.round(Number(event.target.value) || 0)),
                })
              }
            />
          </>
        ) : null}
      </>
    );
  };

  return (
    <form action={props.action} className="stack" style={{ gap: "0.9rem" }}>
      <input type="hidden" name="studentId" value={props.studentId} />
      <input type="hidden" name="weekStart" value={props.weekStart} />
      <input type="hidden" name="gridJson" value={JSON.stringify(grid)} />

      <div className="row between">
        <small className="muted">
          ردیف‌ها روزهای هفته و ستون‌ها ۱۰ زنگ روزانه‌اند. هر زنگ یک «اقدام» دارد و با «ثبت
          تغییرات» کل جدول یکجا ذخیره می‌شود.
        </small>
        <div className="row">
          {!editing ? (
            <button type="button" className="btn btn-sm" onClick={startEdit}>
              ویرایش
            </button>
          ) : (
            <>
              <SubmitButton className="btn-sm" pendingLabel="در حال ثبت…">
                ثبت تغییرات
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
              {props.slotLabels.map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.weekdayLabels.map((label, day) => (
              <tr key={label}>
                <th scope="row" className="panel-day">
                  <strong>{label}</strong>
                  <div className="muted" style={{ fontSize: "0.7rem" }}>
                    {props.dayTitles[day]}
                  </div>
                </th>
                {grid[day].map((cell, slot) => (
                  <td
                    key={slot}
                    className={[
                      "panel-cell",
                      cell.kind === "rest" ? "is-rest" : "",
                      `cell-action-${cell.kind}`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {!editing ? (
                      cellLabel(cell)
                    ) : (
                      <div className="panel-edit">
                        <select
                          aria-label={`اقدام ${label} زنگ ${slot + 1}`}
                          value={cell.kind}
                          onChange={(event) =>
                            setKind(day, slot, event.target.value as PanelCellState["kind"])
                          }
                        >
                          {KIND_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {actionControls(day, slot, cell)}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-2">
        <div className="card" style={{ boxShadow: "none" }}>
          <h3>روتین روزانه</h3>
          <div className="field">
            <label>کارهای تکرارشونده هر روز هفته</label>
            <textarea
              name="dailyRoutine"
              rows={4}
              placeholder="مثلاً: روزی ۲۰ دقیقه ورزش؛ روزی ۱ ساعت تمرین ریاضی"
              value={routine}
              disabled={!editing}
              onChange={(event) => setRoutine(event.target.value)}
            />
          </div>
        </div>
        <div className="card" style={{ boxShadow: "none" }}>
          <h3>تکلیف هفته بعد</h3>
          <div className="field">
            <label>تکالیفی که برای هفته بعد تعیین می‌شود</label>
            <textarea
              name="nextWeekHomework"
              rows={4}
              placeholder="مثلاً: خلاصه‌نویسی فصل ۳ زیست؛ ۵۰ تست شیمی"
              value={homework}
              disabled={!editing}
              onChange={(event) => setHomework(event.target.value)}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
