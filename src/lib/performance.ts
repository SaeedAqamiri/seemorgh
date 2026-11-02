import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  performancePanels,
  resources,
  students,
  subjects,
  users,
  weeklyPanels,
  type PerformanceCellJson,
  type PerformanceGridJson,
  type WeeklyGridJson,
} from "@/db/schema";
import { weekDates } from "./dates";
import { PANEL_DAYS, PANEL_SLOTS } from "./panel";

export { PANEL_DAYS, PANEL_SLOTS };

export type PerfCellState = {
  kind: "empty" | "rest" | "review" | "practice";
  startMin?: number;
  endMin?: number;
  count?: number;
  note?: string;
};

export type PerformanceView = {
  weekStart: string;
  grid: PerformanceGridJson;
  narrative: string;
  narrativeAt: Date | null;
  updatedAt: Date | null;
  updatedByName: string | null;
};

export class PerformanceValidationError extends Error {}

export function emptyPerformanceGrid(): PerformanceGridJson {
  return Array.from({ length: PANEL_DAYS }, () =>
    Array.from({ length: PANEL_SLOTS.length }, () => ({ kind: "empty" }) satisfies PerformanceCellJson),
  );
}

export function normalizePerfCell(value: unknown): PerformanceCellJson {
  if (!value || typeof value !== "object") return { kind: "empty" };
  const cell = value as Record<string, unknown>;
  const kind = cell.kind;
  const note = typeof cell.note === "string" ? cell.note.trim().slice(0, 500) : "";
  const subjectId =
    typeof cell.subjectId === "string" && cell.subjectId ? cell.subjectId : "";
  const clampMinute = (input: unknown): number => {
    const raw = Number(input);
    if (!Number.isFinite(raw)) return NaN;
    return Math.max(0, Math.min(1440, Math.round(raw)));
  };
  const validTimes = (rawStart: unknown, rawEnd: unknown) => {
    const startMin = clampMinute(rawStart);
    const endMin = clampMinute(rawEnd);
    return Number.isFinite(startMin) && Number.isFinite(endMin) && endMin > startMin
      ? { startMin, endMin }
      : null;
  };

  if (kind === "rest") return { kind: "rest" };

  if (kind === "review") {
    if (!subjectId) return { kind: "empty" };
    const times = validTimes(cell.startMin, cell.endMin);
    if (!times) return { kind: "empty" };
    return { kind: "review", subjectId, ...times, note };
  }

  if (kind === "practice") {
    if (!subjectId) return { kind: "empty" };
    const times = validTimes(cell.startMin, cell.endMin);
    if (!times) return { kind: "empty" };
    const rawCount = Number(cell.count);
    const count = Number.isFinite(rawCount) ? Math.max(0, Math.min(1000, Math.round(rawCount))) : 0;
    return {
      kind: "practice",
      subjectId,
      resourceId: typeof cell.resourceId === "string" && cell.resourceId ? cell.resourceId : null,
      count,
      ...times,
      note,
    };
  }

  return { kind: "empty" };
}

export function normalizePerfGrid(value: unknown): PerformanceGridJson {
  const grid = emptyPerformanceGrid();
  if (!Array.isArray(value)) return grid;
  for (let day = 0; day < Math.min(PANEL_DAYS, value.length); day += 1) {
    const row = value[day];
    if (!Array.isArray(row)) continue;
    for (let slot = 0; slot < Math.min(PANEL_SLOTS.length, row.length); slot += 1) {
      grid[day][slot] = normalizePerfCell(row[slot]);
    }
  }
  return grid;
}

function assertPerfGrid(value: unknown): asserts value is PerformanceGridJson {
  if (!Array.isArray(value) || value.length !== PANEL_DAYS) {
    throw new PerformanceValidationError("ساختار جدول عملکرد نامعتبر است.");
  }
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== PANEL_SLOTS.length) {
      throw new PerformanceValidationError("ساختار جدول عملکرد نامعتبر است.");
    }
    for (const cell of row) {
      if (!cell || typeof cell !== "object") {
        throw new PerformanceValidationError("ساختار خانه‌های عملکرد نامعتبر است.");
      }
      const c = cell as PerformanceCellJson;
      if (c.kind === "review" || c.kind === "practice") {
        if (!c.subjectId) {
          throw new PerformanceValidationError("برای مرور یا تمرین باید درس انتخاب شود.");
        }
        if (
          !Number.isInteger(c.startMin) ||
          !Number.isInteger(c.endMin) ||
          c.startMin < 0 ||
          c.endMin > 1440 ||
          c.endMin <= c.startMin
        ) {
          throw new PerformanceValidationError("ساعت شروع/پایان باید معتبر و پایان بعد از شروع باشد.");
        }
      }
      if (c.kind === "practice" && (!Number.isInteger(c.count) || c.count < 0)) {
        throw new PerformanceValidationError("تعداد تمرین باید عدد صحیح و نامنفی باشد.");
      }
    }
  }
}

