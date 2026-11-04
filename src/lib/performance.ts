import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  performancePanels,
  plans,
  resources,
  students,
  subjects,
  tasks,
  users,
  type PerformanceCellJson,
  type PerformanceGridJson,
  type WeeklyGridJson,
} from "@/db/schema";
import { addDays, startOfWeekSaturday, tehranDateTime, weekDates } from "./dates";
import { getWeeklyPanelView, PANEL_DAYS, PANEL_SLOTS } from "./panel";
import { diffResourcePracticeCounts } from "./resource-progress";

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

  const [subjectRows, resourceRows, existingPanelRows] = await Promise.all([
    db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.workspaceId, studentRow.workspaceId)),
    db
      .select({
        id: resources.id,
        subjectId: resources.subjectId,
        totalUnits: resources.totalUnits,
        completedUnits: resources.completedUnits,
      })
      .from(resources)
      .where(eq(resources.studentId, input.studentId)),
    db
      .select({ cellsJson: performancePanels.cellsJson })
      .from(performancePanels)
      .where(
        and(
          eq(performancePanels.studentId, input.studentId),
          eq(performancePanels.weekStart, input.weekStart),
        ),
      )
      .limit(1),
  ]);

  const subjectIds = new Set(subjectRows.map((row) => row.id));
  const resourceById = new Map(resourceRows.map((row) => [row.id, row]));

  for (const row of grid) {
    for (const cell of row) {
      if (cell.kind === "review" || cell.kind === "practice") {
        if (!subjectIds.has(cell.subjectId)) {
          throw new PerformanceValidationError("یکی از درس‌های ثبت عملکرد معتبر نیست.");
        }
      }
      if (cell.kind === "practice" && cell.resourceId) {
        const resource = resourceById.get(cell.resourceId);
        if (!resource) {
          throw new PerformanceValidationError("یکی از منابع ثبت عملکرد معتبر نیست.");
        }
        if (resource.subjectId !== cell.subjectId) {
          throw new PerformanceValidationError("منبع انتخاب‌شده با درس عملکرد هم‌خوان نیست.");
        }
      }
    }
  }

  const previousGrid = existingPanelRows[0]?.cellsJson
    ? normalizePerfGrid(existingPanelRows[0].cellsJson)
    : null;
  const deltas = diffResourcePracticeCounts(previousGrid, grid);

  await db.transaction(async (tx) => {
    await tx
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

    for (const [resourceId, delta] of deltas) {
      if (!resourceById.has(resourceId) || delta === 0) continue;
      await tx
        .update(resources)
        .set({
          completedUnits: sql`least(greatest(${resources.totalUnits}, 0), greatest(0, ${resources.completedUnits} + ${delta}))`,
        })
        .where(eq(resources.id, resourceId));
    }

    const [plan] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(
        and(
          eq(plans.studentId, input.studentId),
          eq(plans.weekStart, input.weekStart),
        ),
      )
      .limit(1);

    if (!plan) return;

    const dates = weekDates(input.weekStart);
    const planTasks = await tx.select().from(tasks).where(eq(tasks.planId, plan.id));

    for (const task of planTasks) {
      const day = dates.indexOf(task.planDate);
      if (day < 0) continue;
      const slot = PANEL_SLOTS.findIndex(
        (candidate) =>
          task.plannedStart >= candidate.startMin && task.plannedStart < candidate.endMin,
      );
      if (slot < 0) continue;
      const cell = grid[day]?.[slot];
      if (!cell) continue;

      if (cell.kind === "practice" || cell.kind === "review") {
        await tx
          .update(tasks)
          .set({
            status: "done",
            actualStartedAt: tehranDateTime(task.planDate, cell.startMin),
            actualEndedAt: tehranDateTime(task.planDate, cell.endMin),
            actualUnits: cell.kind === "practice" ? cell.count : 0,
          })
          .where(eq(tasks.id, task.id));
      } else {
        await tx
          .update(tasks)
          .set({
            status: "pending",
            actualStartedAt: null,
            actualEndedAt: null,
            actualUnits: 0,
          })
          .where(eq(tasks.id, task.id));
      }
    }
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

const ONPLAN_MAX_DIFF_MIN = 30;

function plannedKind(cell: { kind: string } | undefined): boolean {
  return cell?.kind === "review" || cell?.kind === "test";
}

type PerfActivityCell = Extract<PerformanceCellJson, { kind: "review" | "practice" }>;

export function buildPerformanceAnalysis(
  weekStart: string,
  planGrid: WeeklyGridJson | null,
  perfGrid: PerformanceGridJson,
  plannedStartByDate?: Map<string, number>,
): PerformanceAnalysis {
  const dates = weekDates(weekStart);
  const days: DayStartStatus[] = [];

  for (let day = 0; day < PANEL_DAYS; day += 1) {
    const gridPlannedStartMin = (() => {
      if (!planGrid) return null;
      for (let slot = 0; slot < PANEL_SLOTS.length; slot += 1) {
        if (plannedKind(planGrid[day]?.[slot])) return PANEL_SLOTS[slot].startMin;
      }
      return null;
    })();
    const plannedStartMin = plannedStartByDate?.get(dates[day]) ?? gridPlannedStartMin;

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

    const firstPerformed = performed.length
      ? [...performed].sort((a, b) => a.cell.startMin - b.cell.startMin)[0]
      : null;
    const performedStartMin = firstPerformed?.cell.startMin ?? null;
    const performedEndMin = firstPerformed?.cell.endMin ?? null;

    const status: DayStartStatus["status"] =
      performedStartMin === null
        ? "none"
        : plannedStartMin !== null &&
            Math.abs(performedStartMin - plannedStartMin) <= ONPLAN_MAX_DIFF_MIN
          ? "onplan"
          : "offplan";

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
  const [plan, perf] = await Promise.all([
    getWeeklyPanelView(studentId, weekStart),
    getPerformanceView(studentId, weekStart),
  ]);
  return buildPerformanceAnalysis(weekStart, plan.grid, perf.grid);
}

export type PerformanceRangeData = {
  analysis: PerformanceAnalysis;
  plannedSubjectsByDay: string[][];
  notes: { weekday: number; slot: number; text: string }[];
  dailyRoutine: string;
};

export async function getPerformanceRangeData(
  studentId: string,
  from: string,
  to: string,
): Promise<PerformanceRangeData> {
  const db = await getDb();
  const [studentRow] = await db
    .select({ workspaceId: students.workspaceId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  if (!studentRow) throw new Error("student not found");

  const subjectRows = await db
    .select({ id: subjects.id, title: subjects.title })
    .from(subjects)
    .where(eq(subjects.workspaceId, studentRow.workspaceId));
  const subjectTitles = new Map(subjectRows.map((row) => [row.id, row.title]));

  const days: DayStartStatus[] = [];
  const plannedSubjectsByDay: string[][] = [];
  const notes: { weekday: number; slot: number; text: string }[] = [];
  let dailyRoutine = "";

  if (from <= to) {
    let weekStart = startOfWeekSaturday(from);
    while (weekStart <= to) {
      const [planView, perfView, planRows] = await Promise.all([
        getWeeklyPanelView(studentId, weekStart),
        getPerformanceView(studentId, weekStart),
        db
          .select({ id: plans.id })
          .from(plans)
          .where(and(eq(plans.studentId, studentId), eq(plans.weekStart, weekStart)))
          .limit(1),
      ]);

      const plan = planRows[0];
      const taskRows = plan
        ? await db
            .select({ planDate: tasks.planDate, plannedStart: tasks.plannedStart })
            .from(tasks)
            .where(eq(tasks.planId, plan.id))
        : [];
      const plannedStartByDate = new Map<string, number>();
      for (const task of taskRows) {
        const current = plannedStartByDate.get(task.planDate);
        if (current === undefined || task.plannedStart < current) {
          plannedStartByDate.set(task.planDate, task.plannedStart);
        }
      }

      const weekAnalysis = buildPerformanceAnalysis(
        weekStart,
        planView.grid,
        perfView.grid,
        plannedStartByDate,
      );
      const dates = weekDates(weekStart);

      for (let dayIndex = 0; dayIndex < PANEL_DAYS; dayIndex += 1) {
        const date = dates[dayIndex];
        if (date < from || date > to) continue;
        days.push(weekAnalysis.days[dayIndex]);

        const plannedRow = planView.grid[dayIndex] ?? [];
        plannedSubjectsByDay.push([
          ...new Set(
            plannedRow
              .filter((cell) => cell.kind === "review" || cell.kind === "test")
              .map((cell) => subjectTitles.get(cell.subjectId) ?? "درس"),
          ),
        ]);

        const perfRow = perfView.grid[dayIndex] ?? [];
        perfRow.forEach((cell, slot) => {
          const note = cell.kind === "review" || cell.kind === "practice" ? cell.note.trim() : "";
          if (note) notes.push({ weekday: dayIndex, slot, text: note.slice(0, 300) });
        });
      }

      if (planView.dailyRoutine.trim()) dailyRoutine = planView.dailyRoutine;
      weekStart = addDays(weekStart, 7);
    }
  }

  const activeDays = days.filter((day) => day.performedStartMin !== null).length;
  const onplanDays = days.filter((day) => day.status === "onplan").length;
  const offplanDays = days.filter((day) => day.status === "offplan").length;
  const totalMinutes = days.reduce((sum, day) => sum + day.performedMinutes, 0);
  const totalPractice = days.reduce((sum, day) => sum + day.practiceCount, 0);

  return {
    analysis: {
      weekStart: from,
      dates: days.map((day) => day.date),
      days,
      activeDays,
      onplanDays,
      offplanDays,
      totalMinutes,
      totalPractice,
      hasAnyData: activeDays > 0,
    },
    plannedSubjectsByDay,
    notes,
    dailyRoutine,
  };
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
