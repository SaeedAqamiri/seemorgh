"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "./submit-button";

export type PerfCellState = {
  kind: "empty" | "rest" | "study" | "review" | "test" | "timedTest" | "exercise" | "routine";
  subjectId?: string;
  resourceText?: string;
  resourceId?: string | null;
  chapterId?: string | null;
  count?: number;
  routineMode?: "study" | "test";
  minutes?: number;
  note?: string;
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

export type ViewMode = "both" | "plan" | "perf";

export type PerformancePanelProps = {
  studentId: string;
  weekStart: string;
  weekdayLabels: string[];
  dayTitles: string[];
  slotLabels: string[];
  slotBounds: { startMin: number; endMin: number }[];
  plannedLabels: string[][];
  initialGrid: PerfCellState[][];
  subjects: SubjectOption[];
  subjectGroups: { general: string[]; specialized: string[] };
  resources: ResourceOption[];
  action: (formData: FormData) => Promise<void>;
};

const KIND_OPTIONS: { value: PerfCellState["kind"]; label: string }[] = [
  { value: "empty", label: "ثبت نشده" },
  { value: "rest", label: "استراحت" },
  { value: "study", label: "مطالعه" },
  { value: "review", label: "مرور" },
  { value: "test", label: "تست آموزشی" },
  { value: "timedTest", label: "تست زمان‌دار" },
  { value: "exercise", label: "تمرین" },
  { value: "routine", label: "روتین" },
];

const ACTION_LABELS: Record<PerfCellState["kind"], string> = {
  empty: "—",
  rest: "استراحت",
  study: "مطالعه",
  review: "مرور",
  test: "تست آموزشی",
  timedTest: "تست زمان‌دار",
  exercise: "تمرین",
  routine: "روتین",
};

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "both", label: "برنامه‌ریزی + عملکرد" },
  { value: "plan", label: "فقط برنامه‌ریزی" },
  { value: "perf", label: "فقط عملکرد" },
];

function isCountKind(kind: PerfCellState["kind"]): boolean {
  return kind === "test" || kind === "timedTest" || kind === "exercise";
}

function countKindFor(cell: PerfCellState): boolean {
  return isCountKind(cell.kind) || (cell.kind === "routine" && cell.routineMode === "test");
}

function textKindFor(cell: PerfCellState): boolean {
  return cell.kind === "study" || cell.kind === "review" || (cell.kind === "routine" && cell.routineMode === "study");
}

