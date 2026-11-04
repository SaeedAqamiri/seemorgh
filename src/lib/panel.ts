import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  plans,
  resources,
  students,
  subjects,
  tasks,
  users,
  weeklyPanels,
  type PanelCellJson,
  type WeeklyGridJson,
} from "@/db/schema";
import { weekDates } from "./dates";

export const PANEL_DAYS = 7;
export const PANEL_SLOTS = [
  { startMin: 480, endMin: 600 },
  { startMin: 600, endMin: 720 },
  { startMin: 720, endMin: 840 },
  { startMin: 840, endMin: 960 },
  { startMin: 960, endMin: 1080 },
  { startMin: 1080, endMin: 1200 },
] as const;

export type PanelSlot = (typeof PANEL_SLOTS)[number];

export type PanelView = {
  weekStart: string;
  grid: WeeklyGridJson;
  dailyRoutine: string;
  nextWeekHomework: string;
  planId: string | null;
  planStatus: string | null;
  updatedAt: Date | null;
  updatedByName: string | null;
};

export function slotLabel(slot: { startMin: number; endMin: number }): string {
  const fa = (minutes: number) =>
    (minutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 0 });
  return `${fa(slot.startMin)} تا ${fa(slot.endMin)}`;
}

export function faNumber(value: number): string {
  return value.toLocaleString("fa-IR");
}

export function plannedCellLabel(
  cell: PanelCellJson | undefined,
  subjectTitles: Map<string, string>,
  resourceTitles: Map<string, string>,
): string {
  if (!cell) return "—";
  if (cell.kind === "rest") return "استراحت";
  if (cell.kind === "review") return `مرور · ${subjectTitles.get(cell.subjectId) ?? "درس"}`;
  if (cell.kind === "test") {
    const parts = [`تمرین · ${subjectTitles.get(cell.subjectId) ?? "درس"}`];
    if (cell.resourceId) {
      const resource = resourceTitles.get(cell.resourceId);
      if (resource) parts.push(resource);
    }
    if (cell.count > 0) parts.push(`${faNumber(cell.count)} تمرین`);
    return parts.join(" · ");
  }
  return "—";
}

export function emptyGrid(): WeeklyGridJson {
  return Array.from({ length: PANEL_DAYS }, () =>
    Array.from({ length: PANEL_SLOTS.length }, () => ({ kind: "empty" }) satisfies PanelCellJson),
  );
}

export function normalizeCell(value: unknown): PanelCellJson {
  if (!value || typeof value !== "object") return { kind: "empty" };
  const cell = value as Record<string, unknown>;
  const kind = cell.kind;
  if (kind === "rest") return { kind: "rest" };
  if (kind === "review" && typeof cell.subjectId === "string" && cell.subjectId) {
    return { kind: "review", subjectId: cell.subjectId };
  }
  if (kind === "test" && typeof cell.subjectId === "string" && cell.subjectId) {
    const rawCount = Number(cell.count);
    const count = Number.isFinite(rawCount) ? Math.max(0, Math.min(1000, Math.round(rawCount))) : 0;
    return {
      kind: "test",
      subjectId: cell.subjectId,
      resourceId: typeof cell.resourceId === "string" && cell.resourceId ? cell.resourceId : null,
      count,
    };
  }
  return { kind: "empty" };
}

export function normalizeGrid(value: unknown): WeeklyGridJson {
  const grid = emptyGrid();
  if (!Array.isArray(value)) return grid;
  for (let day = 0; day < Math.min(PANEL_DAYS, value.length); day += 1) {
    const row = value[day];
    if (!Array.isArray(row)) continue;
    for (let slot = 0; slot < Math.min(PANEL_SLOTS.length, row.length); slot += 1) {
      grid[day][slot] = normalizeCell(row[slot]);
    }
  }
  return grid;
}

export class PanelValidationError extends Error {}

function assertGrid(value: unknown): asserts value is WeeklyGridJson {
  if (!Array.isArray(value) || value.length !== PANEL_DAYS) {
    throw new PanelValidationError("ساختار جدول نامعتبر است.");
  }
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== PANEL_SLOTS.length) {
      throw new PanelValidationError("ساختار جدول نامعتبر است.");
    }
    for (const cell of row) {
      if (!cell || typeof cell !== "object") {
        throw new PanelValidationError("ساختار خانه‌ها نامعتبر است.");
      }
      const c = cell as PanelCellJson;
      if (c.kind === "review" && !c.subjectId) {
        throw new PanelValidationError("برای مرور باید درس انتخاب شود.");
      }
      if (c.kind === "test") {
        if (!c.subjectId) throw new PanelValidationError("برای تست باید درس انتخاب شود.");
        if (!Number.isInteger(c.count) || c.count < 0) {
          throw new PanelValidationError("تعداد تست باید عدد صحیح و نامنفی باشد.");
        }
      }
    }
  }
}

async function gridFromTasks(planId: string, weekStart: string): Promise<WeeklyGridJson> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.planId, planId))
    .orderBy(asc(tasks.planDate), asc(tasks.plannedStart));

  const dates = weekDates(weekStart);
  const grid = emptyGrid();

  for (const task of rows) {
    const day = dates.indexOf(task.planDate);
    if (day < 0) continue;
    const slotIndex = PANEL_SLOTS.findIndex(
      (slot) => task.plannedStart >= slot.startMin && task.plannedStart < slot.endMin,
    );
    if (slotIndex < 0) continue;
    if (grid[day][slotIndex].kind !== "empty") continue;

    if (task.type === "test") {
      grid[day][slotIndex] = {
        kind: "test",
        subjectId: task.subjectId,
        resourceId: task.resourceId,
        count: task.targetUnits,
      };
    } else {
      grid[day][slotIndex] = { kind: "review", subjectId: task.subjectId };
    }
  }

  return grid;
}

