"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "./submit-button";

export type PanelCellState = {
  kind: "empty" | "rest" | "review" | "test";
  subjectId?: string;
  resourceId?: string | null;
  count?: number;
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
  subjects: { id: string; title: string }[];
  resources: { id: string; subjectId: string; title: string }[];
  action: (formData: FormData) => Promise<void>;
};

const KIND_OPTIONS: { value: PanelCellState["kind"]; label: string }[] = [
  { value: "empty", label: "خالی" },
  { value: "rest", label: "استراحت" },
  { value: "review", label: "مرور" },
  { value: "test", label: "تمرین" },
];

function cloneGrid(grid: PanelCellState[][]): PanelCellState[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

export function WeekGridEditor(props: WeekGridEditorProps) {
  const [editing, setEditing] = useState(false);
  const [grid, setGrid] = useState<PanelCellState[][]>(() => cloneGrid(props.initialGrid));
  const [routine, setRoutine] = useState(props.initialRoutine);
  const [homework, setHomework] = useState(props.initialHomework);

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
    setRoutine(props.initialRoutine);
    setHomework(props.initialHomework);
    setEditing(true);
  };

  const cancelEdit = () => {
    setGrid(cloneGrid(props.initialGrid));
    setRoutine(props.initialRoutine);
    setHomework(props.initialHomework);
    setEditing(false);
  };

  const updateCell = (day: number, slot: number, next: PanelCellState) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      copy[day][slot] = next;
      return copy;
    });
  };

  const setKind = (day: number, slot: number, kind: PanelCellState["kind"]) => {
    if (kind === "empty") updateCell(day, slot, { kind: "empty" });
    else if (kind === "rest") updateCell(day, slot, { kind: "rest" });
    else if (kind === "review") updateCell(day, slot, { kind: "review", subjectId: "" });
    else updateCell(day, slot, { kind: "test", subjectId: "", resourceId: null, count: 10 });
  };

  const setSubject = (day: number, slot: number, subjectId: string) => {
    setGrid((current) => {
      const copy = cloneGrid(current);
      const cell = copy[day][slot];
      if (cell.kind === "review") copy[day][slot] = { ...cell, subjectId };
      else if (cell.kind === "test") copy[day][slot] = { ...cell, subjectId, resourceId: null };
      return copy;
    });
  };

  const cellLabel = (cell: PanelCellState) => {
    if (cell.kind === "empty") return <span className="muted">—</span>;
    if (cell.kind === "rest") return <span className="panel-rest">استراحت</span>;
    const title = cell.subjectId ? subjectTitles.get(cell.subjectId) ?? "درس" : "درس";
    if (cell.kind === "review") {
      return (
        <>
          <strong>مرور</strong>
          <div className="muted" style={{ fontSize: "0.76rem" }}>{title}</div>
        </>
      );
    }
    const resource = cell.resourceId ? resourceTitles.get(cell.resourceId) : null;
    return (
      <>
        <strong>تمرین</strong>
        <div className="muted" style={{ fontSize: "0.76rem" }}>
          {title}
          {resource ? ` — ${resource}` : ""}
        </div>
        <div style={{ fontSize: "0.76rem" }}>
          {typeof cell.count === "number" ? cell.count.toLocaleString("fa-IR") : "۰"} تمرین
        </div>
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
          ستون‌ها بازه‌های دو ساعت‌اند و ردیف‌ها روزهای هفته. با «ویرایش» همه خانه‌ها قابل تغییر می‌شوند و با
          «ثبت تغییرات» کل جدول یکجا ذخیره می‌شود.
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
                  <td key={slot} className={cell.kind === "rest" ? "panel-cell is-rest" : "panel-cell"}>
                    {!editing ? (
                      cellLabel(cell)
                    ) : (
                      <div className="panel-edit">
                        <select
                          aria-label={`نوع کار ${label} بازه ${slot + 1}`}
                          value={cell.kind}
                          onChange={(event) => setKind(day, slot, event.target.value as PanelCellState["kind"])}
                        >
                          {KIND_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {(cell.kind === "review" || cell.kind === "test") && (
                          <select
                            aria-label={`درس ${label} بازه ${slot + 1}`}
                            value={cell.subjectId ?? ""}
                            onChange={(event) => setSubject(day, slot, event.target.value)}
                          >
                            <option value="">درس را انتخاب کنید…</option>
                            {props.subjects.map((subject) => (
                              <option key={subject.id} value={subject.id}>
                                {subject.title}
                              </option>
                            ))}
                          </select>
                        )}
                        {cell.kind === "test" && cell.subjectId && (
                          <>
                            <select
                              aria-label={`منبع ${label} بازه ${slot + 1}`}
                              value={cell.resourceId ?? ""}
                              onChange={(event) =>
                                updateCell(day, slot, {
                                  ...cell,
                                  resourceId: event.target.value || null,
                                })
                              }
                            >
                              <option value="">منبع (اختیاری)…</option>
                              {props.resources
                                .filter((resource) => resource.subjectId === cell.subjectId)
                                .map((resource) => (
                                  <option key={resource.id} value={resource.id}>
                                    {resource.title}
                                  </option>
                                ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={1000}
                              aria-label={`تعداد تمرین ${label} بازه ${slot + 1}`}
                              value={cell.count ?? 0}
                              onChange={(event) =>
                                updateCell(day, slot, {
                                  ...cell,
                                  count: Math.max(0, Math.round(Number(event.target.value) || 0)),
                                })
                              }
                            />
                          </>
                        )}
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