export async function getPerformanceView(studentId: string, weekStart: string): Promise<PerformanceView> {
  const db = await getDb();
  const [panel] = await db
    .select()
    .from(performancePanels)
    .where(and(eq(performancePanels.studentId, studentId), eq(performancePanels.weekStart, weekStart)))
    .limit(1);

  let updatedByName: string | null = null;
  if (panel?.updatedBy) {
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, panel.updatedBy))
      .limit(1);
    updatedByName = author?.name ?? null;
  }

  return {
    weekStart,
    grid: panel?.cellsJson ? normalizePerfGrid(panel.cellsJson) : emptyPerformanceGrid(),
    narrative: panel?.narrative ?? "",
    narrativeAt: panel?.narrativeAt ?? null,
    updatedAt: panel?.updatedAt ?? null,
    updatedByName,
  };
}

export type SavePerformanceInput = {
  studentId: string;
  weekStart: string;
  grid: unknown;
  actorId: string;
};

export async function savePerformancePanel(input: SavePerformanceInput): Promise<void> {
  assertPerfGrid(input.grid);
  const grid = normalizePerfGrid(input.grid);

  const db = await getDb();
  const [studentRow] = await db
    .select({ id: students.id, workspaceId: students.workspaceId })
    .from(students)
    .where(eq(students.id, input.studentId))
    .limit(1);
  if (!studentRow) throw new PerformanceValidationError("دانش‌آموز پیدا نشد.");

  const [subjectRows, resourceRows] = await Promise.all([
    db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.workspaceId, studentRow.workspaceId)),
    db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.studentId, input.studentId)),
  ]);

  const subjectIds = new Set(subjectRows.map((row) => row.id));
  const resourceIds = new Set(resourceRows.map((row) => row.id));

  for (const row of grid) {
    for (const cell of row) {
      if (cell.kind === "review" || cell.kind === "practice") {
        if (!subjectIds.has(cell.subjectId)) {
          throw new PerformanceValidationError("یکی از درس‌های ثبت عملکرد معتبر نیست.");
        }
      }
      if (cell.kind === "practice" && cell.resourceId && !resourceIds.has(cell.resourceId)) {
        throw new PerformanceValidationError("یکی از منابع ثبت عملکرد معتبر نیست.");
      }
    }
  }

  await db
    .insert(performancePanels)
    .values({
      studentId: input.studentId,
      weekStart: input.weekStart,
      cellsJson: grid,
      updatedBy: input.actorId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [performancePanels.studentId, performancePanels.weekStart],
      set: {
        cellsJson: grid,
        updatedBy: input.actorId,
        updatedAt: new Date(),
      },
    });
}

export type DayStartStatus = {
  date: string;
  weekday: number;
  plannedStartMin: number | null;
  performedStartMin: number | null;
  performedEndMin: number | null;
  status: "onplan" | "offplan" | "none";
  performedMinutes: number;
  practiceCount: number;
};

export type PerformanceAnalysis = {
  weekStart: string;
  dates: string[];
  days: DayStartStatus[];
  activeDays: number;
  onplanDays: number;
  offplanDays: number;
  totalMinutes: number;
  totalPractice: number;
  hasAnyData: boolean;
};

const ONPLAN_EARLY_GRACE_MIN = 5;
const ONPLAN_LATE_WINDOW_MIN = 30;

function plannedKind(cell: { kind: string } | undefined): boolean {
  return cell?.kind === "review" || cell?.kind === "test";
}

type PerfActivityCell = Extract<PerformanceCellJson, { kind: "review" | "practice" }>;

