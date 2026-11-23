"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "./submit-button";
import { subjectSupportsTests } from "@/lib/subjects";

export type PanelCellState = {
  kind: "empty" | "rest" | "study" | "review" | "test" | "timedTest" | "exercise" | "routine" | "school" | "exam" | "examAnalysis";
  subjectId?: string;
  resourceText?: string;
  resourceId?: string | null;
  chapterId?: string | null;
  count?: number;
  routineMode?: "study" | "test";
  label?: string;
  title?: string;
  mockExamId?: string | null;
};

export type PanelSlotState = { startMin: number; endMin: number };

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
  slots: PanelSlotState[][];
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
  { value: "school", label: "مدرسه" },
  { value: "exam", label: "آزمون آزمایشی" },
  { value: "examAnalysis", label: "تحلیل آزمون" },
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
  school: "مدرسه",
  exam: "آزمون آزمایشی",
  examAnalysis: "تحلیل آزمون",
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

function cloneSlots(slots: PanelSlotState[][]): PanelSlotState[][] {
  return slots.map((row) => row.map((slot) => ({ ...slot })));
}

type CellClipboard = {
  cell: PanelCellState;
  group: "general" | "specialized";
  source: string;
};

type DayClipboard = {
  cells: PanelCellState[];
  slots: PanelSlotState[];
  groups: Record<number, "general" | "specialized">;
  source: string;
};

