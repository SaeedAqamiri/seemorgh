"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "./submit-button";

export type PerfCellState = {
  kind: "empty" | "rest" | "review" | "practice";
  subjectId?: string;
  resourceId?: string | null;
  count?: number;
  startMin?: number;
  endMin?: number;
  note?: string;
};

export type ViewMode = "both" | "plan" | "perf";

export type PerformancePanelProps = {
  studentId: string;
  weekStart: string;
  weekdayLabels: string[];
  dayTitles: string[];
  slotLabels: string[];
  plannedLabels: string[][];
  initialGrid: PerfCellState[][];
  subjects: { id: string; title: string }[];
  resources: { id: string; subjectId: string; title: string }[];
  action: (formData: FormData) => Promise<void>;
};

const KIND_OPTIONS: { value: PerfCellState["kind"]; label: string }[] = [
  { value: "empty", label: "ثبت نشده" },
  { value: "rest", label: "استراحت" },
  { value: "review", label: "مرور" },
  { value: "practice", label: "تمرین" },
];

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "both", label: "برنامه‌ریزی + عملکرد" },
  { value: "plan", label: "فقط برنامه‌ریزی" },
  { value: "perf", label: "فقط عملکرد" },
];

function timeOptions(): { value: number; label: string }[] {
  const options: { value: number; label: string }[] = [];
  for (let minutes = 5 * 60; minutes <= 23.5 * 60; minutes += 30) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    options.push({ value: minutes, label: `${hh}:${mm}` });
  }
  return options;
}