export function buildPerformanceAnalysis(
  weekStart: string,
  planGrid: WeeklyGridJson | null,
  perfGrid: PerformanceGridJson,
): PerformanceAnalysis {
  const dates = weekDates(weekStart);
  const days: DayStartStatus[] = [];

  for (let day = 0; day < PANEL_DAYS; day += 1) {
    const plannedStartMin = (() => {
      if (!planGrid) return null;
      for (let slot = 0; slot < PANEL_SLOTS.length; slot += 1) {
        if (plannedKind(planGrid[day]?.[slot])) return PANEL_SLOTS[slot].startMin;
      }
      return null;
    })();

    const performed = perfGrid[day]
      .map((cell, slot) => ({ cell, slot }))
      .filter(
        (entry): entry is { cell: PerfActivityCell; slot: number } =>
          (entry.cell.kind === "review" || entry.cell.kind === "practice") &&
          Number.isInteger(entry.cell.startMin),
      );

    const performedMinutes = performed.reduce(
      (sum, entry) => sum + (entry.cell.endMin - entry.cell.startMin),
      0,
    );
    const practiceCount = performed.reduce(
      (sum, entry) => sum + (entry.cell.kind === "practice" ? entry.cell.count : 0),
      0,
    );

    const firstPlannedWithWork = (() => {
      for (let slot = 0; slot < PANEL_SLOTS.length; slot += 1) {
        const planned = planGrid?.[day]?.[slot];
        const done = perfGrid[day]?.[slot];
        const doneIsActivity = done?.kind === "review" || done?.kind === "practice";
        if (plannedKind(planned) && doneIsActivity) {
          const activity = done as PerfActivityCell;
          return {
            plannedStartMin: PANEL_SLOTS[slot].startMin,
            performedStartMin: activity.startMin,
            performedEndMin: activity.endMin,
          };
        }
      }
      return null;
    })();

    let status: DayStartStatus["status"] = "none";
    let performedStartMin: number | null = null;
    let performedEndMin: number | null = null;

    if (firstPlannedWithWork) {
      performedStartMin = firstPlannedWithWork.performedStartMin;
      performedEndMin = firstPlannedWithWork.performedEndMin;
      const diff = (performedStartMin ?? 0) - firstPlannedWithWork.plannedStartMin;
      status =
        diff >= -ONPLAN_EARLY_GRACE_MIN && diff <= ONPLAN_LATE_WINDOW_MIN ? "onplan" : "offplan";
    } else if (performed.length > 0) {
      const first = [...performed].sort((a, b) => a.cell.startMin - b.cell.startMin)[0];
      performedStartMin = first.cell.startMin;
      performedEndMin = first.cell.endMin;
      status = "offplan";
    }

    days.push({
      date: dates[day],
      weekday: day,
      plannedStartMin,
      performedStartMin,
      performedEndMin,
      status,
      performedMinutes,
      practiceCount,
    });
  }

  const activeDays = days.filter((day) => day.performedStartMin !== null).length;
  const onplanDays = days.filter((day) => day.status === "onplan").length;
  const offplanDays = days.filter((day) => day.status === "offplan").length;
  const totalMinutes = days.reduce((sum, day) => sum + day.performedMinutes, 0);
  const totalPractice = days.reduce((sum, day) => sum + day.practiceCount, 0);

  return {
    weekStart,
    dates,
    days,
    activeDays,
    onplanDays,
    offplanDays,
    totalMinutes,
    totalPractice,
    hasAnyData: activeDays > 0,
  };
}

export async function getPerformanceAnalysis(
  studentId: string,
  weekStart: string,
): Promise<PerformanceAnalysis> {
  const db = await getDb();
  const [panel] = await db
    .select({ gridJson: weeklyPanels.gridJson })
    .from(weeklyPanels)
    .where(and(eq(weeklyPanels.studentId, studentId), eq(weeklyPanels.weekStart, weekStart)))
    .limit(1);
  const perf = await getPerformanceView(studentId, weekStart);
  return buildPerformanceAnalysis(weekStart, panel?.gridJson ?? null, perf.grid);
}

export type StudentOption = { id: string; name: string };

export async function listActiveStudents(workspaceId: string): Promise<StudentOption[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: students.id, name: students.name })
    .from(students)
    .where(and(eq(students.workspaceId, workspaceId), eq(students.status, "active")))
    .orderBy(asc(students.name));
  return rows;
}