function faClock(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function slotRangeLabel(slot?: PanelSlotState): string {
  return slot ? `${faClock(slot.startMin)}–${faClock(slot.endMin)}` : "";
}

function slotTimeOptions(): { value: number; label: string }[] {
  const options: { value: number; label: string }[] = [];
  for (let minutes = 0; minutes <= 24 * 60; minutes += 15) {
    options.push({ value: minutes, label: faClock(minutes) });
  }
  return options;
}

function defaultCell(kind: PanelCellState["kind"]): PanelCellState {
  if (kind === "empty") return { kind: "empty" };
  if (kind === "rest") return { kind: "rest" };
  if (kind === "school") return { kind, subjectId: "", label: "" };
  if (kind === "exam" || kind === "examAnalysis") return { kind, mockExamId: null, title: "" };
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
  const subjectById = useMemo(
    () => new Map(props.subjects.map((subject) => [subject.id, subject])),
    [props.subjects],
  );
  const resourceById = useMemo(
    () => new Map(props.resources.map((resource) => [resource.id, resource])),
    [props.resources],
  );
  const kindById = useMemo(
    () => new Map(props.subjects.map((subject) => [subject.id, subject.kind])),
    [props.subjects],
  );

  const supportsTestsFor = (subjectId?: string) =>
    subjectSupportsTests(kindById.get(subjectId ?? "") ?? "specialized");

  const normalizeCellForKind = (cell: PanelCellState): PanelCellState => {
    if (!cell.subjectId || supportsTestsFor(cell.subjectId)) return cell;
    if (cell.kind === "test" || cell.kind === "timedTest") {
      return { ...cell, kind: "exercise" };
    }
    if (cell.kind === "routine" && cell.routineMode === "test") {
      return { ...cell, routineMode: "study" };
    }
    return cell;
  };

  const normalizeGridForKinds = (grid: PanelCellState[][]): PanelCellState[][] =>
    grid.map((row) => row.map(normalizeCellForKind));

  const [editing, setEditing] = useState(false);
  const [grid, setGrid] = useState<PanelCellState[][]>(() =>
    cloneGrid(normalizeGridForKinds(props.initialGrid)),
  );
  const [slots, setSlots] = useState<PanelSlotState[][]>(() => cloneSlots(props.slots));
  const [routine, setRoutine] = useState(props.initialRoutine);
  const [homework, setHomework] = useState(props.initialHomework);
  const [groups, setGroups] = useState<Record<string, "general" | "specialized">>({});
  const [cellClip, setCellClip] = useState<CellClipboard | null>(null);
  const [dayClip, setDayClip] = useState<DayClipboard | null>(null);

  const timeOptions = slotTimeOptions();

  const updateSlot = (day: number, index: number, patch: Partial<PanelSlotState>) => {
    setSlots((current) =>
      current.map((row, d) =>
        d === day ? row.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) : row,
      ),
    );
  };

  const startEdit = () => {
    setGrid(cloneGrid(normalizeGridForKinds(props.initialGrid)));
    setSlots(cloneSlots(props.slots));
    setRoutine(props.initialRoutine);
    setHomework(props.initialHomework);
    setGroups({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setGrid(cloneGrid(normalizeGridForKinds(props.initialGrid)));
    setSlots(cloneSlots(props.slots));
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
    const cell = grid[day][slot];
    if (
      cell.subjectId &&
      !supportsTestsFor(cell.subjectId) &&
      (kind === "test" || kind === "timedTest")
    ) {
      updateCell(day, slot, defaultCell("exercise"));
      return;
    }
    updateCell(day, slot, defaultCell(kind));
  };

  const setSubject = (day: number, slot: number, subjectId: string) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      const cell = copy[day][slot];
      const generalSubject = !supportsTestsFor(subjectId);
      let next = countKindFor(cell)
        ? { ...cell, subjectId, resourceId: null, chapterId: null }
        : { ...cell, subjectId };
      if (generalSubject) {
        if (next.kind === "test" || next.kind === "timedTest") next = { ...next, kind: "exercise" };
        if (next.kind === "routine" && next.routineMode === "test") {
          next = { ...next, routineMode: "study" };
        }
      }
      copy[day][slot] = next;
      return copy;
    });
  };

  const setRoutineMode = (day: number, slot: number, routineMode: "study" | "test") => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      const cell = copy[day][slot];
      const safeMode =
        routineMode === "test" && cell.subjectId && !supportsTestsFor(cell.subjectId)
          ? "study"
          : routineMode;
      copy[day][slot] = {
        ...cell,
        kind: "routine",
        routineMode: safeMode,
        resourceId: null,
        chapterId: null,
        count: 30,
      };
      return copy;
    });
  };

  const copyCell = (day: number, slot: number) => {
    setCellClip({
      cell: { ...grid[day][slot] },
      group: groupFor(day, slot, grid[day][slot]),
      source: `${props.weekdayLabels[day]} · زنگ ${(slot + 1).toLocaleString("fa-IR")}`,
    });
  };

  const pasteCell = (day: number, slot: number) => {
    if (!cellClip) return;
    const cell = normalizeCellForKind({ ...cellClip.cell });
    updateCell(day, slot, cell);
    if (!cell.subjectId) {
      setGroups((current) => ({ ...current, [groupKey(day, slot)]: cellClip.group }));
    }
  };

  const copyDay = (day: number) => {
    const dayGroups: Record<number, "general" | "specialized"> = {};
    grid[day].forEach((cell, slot) => {
      dayGroups[slot] = groupFor(day, slot, cell);
    });
    setDayClip({
      cells: grid[day].map((cell) => ({ ...cell })),
      slots: slots[day].map((slot) => ({ ...slot })),
      groups: dayGroups,
      source: props.weekdayLabels[day],
    });
  };

  const pasteDay = (day: number) => {
    if (!dayClip) return;
    setGrid((current) => {
      const copy = cloneGrid(current);
      copy[day] = dayClip.cells.map((cell) => normalizeCellForKind({ ...cell }));
      return copy;
    });
    setSlots((current) =>
      current.map((row, d) => (d === day ? dayClip.slots.map((slot) => ({ ...slot })) : row)),
    );
    setGroups((current) => {
      const next = { ...current };
      dayClip.cells.forEach((_, slot) => {
        next[groupKey(day, slot)] = dayClip.groups[slot] ?? "general";
      });
      return next;
    });
  };

  const cellLabel = (cell: PanelCellState, day: number, slot: number) => {
    if (cell.kind === "empty") return <span className="muted">—</span>;
    if (cell.kind === "rest") return <span className="panel-rest action-rest">استراحت</span>;
    const time = slotRangeLabel(slots[day]?.[slot]);
    if (cell.kind === "exam" || cell.kind === "examAnalysis") {
      return (
        <div className={`panel-action action-${cell.kind}`}>
          <span className="perf-tag">{time}</span>
          <strong>{ACTION_LABELS[cell.kind]}</strong>
          {cell.title ? <div className="muted" style={{ fontSize: "0.72rem" }}>{cell.title}</div> : null}
        </div>
      );
    }
    const subject = cell.subjectId ? subjectById.get(cell.subjectId) : undefined;
    const title = subject?.title ?? "درس";
    const color = subject?.color ?? "#1f6f4a";
    const kindLabel = subject?.kind === "specialized" ? "تخصصی" : "عمومی";
    const resource = cell.resourceId ? resourceById.get(cell.resourceId) : undefined;
    const chapter = resource?.chapters.find((item) => item.id === cell.chapterId);
    const isSchool = cell.kind === "school";

    return (
      <div
        className={`panel-action action-${cell.kind}`}
        style={{ borderInlineStartColor: color }}
      >
        <span className="perf-tag">{time}</span>
        <div className="panel-action-subject" style={{ color }}>
          {isSchool ? title : `${kindLabel} · ${title}`}
        </div>
        <strong>
          {cell.kind === "routine" ? `روتین (${cell.routineMode === "test" ? "تست" : "مطالعه"})` : ACTION_LABELS[cell.kind]}
        </strong>
        {isSchool ? null : (
          <>
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
          </>
        )}
      </div>
    );
  };

  const actionControls = (day: number, slot: number, cell: PanelCellState) => {
    const isEvent = cell.kind === "exam" || cell.kind === "examAnalysis";
    const needsSubject = cell.kind !== "empty" && cell.kind !== "rest" && !isEvent;
    const group = groupFor(day, slot, cell);
    const subjectIds = group === "general" ? props.subjectGroups.general : props.subjectGroups.specialized;
    const availableSubjects = subjectIds
      .map((id) => subjectById.get(id))
      .filter((subject): subject is SubjectOption => Boolean(subject));
    const resource = cell.resourceId ? resourceById.get(cell.resourceId) : undefined;
    const isRoutine = cell.kind === "routine";
    const countMode = countKindFor(cell);
    const textMode = textKindFor(cell);
    const generalContext = cell.subjectId
      ? !supportsTestsFor(cell.subjectId)
      : group === "general";

    return (
      <>
        {isEvent ? (
          <input
            type="text"
            aria-label={`عنوان ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
            placeholder="عنوان آزمون یا تحلیل…"
            value={cell.title ?? ""}
            onChange={(event) => updateCell(day, slot, { ...cell, title: event.target.value })}
          />
        ) : null}

        {isRoutine ? (
          <select
            aria-label={`نوع روتین ${props.weekdayLabels[day]} زنگ ${slot + 1}`}
            value={generalContext ? "study" : cell.routineMode ?? "test"}
            onChange={(event) =>
              setRoutineMode(day, slot, event.target.value === "study" ? "study" : "test")
            }
          >
            {generalContext ? null : <option value="test">روتین تست</option>}
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
                  {chapter.title}
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
      <input type="hidden" name="slotsJson" value={JSON.stringify(slots)} />

      <div className="row between">
        <small className="muted">
          ردیف‌ها روزهای هفته و ستون‌ها ۱۰ زنگ روزانه‌اند. ساعت هر زنگ فقط برای همان روز، داخل خود
          خانه قابل تغییر است و هر زنگ یک «اقدام» دارد. در حالت ویرایش، با «کپی» و «درج» می‌توانید
          برنامه یک زنگ را روی زنگ دیگر و برنامه کل یک روز (شامل ساعت زنگ‌ها) را روی روز دیگر
          منتقل کنید. با «ثبت تغییرات» کل جدول و ساعت زنگ‌ها یکجا ذخیره می‌شود.
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

      {editing && (cellClip || dayClip) ? (
        <div className="row" style={{ gap: "0.4rem" }}>
          {cellClip ? <span className="badge">در حافظه: زنگ {cellClip.source}</span> : null}
          {dayClip ? <span className="badge">در حافظه: روز {dayClip.source}</span> : null}
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="panel-grid">
          <thead>
            <tr>
              <th>روز / زنگ</th>
              {(slots[0] ?? []).map((_, index) => (
                <th key={index}>زنگ {(index + 1).toLocaleString("fa-IR")}</th>
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
                  {editing ? (
                    <div className="panel-day-tools">
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        title={`کپی برنامه کل ${label}`}
                        onClick={() => copyDay(day)}
                      >
                        کپی روز
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        disabled={!dayClip}
                        title={`درج برنامه روز کپی‌شده به جای ${label}`}
                        onClick={() => pasteDay(day)}
                      >
                        درج روز
                      </button>
                    </div>
                  ) : null}
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
                      cellLabel(cell, day, slot)
                    ) : (
                      <div className="panel-edit">
                        <div className="cell-copy-tools">
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            aria-label={`کپی زنگ ${slot + 1} ${label}`}
                            title="کپی این زنگ"
                            onClick={() => copyCell(day, slot)}
                          >
                            کپی
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            aria-label={`درج زنگ کپی‌شده در زنگ ${slot + 1} ${label}`}
                            title="درج زنگ کپی‌شده در این خانه"
                            disabled={!cellClip}
                            onClick={() => pasteCell(day, slot)}
                          >
                            درج
                          </button>
                        </div>
                        <div className="row" style={{ gap: "0.25rem" }}>
                          <select
                            aria-label={`شروع زنگ ${slot + 1} ${label}`}
                            value={slots[day]?.[slot]?.startMin ?? 480}
                            onChange={(event) =>
                              updateSlot(day, slot, { startMin: Number(event.target.value) })
                            }
                          >
                            {timeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label={`پایان زنگ ${slot + 1} ${label}`}
                            value={slots[day]?.[slot]?.endMin ?? 570}
                            onChange={(event) =>
                              updateSlot(day, slot, { endMin: Number(event.target.value) })
                            }
                          >
                            {timeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <select
                          aria-label={`اقدام ${label} زنگ ${slot + 1}`}
                          value={cell.kind}
                          onChange={(event) =>
                            setKind(day, slot, event.target.value as PanelCellState["kind"])
                          }
                        >
                          {(supportsTestsFor(cell.subjectId)
                            ? KIND_OPTIONS
                            : KIND_OPTIONS.filter(
                                (option) =>
                                  option.value !== "test" && option.value !== "timedTest",
                              )
                          ).map((option) => (
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