export async function getWeeklyPanelView(studentId: string, weekStart: string): Promise<PanelView> {
  const db = await getDb();
  const [panel] = await db
    .select()
    .from(weeklyPanels)
    .where(and(eq(weeklyPanels.studentId, studentId), eq(weeklyPanels.weekStart, weekStart)))
    .limit(1);

  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.studentId, studentId), eq(plans.weekStart, weekStart)))
    .limit(1);

  const grid = panel?.gridJson
    ? normalizeGrid(panel.gridJson)
    : plan
      ? await gridFromTasks(plan.id, weekStart)
      : emptyGrid();

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
    grid,
    dailyRoutine: panel?.dailyRoutine ?? "",
    nextWeekHomework: panel?.nextWeekHomework ?? "",
    planId: plan?.id ?? null,
    planStatus: plan?.status ?? null,
    updatedAt: panel?.updatedAt ?? null,
    updatedByName,
  };
}

export type PanelOptions = {
  subjects: { id: string; title: string }[];
  resources: { id: string; subjectId: string; title: string }[];
};

export async function getPanelOptions(
  workspaceId: string,
  studentId: string,
): Promise<PanelOptions> {
  const db = await getDb();
  const [subjectRows, resourceRows] = await Promise.all([
    db
      .select({ id: subjects.id, title: subjects.title })
      .from(subjects)
      .where(eq(subjects.workspaceId, workspaceId))
      .orderBy(asc(subjects.title)),
    db
      .select({ id: resources.id, subjectId: resources.subjectId, title: resources.title })
      .from(resources)
      .where(and(eq(resources.workspaceId, workspaceId), eq(resources.studentId, studentId)))
      .orderBy(asc(resources.title)),
  ]);
  return { subjects: subjectRows, resources: resourceRows };
}

export type SavePanelInput = {
  studentId: string;
  weekStart: string;
  grid: unknown;
  dailyRoutine: string;
  nextWeekHomework: string;
  actorId: string;
};

export async function saveWeeklyPanel(input: SavePanelInput): Promise<void> {
  assertGrid(input.grid);
  const grid = normalizeGrid(input.grid);

  const db = await getDb();
  const [studentRow] = await db
    .select({ id: students.id, workspaceId: students.workspaceId })
    .from(students)
    .where(eq(students.id, input.studentId))
    .limit(1);
  if (!studentRow) throw new PanelValidationError("دانش‌آموز پیدا نشد.");

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
      if (cell.kind === "review" || cell.kind === "test") {
        if (!subjectIds.has(cell.subjectId)) {
          throw new PanelValidationError("یکی از درس‌های انتخابی معتبر نیست.");
        }
      }
      if (cell.kind === "test" && cell.resourceId && !resourceIds.has(cell.resourceId)) {
        throw new PanelValidationError("یکی از منابع انتخابی معتبر نیست.");
      }
    }
  }

  const routine = input.dailyRoutine.trim().slice(0, 2000);
  const homework = input.nextWeekHomework.trim().slice(0, 2000);

  await db.transaction(async (tx) => {
    await tx
      .insert(weeklyPanels)
      .values({
        studentId: input.studentId,
        weekStart: input.weekStart,
        gridJson: grid,
        dailyRoutine: routine,
        nextWeekHomework: homework,
        updatedBy: input.actorId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [weeklyPanels.studentId, weeklyPanels.weekStart],
        set: {
          gridJson: grid,
          dailyRoutine: routine,
          nextWeekHomework: homework,
          updatedBy: input.actorId,
          updatedAt: new Date(),
        },
      });

    const dates = weekDates(input.weekStart);
    const [existingPlan] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.studentId, input.studentId), eq(plans.weekStart, input.weekStart)))
      .limit(1);

    let planId = existingPlan?.id;
    if (!planId) {
      const [created] = await tx
        .insert(plans)
        .values({
          studentId: input.studentId,
          weekStart: input.weekStart,
          status: "approved",
          approvedAt: new Date(),
        })
        .returning();
      planId = created.id;
    }

    await tx.delete(tasks).where(eq(tasks.planId, planId));

    const taskValues: (typeof tasks.$inferInsert)[] = [];
    for (let day = 0; day < grid.length; day += 1) {
      for (let slot = 0; slot < grid[day].length; slot += 1) {
        const cell = grid[day][slot];
        if (cell.kind !== "review" && cell.kind !== "test") continue;
        const slotDef = PANEL_SLOTS[slot];
        taskValues.push({
          planId: planId,
          planDate: dates[day],
          plannedStart: slotDef.startMin,
          plannedEnd: slotDef.endMin,
          subjectId: cell.subjectId,
          resourceId: cell.kind === "test" ? cell.resourceId : null,
          topic: "",
          type: cell.kind,
          targetUnits: cell.kind === "test" ? cell.count : 0,
          estMinutes: slotDef.endMin - slotDef.startMin,
        });
      }
    }

    if (taskValues.length > 0) await tx.insert(tasks).values(taskValues);
  });
}
