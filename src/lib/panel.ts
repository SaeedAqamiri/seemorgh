import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  examTargets,
  plans,
  resources,
  students,
  subjects,
  tasks,
  users,
  weeklyPanels,
  type PanelActionKind,
  type PanelCellJson,
  type WeeklyGridJson,
} from "@/db/schema";
import { addDays, weekDates } from "./dates";
import { chaptersByResourceIds, ensureChaptersFromJson } from "./resource-chapters";
import {
  faNumber,
  getBellSlots,
  PANEL_DAYS,
  PANEL_SLOTS,
  type PanelSlot,
  slotIndexForStart,
  slotLabel,
} from "./schedule";
import { listSubjectsForField, type SubjectOption } from "./subject-catalog";

export { PANEL_DAYS, PANEL_SLOTS, faNumber, slotLabel };
export type { PanelSlot };

export const PANEL_ACTION_LABELS: Record<PanelActionKind, string> = {
  empty: "خالی",
  rest: "استراحت",
  study: "مطالعه",
  review: "مرور",
  test: "تست آموزشی",
  timedTest: "تست زمان‌دار",
  exercise: "تمرین",
  routine: "روتین",
};

export type PanelExam = { title: string; examDate: string; examType: string };

export type PanelView = {
  weekStart: string;
  grid: WeeklyGridJson;
  slots: PanelSlot[];
  exams: PanelExam[];
  dailyRoutine: string;
  nextWeekHomework: string;
  planId: string | null;
  planStatus: string | null;
  updatedAt: Date | null;
  updatedByName: string | null;
};

function isCountAction(
  cell: PanelCellJson,
): cell is Extract<PanelCellJson, { kind: "test" | "timedTest" | "exercise" }> {
  return cell.kind === "test" || cell.kind === "timedTest" || cell.kind === "exercise";
}

function isTextAction(
  cell: PanelCellJson,
): cell is Extract<PanelCellJson, { kind: "study" | "review" }> {
  return cell.kind === "study" || cell.kind === "review";
}

export function actionLabel(cell: PanelCellJson): string {
  if (cell.kind === "routine") {
    return `روتین (${cell.routineMode === "test" ? "تست" : "مطالعه"})`;
  }
  return PANEL_ACTION_LABELS[cell.kind];
}

export function plannedCellLabel(
  cell: PanelCellJson | undefined,
  subjectTitles: Map<string, string>,
  resourceTitles: Map<string, string>,
  chapterTitles?: Map<string, string>,
): string {
  if (!cell) return "—";
  if (cell.kind === "empty") return "—";
  if (cell.kind === "rest") return "استراحت";

  const subject = subjectTitles.get(cell.subjectId) ?? "درس";

  if (isTextAction(cell)) {
    return [PANEL_ACTION_LABELS[cell.kind], subject, cell.resourceText]
      .filter(Boolean)
      .join(" · ");
  }

  if (isCountAction(cell)) {
    const parts = [PANEL_ACTION_LABELS[cell.kind], subject];
    const resource = cell.resourceId ? resourceTitles.get(cell.resourceId) : null;
    if (resource) parts.push(resource);
    const chapter = cell.chapterId ? chapterTitles?.get(cell.chapterId) : null;
    if (chapter) parts.push(chapter);
    if (cell.count > 0) parts.push(`${faNumber(cell.count)} عدد`);
    return parts.join(" · ");
  }

  const parts = [actionLabel(cell), subject];
  if (cell.routineMode === "study") {
    if (cell.resourceText) parts.push(cell.resourceText);
  } else {
    const resource = cell.resourceId ? resourceTitles.get(cell.resourceId) : null;
    if (resource) parts.push(resource);
    const chapter = cell.chapterId ? chapterTitles?.get(cell.chapterId) : null;
    if (chapter) parts.push(chapter);
    if (cell.count > 0) parts.push(`${faNumber(cell.count)} عدد`);
  }
  return parts.join(" · ");
}