function faTime(minutes?: number): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "—";
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function cloneGrid(grid: PerfCellState[][]): PerfCellState[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

export function PerformancePanel(props: PerformancePanelProps) {
  const [editing, setEditing] = useState(false);
  const [grid, setGrid] = useState<PerfCellState[][]>(() => cloneGrid(props.initialGrid));
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const timeChoices = useMemo(() => timeOptions(), []);

  const subjectTitles = useMemo(
    () => new Map(props.subjects.map((subject) => [subject.id, subject.title])),
    [props.subjects],
  );
  const resourceTitles = useMemo(
    () => new Map(props.resources.map((resource) => [resource.id, resource.title])),
    [props.resources],
  );

  const startEdit = () => {
    setGrid(cloneGrid(props.initialGrid));
    setEditing(true);
  };

  const cancelEdit = () => {
    setGrid(cloneGrid(props.initialGrid));
    setEditing(false);
  };

  const updateCell = (day: number, slot: number, next: PerfCellState) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      copy[day][slot] = next;
      return copy;
    });
  };

  const setKind = (day: number, slot: number, kind: PerfCellState["kind"]) => {
    const previous = grid[day][slot];
    const note = previous.note ?? "";
    const startMin = previous.startMin ?? 480;
    const endMin = previous.endMin ?? 600;
    if (kind === "empty") updateCell(day, slot, { kind: "empty" });
    else if (kind === "rest") updateCell(day, slot, { kind: "rest" });
    else if (kind === "review")
      updateCell(day, slot, { kind: "review", subjectId: "", startMin, endMin, note });
    else
      updateCell(day, slot, {
        kind: "practice",
        subjectId: "",
        resourceId: null,
        count: previous.count ?? 10,
        startMin,
        endMin,
        note,
      });
  };

  const setSubject = (day: number, slot: number, subjectId: string) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      const cell = copy[day][slot];
      if (cell.kind === "review") copy[day][slot] = { ...cell, subjectId };
      else if (cell.kind === "practice")
        copy[day][slot] = { ...cell, subjectId, resourceId: null };
      return copy;
    });
  };

  const perfLabel = (cell: PerfCellState) => {
    if (cell.kind === "empty") return <span className="muted">—</span>;
    if (cell.kind === "rest") return <span className="panel-rest">استراحت</span>;
    const subject = cell.subjectId ? subjectTitles.get(cell.subjectId) ?? "درس" : "درس";
    const times = `${faTime(cell.startMin)}–${faTime(cell.endMin)}`;
    if (cell.kind === "review") {
      return (
        <>
          <strong>مرور · {subject}</strong>
          <div dir="ltr" className="muted" style={{ fontSize: "0.74rem", textAlign: "right" }}>
            {times}
          </div>
        </>
      );
    }
    const resource = cell.resourceId ? resourceTitles.get(cell.resourceId) : null;
    return (
      <>
        <strong>تمرین · {subject}</strong>
        {resource ? (
          <div className="muted" style={{ fontSize: "0.74rem" }}>{resource}</div>
        ) : null}
        <div dir="ltr" className="muted" style={{ fontSize: "0.74rem", textAlign: "right" }}>
          {times}
        </div>
        <div style={{ fontSize: "0.74rem" }}>
          {typeof cell.count === "number" ? cell.count.toLocaleString("fa-IR") : "۰"} تمرین
        </div>
      </>
    );
  };

  const cellBody = (day: number, slot: number) => {
    const planned = props.plannedLabels[day]?.[slot] ?? "—";
    const perf = grid[day]?.[slot] ?? { kind: "empty" };
    const note = perf.note?.trim();

    if (editing) {
      return (
        <div className="perf-edit-wrap">
          <span className="perf-tag">برنامه: {planned}</span>
          <div className="panel-edit">
            <select
              aria-label={`نوع عملکرد ${props.weekdayLabels[day]} بازه ${props.slotLabels[slot]}`}
              value={perf.kind}
              onChange={(event) =>
                setKind(day, slot, event.target.value as PerfCellState["kind"])
              }
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {(perf.kind === "review" || perf.kind === "practice") && (
              <>
                <select
                  aria-label={`درس ${props.weekdayLabels[day]} بازه ${props.slotLabels[slot]}`}
                  value={perf.subjectId ?? ""}
                  onChange={(event) => setSubject(day, slot, event.target.value)}
                >
                  <option value="">درس را انتخاب کنید…</option>
                  {props.subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.title}
                    </option>
                  ))}
                </select>
                {perf.kind === "practice" && perf.subjectId && (
                  <select
                    aria-label={`منبع ${props.weekdayLabels[day]} بازه ${props.slotLabels[slot]}`}
                    value={perf.resourceId ?? ""}
                    onChange={(event) =>
                      updateCell(day, slot, {
                        ...perf,
                        resourceId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">منبع (اختیاری)…</option>
                    {props.resources
                      .filter((resource) => resource.subjectId === perf.subjectId)
                      .map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.title}
                        </option>
                      ))}
                  </select>
                )}
                {perf.kind === "practice" && (
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    aria-label={`تعداد تمرین ${props.weekdayLabels[day]} بازه ${props.slotLabels[slot]}`}
                    value={perf.count ?? 0}
                    onChange={(event) =>
                      updateCell(day, slot, {
                        ...perf,
                        count: Math.max(0, Math.round(Number(event.target.value) || 0)),
                      })
                    }
                  />
                )}
                <select
                  aria-label={`شروع ${props.weekdayLabels[day]} بازه ${props.slotLabels[slot]}`}
                  value={perf.startMin ?? 480}
                  onChange={(event) =>
                    updateCell(day, slot, { ...perf, startMin: Number(event.target.value) })
                  }
                >
                  {timeChoices.map((option) => (
                    <option key={option.value} value={option.value}>
                      شروع: {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`پایان ${props.weekdayLabels[day]} بازه ${props.slotLabels[slot]}`}
                  value={perf.endMin ?? 600}
                  onChange={(event) =>
                    updateCell(day, slot, { ...perf, endMin: Number(event.target.value) })
                  }
                >
                  {timeChoices.map((option) => (
                    <option key={option.value} value={option.value}>
                      پایان: {option.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            <input
              type="text"
              placeholder="توضیحات…"
              aria-label={`توضیحات ${props.weekdayLabels[day]} بازه ${props.slotLabels[slot]}`}
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
              <th>روز / ساعت</th>
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
                  <td key={slot} className="panel-cell">
                    {cellBody(day, slot)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