function cloneGrid(grid: PerfCellState[][]): PerfCellState[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

function defaultCell(kind: PerfCellState["kind"], minutes: number, note = ""): PerfCellState {
  if (kind === "empty") return { kind: "empty" };
  if (kind === "rest") return { kind: "rest" };
  if (kind === "study" || kind === "review") {
    return { kind, subjectId: "", resourceText: "", minutes, note };
  }
  if (kind === "routine") {
    return {
      kind: "routine",
      routineMode: "test",
      subjectId: "",
      resourceText: "",
      resourceId: null,
      chapterId: null,
      count: 30,
      minutes,
      note,
    };
  }
  return {
    kind,
    subjectId: "",
    resourceId: null,
    chapterId: null,
    count: 30,
    minutes,
    note,
  };
}

export function PerformancePanel(props: PerformancePanelProps) {
  const [editing, setEditing] = useState(false);
  const [grid, setGrid] = useState<PerfCellState[][]>(() => cloneGrid(props.initialGrid));
  const [viewMode, setViewMode] = useState<ViewMode>("both");
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
    setGroups({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setGrid(cloneGrid(props.initialGrid));
    setGroups({});
    setEditing(false);
  };

  const updateCell = (day: number, slot: number, next: PerfCellState) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      copy[day][slot] = next;
      return copy;
    });
  };

  const groupKey = (day: number, slot: number) => `${day}-${slot}`;

  const groupFor = (day: number, slot: number, cell: PerfCellState): "general" | "specialized" => {
    const subject = cell.subjectId ? subjectById.get(cell.subjectId) : undefined;
    if (subject) {
      const inSpecialized = props.subjectGroups.specialized.includes(subject.id);
      const inGeneral = props.subjectGroups.general.includes(subject.id);
      if (inSpecialized && !inGeneral) return "specialized";
      if (inGeneral && !inSpecialized) return "general";
      if (subject.kind === "specialized") return "specialized";
    }
    return groups[groupKey(day, slot)] ?? "general";
  };

  const setGroup = (day: number, slot: number, group: "general" | "specialized") => {
    setGroups((current) => ({ ...current, [groupKey(day, slot)]: group }));
    const cell = grid[day][slot];
    if (cell.subjectId) {
      updateCell(day, slot, { ...cell, subjectId: "", resourceId: null, chapterId: null });
    }
  };

  const setKind = (day: number, slot: number, kind: PerfCellState["kind"]) => {
    const previous = grid[day][slot];
    const bounds = props.slotBounds[slot] ?? { startMin: 480, endMin: 570 };
    updateCell(
      day,
      slot,
      defaultCell(
        kind,
        previous.minutes ?? bounds.endMin - bounds.startMin,
        previous.note ?? "",
      ),
    );
  };

  const setSubject = (day: number, slot: number, subjectId: string) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      const cell = copy[day][slot];
      copy[day][slot] = countKindFor(cell)
        ? { ...cell, subjectId, resourceId: null, chapterId: null }
        : { ...cell, subjectId };
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

  const perfLabel = (cell: PerfCellState) => {
    if (cell.kind === "empty") return <span className="muted">—</span>;
    if (cell.kind === "rest") return <span className="panel-rest action-rest">استراحت</span>;
    const subject = cell.subjectId ? subjectById.get(cell.subjectId) : undefined;
    const title = subject?.title ?? "درس";
    const color = subject?.color ?? "#1f6f4a";
    const resource = cell.resourceId ? resourceById.get(cell.resourceId) : undefined;
    const chapter = resource?.chapters.find((item) => item.id === cell.chapterId);

    return (
      <div className={`panel-action action-${cell.kind}`} style={{ borderInlineStartColor: color }}>
        <strong>
          {cell.kind === "routine"
            ? `روتین (${cell.routineMode === "test" ? "تست" : "مطالعه"})`
            : ACTION_LABELS[cell.kind]}
        </strong>
        <div className="panel-action-subject" style={{ color }}>{title}</div>
        {textKindFor(cell) && cell.resourceText ? (
          <div className="muted" style={{ fontSize: "0.72rem" }}>{cell.resourceText}</div>
        ) : null}
        {countKindFor(cell) && resource ? (
          <div className="muted" style={{ fontSize: "0.72rem" }}>
            {resource.title}
            {chapter ? ` — ${chapter.title}` : ""}
          </div>
        ) : null}
        <div className="muted" style={{ fontSize: "0.72rem" }}>
          {Number.isFinite(cell.minutes) ? `${(cell.minutes ?? 0).toLocaleString("fa-IR")} دقیقه` : "—"}
        </div>
        {countKindFor(cell) && (cell.count ?? 0) > 0 ? (
          <div style={{ fontSize: "0.72rem" }}>{(cell.count ?? 0).toLocaleString("fa-IR")} عدد</div>
        ) : null}
      </div>
    );
  };

  const cellBody = (day: number, slot: number) => {
    const planned = props.plannedLabels[day]?.[slot] ?? "—";
    const perf = grid[day]?.[slot] ?? { kind: "empty" as const };
    const note = perf.note?.trim();

    if (editing) {
      const group = groupFor(day, slot, perf);
      const subjectIds = group === "general" ? props.subjectGroups.general : props.subjectGroups.specialized;
      const availableSubjects = subjectIds
        .map((id) => subjectById.get(id))
        .filter((subject): subject is SubjectOption => Boolean(subject));
      const resource = perf.resourceId ? resourceById.get(perf.resourceId) : undefined;
      const countMode = countKindFor(perf);
      const textMode = textKindFor(perf);

      return (
        <div className="perf-edit-wrap">
          <span className="perf-tag">برنامه: {planned}</span>
          <div className="panel-edit">
            <select
              aria-label={`نوع عملکرد ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
              value={perf.kind}
              onChange={(event) => setKind(day, slot, event.target.value as PerfCellState["kind"])}
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {perf.kind === "routine" ? (
              <select
                aria-label={`نوع روتین ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
                value={perf.routineMode ?? "test"}
                onChange={(event) =>
                  setRoutineMode(day, slot, event.target.value === "study" ? "study" : "test")
                }
              >
                <option value="test">روتین تست</option>
                <option value="study">روتین مطالعه</option>
              </select>
            ) : null}
            {perf.kind !== "empty" && perf.kind !== "rest" ? (
              <>
                <select
                  aria-label={`گروه درس ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
                  value={group}
                  onChange={(event) =>
                    setGroup(day, slot, event.target.value as "general" | "specialized")
                  }
                >
                  <option value="general">عمومی</option>
                  <option value="specialized">تخصصی</option>
                </select>
                <select
                  aria-label={`درس ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
                  value={perf.subjectId ?? ""}
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
                placeholder="نام منبع (متن آزاد)…"
                aria-label={`منبع ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
                value={perf.resourceText ?? ""}
                onChange={(event) =>
                  updateCell(day, slot, { ...perf, resourceText: event.target.value })
                }
              />
            ) : null}
            {countMode ? (
              <>
                <select
                  aria-label={`منبع ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
                  value={perf.resourceId ?? ""}
                  onChange={(event) =>
                    updateCell(day, slot, {
                      ...perf,
                      resourceId: event.target.value || null,
                      chapterId: null,
                    })
                  }
                >
                  <option value="">منبع را انتخاب کنید…</option>
                  {props.resources
                    .filter((item) => item.subjectId === perf.subjectId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                </select>
                <select
                  aria-label={`فصل ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
                  value={perf.chapterId ?? ""}
                  disabled={!resource}
                  onChange={(event) =>
                    updateCell(day, slot, { ...perf, chapterId: event.target.value || null })
                  }
                >
                  <option value="">
                    {resource ? "فصل/بخش را انتخاب کنید…" : "اول منبع را انتخاب کنید"}
                  </option>
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
                  value={perf.count ?? 0}
                  onChange={(event) =>
                    updateCell(day, slot, {
                      ...perf,
                      count: Math.max(0, Math.round(Number(event.target.value) || 0)),
                    })
                  }
                />
              </>
            ) : null}
            {perf.kind !== "empty" && perf.kind !== "rest" ? (
              <input
                type="number"
                min={0}
                max={1440}
                placeholder="مدت (دقیقه)"
                aria-label={`مدت ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
                value={perf.minutes ?? 0}
                onChange={(event) =>
                  updateCell(day, slot, {
                    ...perf,
                    minutes: Math.max(0, Math.round(Number(event.target.value) || 0)),
                  })
                }
              />
            ) : null}
            <input
              type="text"
              placeholder="توضیحات…"
              aria-label={`توضیحات ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
              value={perf.note ?? ""}
              onChange={(event) => updateCell(day, slot, { ...perf, note: event.target.value })}
            />
          </div>
        </div>
      );
    }

    const showPlan = viewMode === "both" || viewMode === "plan";
    const showPerf = viewMode === "both" || viewMode === "perf";

    return (
      <div className="perf-view">
        {showPlan ? (
          <div className="perf-plan">
            <span className="perf-tag">برنامه: {planned}</span>
          </div>
        ) : null}
        {showPerf ? (
          <div className="perf-done">
            <span className="perf-tag perf-tag-done">عملکرد:</span>
            {perfLabel(perf)}
            {note ? (
              <div className="perf-note" title={note}>
                {note}
              </div>
            ) : null}
          </div>
        ) : null}
        {!showPerf && !showPlan ? <span className="muted">—</span> : null}
      </div>
    );
  };

  const faHours = (minutes: number) =>
    (minutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 1 });

  const dayTotals = (cells: PerfCellState[]) => {
    let study = 0;
    let review = 0;
    let test = 0;
    for (const cell of cells) {
      const minutes = typeof cell.minutes === "number" ? cell.minutes : 0;
      if (cell.kind === "study" || (cell.kind === "routine" && cell.routineMode === "study")) {
        study += minutes;
      } else if (cell.kind === "review") {
        review += minutes;
      } else if (
        cell.kind === "test" ||
        cell.kind === "timedTest" ||
        cell.kind === "exercise" ||
        (cell.kind === "routine" && cell.routineMode === "test")
      ) {
        test += minutes;
      }
    }
    return { study, review, test };
  };

  return (
    <form action={props.action} className="stack" style={{ gap: "0.9rem" }}>
      <input type="hidden" name="studentId" value={props.studentId} />
      <input type="hidden" name="weekStart" value={props.weekStart} />
      <input type="hidden" name="cellsJson" value={JSON.stringify(grid)} />

      <div className="row between">
        <div className="row">
          <label style={{ fontSize: "0.8rem" }}>نمایش:</label>
          <select
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as ViewMode)}
            aria-label="حالت نمایش جدول"
          >
            {VIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          {!editing ? (
            <button type="button" className="btn btn-sm" onClick={startEdit}>
              ثبت عملکرد
            </button>
          ) : (
            <>
              <SubmitButton className="btn-sm" pendingLabel="در حال ثبت…">
                ثبت گزارش عملکرد
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
              <th>جمع مطالعه</th>
              <th>جمع مرور</th>
              <th>جمع تست/تمرین</th>
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
                    {cellBody(day, slot)}
                  </td>
                ))}
                {(() => {
                  const totals = dayTotals(grid[day]);
                  return (
                    <>
                      <td className="panel-total">{faHours(totals.study)} س</td>
                      <td className="panel-total">{faHours(totals.review)} س</td>
                      <td className="panel-total">{faHours(totals.test)} س</td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