export function emptyGrid(slotCount: number = PANEL_SLOTS.length): WeeklyGridJson {
  return Array.from({ length: PANEL_DAYS }, () =>
    Array.from({ length: slotCount }, () => ({ kind: "empty" }) satisfies PanelCellJson),
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function nullableId(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function normalizeCount(value: unknown): number {
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.max(0, Math.min(1000, Math.round(raw))) : 0;
}

export function normalizeCell(value: unknown): PanelCellJson {
  if (!value || typeof value !== "object") return { kind: "empty" };
  const cell = value as Record<string, unknown>;
  const kind = cell.kind;
  if (kind === "rest") return { kind: "rest" };

  const subjectId = typeof cell.subjectId === "string" ? cell.subjectId : "";
  if (!subjectId) return { kind: "empty" };

  if (kind === "study" || kind === "review") {
    return { kind, subjectId, resourceText: text(cell.resourceText) };
  }

  if (kind === "test" || kind === "timedTest" || kind === "exercise") {
    return {
      kind,
      subjectId,
      resourceId: nullableId(cell.resourceId),
      chapterId: nullableId(cell.chapterId),
      count: normalizeCount(cell.count),
    };
  }

  if (kind === "routine") {
    const routineMode = cell.routineMode === "study" ? "study" : "test";
    return {
      kind: "routine",
      routineMode,
      subjectId,
      resourceText: text(cell.resourceText),
      resourceId: nullableId(cell.resourceId),
      chapterId: nullableId(cell.chapterId),
      count: normalizeCount(cell.count),
    };
  }

  return { kind: "empty" };
}

export function normalizeGrid(value: unknown, slotCount: number = PANEL_SLOTS.length): WeeklyGridJson {
  const grid = emptyGrid(slotCount);
  if (!Array.isArray(value)) return grid;
  for (let day = 0; day < Math.min(PANEL_DAYS, value.length); day += 1) {
    const row = value[day];
    if (!Array.isArray(row)) continue;
    for (let slot = 0; slot < Math.min(slotCount, row.length); slot += 1) {
      grid[day][slot] = normalizeCell(row[slot]);
    }
  }
  return grid;
}

export class PanelValidationError extends Error {}

function assertCountCell(cell: { count: number }): void {
  if (!Number.isInteger(cell.count) || cell.count < 0) {
    throw new PanelValidationError("تعداد تست/تمرین باید عدد صحیح و نامنفی باشد.");
  }
}

function assertGrid(value: unknown, slotCount: number): asserts value is WeeklyGridJson {
  if (!Array.isArray(value) || value.length !== PANEL_DAYS) {
    throw new PanelValidationError("ساختار جدول نامعتبر است.");
  }
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== slotCount) {
      throw new PanelValidationError("ساختار جدول نامعتبر است.");
    }
    for (const cell of row) {
      if (!cell || typeof cell !== "object") {
        throw new PanelValidationError("ساختار خانه‌ها نامعتبر است.");
      }
      const c = cell as PanelCellJson;
      if (c.kind === "empty" || c.kind === "rest") continue;
      if (!c.subjectId) throw new PanelValidationError("برای هر اقدام باید درس انتخاب شود.");
      if (isCountAction(c)) assertCountCell(c);
      if (c.kind === "routine" && c.routineMode === "test") assertCountCell(c);
    }
  }
}

export function taskTypeForCell(cell: PanelCellJson): {
  type: "study" | "review" | "test" | "timed_test" | "exercise";
  actionKind: PanelActionKind;
  routineMode: "study" | "test" | null;
} {
  switch (cell.kind) {
    case "review":
      return { type: "review", actionKind: "review", routineMode: null };
    case "test":
      return { type: "test", actionKind: "test", routineMode: null };
    case "timedTest":
      return { type: "timed_test", actionKind: "timedTest", routineMode: null };
    case "exercise":
      return { type: "exercise", actionKind: "exercise", routineMode: null };
    case "routine":
      return {
        type: cell.routineMode === "test" ? "test" : "study",
        actionKind: "routine",
        routineMode: cell.routineMode,
      };
    case "study":
    default:
      return { type: "study", actionKind: "study", routineMode: null };
  }
}

type PanelTaskLike = {
  planDate: string;
  plannedStart: number;
  subjectId: string;
  resourceId: string | null;
  type: string;
  targetUnits: number;
  actionKind?: string | null;
  routineMode?: string | null;
  chapterId?: string | null;
  resourceText?: string | null;
};

function fallbackActionKind(task: PanelTaskLike): PanelActionKind {
  if (task.type === "review") return "review";
  if (task.type === "test" || task.type === "timed_test") return "test";
  if (task.type === "exercise") return "exercise";
  return "study";
}

function cellFromTask(task: PanelTaskLike): PanelCellJson {
  const actionKind = (task.actionKind || fallbackActionKind(task)) as PanelActionKind;
  const count = Math.max(0, task.targetUnits);
  const base = {
    subjectId: task.subjectId,
    resourceId: task.resourceId,
    chapterId: task.chapterId ?? null,
    resourceText: task.resourceText ?? "",
    count,
  };
  switch (actionKind) {
    case "study":
    case "review":
      return {
        kind: actionKind,
        subjectId: task.subjectId,
        resourceText: task.resourceText ?? "",
      };
    case "test":
    case "timedTest":
    case "exercise":
      return { kind: actionKind, ...base };
    case "routine":
      return {
        kind: "routine",
        routineMode: task.routineMode === "study" ? "study" : "test",
        ...base,
      };
    default: {
      const fallback = fallbackActionKind(task);
      if (fallback === "review") {
        return { kind: "review", subjectId: task.subjectId, resourceText: task.resourceText ?? "" };
      }
      if (fallback === "test") {
        return { kind: "test", ...base };
      }
      if (fallback === "exercise") {
        return { kind: "exercise", ...base };
      }
      return { kind: "study", subjectId: task.subjectId, resourceText: task.resourceText ?? "" };
    }
  }
}

export function buildGridFromTasks(
  weekStart: string,
  rows: PanelTaskLike[],
  slots: readonly PanelSlot[] = PANEL_SLOTS,
): WeeklyGridJson {
  const dates = weekDates(weekStart);
  const grid = emptyGrid(slots.length);
  for (const task of rows) {
    const day = dates.indexOf(task.planDate);
    if (day < 0) continue;
    const slotIndex = slotIndexForStart(slots, task.plannedStart);
    if (slotIndex < 0) continue;
    if (grid[day][slotIndex].kind !== "empty") continue;
    grid[day][slotIndex] = cellFromTask(task);
  }

  return grid;
}

async function gridFromTasks(
  planId: string,
  weekStart: string,
  slots: PanelSlot[],
): Promise<WeeklyGridJson> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.planId, planId))
    .orderBy(asc(tasks.planDate), asc(tasks.plannedStart));
  return buildGridFromTasks(weekStart, rows, slots);
}

export async function saveGeneratedPanel(input: {
  studentId: string;
  weekStart: string;
  grid: WeeklyGridJson;
  dailyRoutine: string;
  nextWeekHomework: string;
  actorId: string;
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(weeklyPanels)
    .values({
      studentId: input.studentId,
      weekStart: input.weekStart,
      gridJson: input.grid,
      dailyRoutine: input.dailyRoutine.trim().slice(0, 2000),
      nextWeekHomework: input.nextWeekHomework.trim().slice(0, 2000),
      updatedBy: input.actorId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [weeklyPanels.studentId, weeklyPanels.weekStart],
      set: {
        gridJson: input.grid,
        dailyRoutine: input.dailyRoutine.trim().slice(0, 2000),
        nextWeekHomework: input.nextWeekHomework.trim().slice(0, 2000),
        updatedBy: input.actorId,
        updatedAt: new Date(),
      },
    });
}

export async function getWeeklyPanelView(studentId: string, weekStart: string): Promise<PanelView> {
  const db = await getDb();
  const slots = await getBellSlots(studentId);
  const [panel] = await db
    .select()
    .from(weeklyPanels)
    .where(and(eq(weeklyPanels.studentId, studentId), eq(weeklyPanels.weekStart, weekStart)))
    .limit(1);

  const [planRows, examRows] = await Promise.all([
    db
      .select()
      .from(plans)
      .where(and(eq(plans.studentId, studentId), eq(plans.weekStart, weekStart)))
      .limit(1),
    db
      .select({
        title: examTargets.title,
        examDate: examTargets.examDate,
        examType: examTargets.examType,
      })
      .from(examTargets)
      .where(
        and(
          eq(examTargets.studentId, studentId),
          gte(examTargets.examDate, weekStart),
          lte(examTargets.examDate, addDays(weekStart, 6)),
        ),
      )
      .orderBy(asc(examTargets.examDate)),
  ]);

  const plan = planRows[0];
  const grid = panel?.gridJson
    ? normalizeGrid(panel.gridJson, slots.length)
    : plan
      ? await gridFromTasks(plan.id, weekStart, slots)
      : emptyGrid(slots.length);

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
    slots,
    exams: examRows,
    dailyRoutine: panel?.dailyRoutine ?? "",
    nextWeekHomework: panel?.nextWeekHomework ?? "",
    planId: plan?.id ?? null,
    planStatus: plan?.status ?? null,
    updatedAt: panel?.updatedAt ?? null,
    updatedByName,
  };
}

export type PanelChapterOption = {
  id: string;
  title: string;
  testCount: number;
  completedTests: number;
  exerciseCount: number;
  completedExercises: number;
  pages: number;
  completedPages: number;
};

export type PanelResourceOption = {
  id: string;
  subjectId: string;
  title: string;
  unitType: "test" | "page" | "chapter";
  totalUnits: number;
  completedUnits: number;
  priority: number;
  chapters: PanelChapterOption[];
};

export type PanelOptions = {
  subjects: SubjectOption[];
  resources: PanelResourceOption[];
  subjectGroups: { general: string[]; specialized: string[] };
};

export function subjectsToGroups(subjects: SubjectOption[], field: string): {
  general: string[];
  specialized: string[];
} {
  const general: string[] = [];
  const specialized: string[] = [];
  for (const subject of subjects) {
    if (subject.kind === "general") general.push(subject.id);
    else if (subject.kind === "specialized") specialized.push(subject.id);
    else {
      general.push(subject.id);
      if (field === "انسانی") specialized.push(subject.id);
    }
  }
  return { general, specialized };
}

export async function getPanelOptions(
  workspaceId: string,
  studentId: string,
): Promise<PanelOptions> {
  const db = await getDb();
  const [student] = await db
    .select({ field: students.field })
    .from(students)
    .where(and(eq(students.workspaceId, workspaceId), eq(students.id, studentId)))
    .limit(1);

  const subjectRows = await listSubjectsForField(workspaceId, student?.field ?? "تجربی");
  const resourceRows = await db
    .select({
      id: resources.id,
      subjectId: resources.subjectId,
      title: resources.title,
      unitType: resources.unitType,
      totalUnits: resources.totalUnits,
      completedUnits: resources.completedUnits,
      priority: resources.priority,
      chaptersJson: resources.chaptersJson,
    })
    .from(resources)
    .where(and(eq(resources.workspaceId, workspaceId), eq(resources.studentId, studentId)))
    .orderBy(asc(resources.title));

  const knownSubjectIds = new Set(subjectRows.map((row) => row.id));
  const missingSubjectIds = [
    ...new Set(resourceRows.map((row) => row.subjectId).filter((id) => !knownSubjectIds.has(id))),
  ];
  if (missingSubjectIds.length > 0) {
    const extraSubjects = await db
      .select({
        id: subjects.id,
        title: subjects.title,
        kind: subjects.kind,
        color: subjects.color,
        fieldsJson: subjects.fieldsJson,
      })
      .from(subjects)
      .where(inArray(subjects.id, missingSubjectIds));
    subjectRows.push(...extraSubjects);
  }

  let chapterMap = await chaptersByResourceIds(
    db,
    resourceRows.map((row) => row.id),
  );
  let backfilled = false;
  for (const row of resourceRows) {
    if ((chapterMap.get(row.id)?.length ?? 0) > 0) continue;
    const created = await ensureChaptersFromJson(db, {
      id: row.id,
      unitType: row.unitType as PanelResourceOption["unitType"],
      totalUnits: row.totalUnits,
      completedUnits: row.completedUnits,
      chaptersJson: row.chaptersJson,
    });
    if (created) backfilled = true;
  }
  if (backfilled) {
    chapterMap = await chaptersByResourceIds(
      db,
      resourceRows.map((row) => row.id),
    );
  }

  return {
    subjects: subjectRows,
    resources: resourceRows.map((row) => ({
      ...row,
      unitType: row.unitType as PanelResourceOption["unitType"],
      chapters: (chapterMap.get(row.id) ?? []).map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        testCount: chapter.testCount,
        completedTests: chapter.completedTests,
        exerciseCount: chapter.exerciseCount,
        completedExercises: chapter.completedExercises,
        pages: chapter.pages,
        completedPages: chapter.completedPages,
      })),
    })),
    subjectGroups: subjectsToGroups(subjectRows, student?.field ?? "تجربی"),
  };
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
  const db = await getDb();
  const [studentRow] = await db
    .select({ id: students.id, workspaceId: students.workspaceId })
    .from(students)
    .where(eq(students.id, input.studentId))
    .limit(1);
  if (!studentRow) throw new PanelValidationError("دانش‌آموز پیدا نشد.");

  const slots = await getBellSlots(input.studentId);
  assertGrid(input.grid, slots.length);
  const grid = normalizeGrid(input.grid, slots.length);

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
  const chapterMap = await chaptersByResourceIds(db, [...resourceIds]);
  const chapterById = new Map(
    [...chapterMap.values()].flat().map((chapter) => [chapter.id, chapter]),
  );

  for (const row of grid) {
    for (const cell of row) {
      if (cell.kind === "empty" || cell.kind === "rest") continue;
      if (!subjectIds.has(cell.subjectId)) {
        throw new PanelValidationError("یکی از درس‌های انتخابی معتبر نیست.");
      }
      if (isTextAction(cell)) continue;
      if (isCountAction(cell) || cell.kind === "routine") {
        const isTestMode = cell.kind !== "routine" || cell.routineMode === "test";
        if (!isTestMode) continue;
        if (cell.resourceId && !resourceIds.has(cell.resourceId)) {
          throw new PanelValidationError("یکی از منابع انتخابی معتبر نیست.");
        }
        if (cell.resourceId && !cell.chapterId && (chapterMap.get(cell.resourceId)?.length ?? 0) > 0) {
          throw new PanelValidationError("برای این منبع، فصل/بخش را هم انتخاب کنید.");
        }
        if (cell.chapterId) {
          const chapter = chapterById.get(cell.chapterId);
          if (!chapter) throw new PanelValidationError("فصل انتخاب‌شده معتبر نیست.");
          if (cell.resourceId && chapter.resourceId !== cell.resourceId) {
            throw new PanelValidationError("فصل انتخاب‌شده به منبع انتخابی تعلق ندارد.");
          }
        }
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
        if (cell.kind === "empty" || cell.kind === "rest") continue;
        const slotDef = slots[slot];
        const meta = taskTypeForCell(cell);
        const countCell = isCountAction(cell)
          ? cell
          : cell.kind === "routine" && cell.routineMode === "test"
            ? cell
            : null;
        const textCell = isTextAction(cell)
          ? cell
          : cell.kind === "routine" && cell.routineMode === "study"
            ? cell
            : null;
        const chapterId = countCell?.chapterId ?? null;
        const resourceId = countCell?.resourceId ?? null;
        const resourceText = textCell?.resourceText ?? "";
        const count = countCell?.count ?? 0;
        const chapterTitle = chapterId ? chapterById.get(chapterId)?.title ?? "" : "";
        taskValues.push({
          planId: planId,
          planDate: dates[day],
          plannedStart: slotDef.startMin,
          plannedEnd: slotDef.endMin,
          subjectId: cell.subjectId,
          resourceId,
          chapterId,
          resourceText,
          topic: chapterTitle || resourceText,
          type: meta.type,
          actionKind: meta.actionKind,
          routineMode: meta.routineMode,
          targetUnits: count,
          estMinutes: slotDef.endMin - slotDef.startMin,
        });
      }
    }

    if (taskValues.length > 0) await tx.insert(tasks).values(taskValues);
  });
}
