import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  dailyLogs,
  performancePanels,
  plans,
  resources,
  students,
  subjects,
  tasks,
  users,
  type PerformanceCellJson,
  type PerformanceGridJson,
  type PanelCellJson,
  type WeeklyGridJson,
} from "@/db/schema";
import { addDays, startOfWeekSaturday, tehranMinutesOf, weekDates } from "./dates";
import { getWeeklyPanelView } from "./panel";
import { applyActionDeltas, chaptersByResourceIds } from "./resource-chapters";
import { diffResourceActionCounts } from "./resource-progress";
import { subjectSupportsTests } from "./subjects";
import { ensureSubjectCatalog } from "./subject-catalog";
import {
  getBellSlots,
  PANEL_DAYS,
  PANEL_SLOTS,
  type PanelSlot,
  slotIndexForStart,
} from "./schedule";

export { PANEL_DAYS, PANEL_SLOTS };

export type PerfCellState = {
  kind: "empty" | "rest" | "study" | "review" | "test" | "timedTest" | "exercise" | "routine" | "school" | "exam" | "examAnalysis";
  subjectId?: string;
  resourceText?: string;
  resourceId?: string | null;
  chapterId?: string | null;
  count?: number;
  routineMode?: "study" | "test";
  minutes?: number;
  note?: string;
  label?: string;
  title?: string;
  mockExamId?: string | null;
};

export type PerformanceView = {
  weekStart: string;
  grid: PerformanceGridJson;
  slots: PanelSlot[];
  narrative: string;
  narrativeAt: Date | null;
  updatedAt: Date | null;
  updatedByName: string | null;
};

export class PerformanceValidationError extends Error {}

export function emptyPerformanceGrid(slotCount: number = PANEL_SLOTS.length): PerformanceGridJson {
  return Array.from({ length: PANEL_DAYS }, () =>
    Array.from({ length: slotCount }, () => ({ kind: "empty" }) satisfies PerformanceCellJson),
  );
}

function isCountCell(
  cell: PerformanceCellJson,
): cell is Extract<PerformanceCellJson, { kind: "test" | "timedTest" | "exercise" }> {
  return cell.kind === "test" || cell.kind === "timedTest" || cell.kind === "exercise";
}

function isTextCell(
  cell: PerformanceCellJson,
): cell is Extract<PerformanceCellJson, { kind: "study" | "review" }> {
  return cell.kind === "study" || cell.kind === "review";
}

export function isPerformedCell(cell: PerformanceCellJson | undefined): boolean {
  return Boolean(cell && cell.kind !== "empty" && cell.kind !== "rest");
}

export function normalizePerfCell(value: unknown): PerformanceCellJson {
  if (!value || typeof value !== "object") return { kind: "empty" };
  const cell = value as Record<string, unknown>;
  const rawKind = cell.kind;
  const kind =
    rawKind === "practice"
      ? "test"
      : rawKind;
  const note = typeof cell.note === "string" ? cell.note.trim().slice(0, 500) : "";
  const subjectId =
    typeof cell.subjectId === "string" && cell.subjectId ? cell.subjectId : "";
  const resourceText = typeof cell.resourceText === "string" ? cell.resourceText.trim().slice(0, 500) : "";
  const rawMinutes = Number(cell.minutes);
  const legacyStart = Number(cell.startMin);
  const legacyEnd = Number(cell.endMin);
  const minutes = Number.isFinite(rawMinutes)
    ? Math.max(0, Math.min(1440, Math.round(rawMinutes)))
    : Number.isFinite(legacyStart) && Number.isFinite(legacyEnd) && legacyEnd > legacyStart
      ? Math.max(0, Math.min(1440, Math.round(legacyEnd - legacyStart)))
      : NaN;

  if (kind === "rest") return { kind: "rest" };
  if (!Number.isFinite(minutes)) return { kind: "empty" };
  if (kind === "exam" || kind === "examAnalysis") {
    return {
      kind,
      mockExamId: typeof cell.mockExamId === "string" && cell.mockExamId ? cell.mockExamId : null,
      title: typeof cell.title === "string" ? cell.title.trim().slice(0, 300) : "",
      minutes,
      note,
    };
  }
  if (!subjectId) return { kind: "empty" };
  if (kind === "school") {
    return {
      kind: "school",
      subjectId,
      label: typeof cell.label === "string" ? cell.label.trim().slice(0, 300) : "",
      minutes,
      note,
    };
  }

  const resourceId = typeof cell.resourceId === "string" && cell.resourceId ? cell.resourceId : null;
  const chapterId = typeof cell.chapterId === "string" && cell.chapterId ? cell.chapterId : null;
  const rawCount = Number(cell.count);
  const count = Number.isFinite(rawCount) ? Math.max(0, Math.min(1000, Math.round(rawCount))) : 0;

  if (kind === "study" || kind === "review") {
    return { kind, subjectId, resourceText, minutes, note };
  }
  if (kind === "test" || kind === "timedTest" || kind === "exercise") {
    return { kind, subjectId, resourceId, chapterId, count, minutes, note };
  }
  if (kind === "routine") {
    return {
      kind: "routine",
      routineMode: cell.routineMode === "study" ? "study" : "test",
      subjectId,
      resourceText,
      resourceId,
      chapterId,
      count,
      minutes,
      note,
    };
  }
  return { kind: "empty" };
}

export function normalizePerfGrid(value: unknown, slotCount: number = PANEL_SLOTS.length): PerformanceGridJson {
  const grid = emptyPerformanceGrid(slotCount);
  if (!Array.isArray(value)) return grid;
  for (let day = 0; day < Math.min(PANEL_DAYS, value.length); day += 1) {
    const row = value[day];
    if (!Array.isArray(row)) continue;
    for (let slot = 0; slot < Math.min(slotCount, row.length); slot += 1) {
      grid[day][slot] = normalizePerfCell(row[slot]);
    }
  }
  return grid;
}

export function normalizePerfGridForSubjectKinds(
  grid: PerformanceGridJson,
  kindById: Map<string, string>,
): PerformanceGridJson {
  return grid.map((row) =>
    row.map((cell) => {
      if (cell.kind === "empty" || cell.kind === "rest") return cell;
      if (!("subjectId" in cell) || !cell.subjectId) return cell;
      const kind = kindById.get(cell.subjectId);
      if (!kind || subjectSupportsTests(kind)) return cell;
      if (cell.kind === "test" || cell.kind === "timedTest") {
        return { ...cell, kind: "exercise" };
      }
      if (cell.kind === "routine" && cell.routineMode === "test") {
        return { ...cell, routineMode: "study" };
      }
      return cell;
    }),
  );
}

async function loadSubjectKindMap(
  db: Awaited<ReturnType<typeof getDb>>,
  studentId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: subjects.id, kind: subjects.kind })
    .from(subjects)
    .innerJoin(students, eq(students.workspaceId, subjects.workspaceId))
    .where(eq(students.id, studentId));
  return new Map(rows.map((row) => [row.id, row.kind]));
}

function assertPerfGrid(value: unknown, slotCount: number): asserts value is PerformanceGridJson {
  if (!Array.isArray(value) || value.length !== PANEL_DAYS) {
    throw new PerformanceValidationError("ساختار جدول عملکرد نامعتبر است.");
  }
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== slotCount) {
      throw new PerformanceValidationError("ساختار جدول عملکرد نامعتبر است.");
    }
    for (const cell of row) {
      if (!cell || typeof cell !== "object") {
        throw new PerformanceValidationError("ساختار خانه‌های عملکرد نامعتبر است.");
      }
      const c = cell as PerformanceCellJson;
      if (c.kind === "empty" || c.kind === "rest") continue;
      if (c.kind === "exam" || c.kind === "examAnalysis") continue;
      if (!("subjectId" in c) || !c.subjectId) {
        throw new PerformanceValidationError("برای هر اقدام باید درس انتخاب شود.");
      }
      if (!Number.isInteger(c.minutes) || c.minutes < 0 || c.minutes > 1440) {
        throw new PerformanceValidationError("مدت زمان باید عددی بین ۰ تا ۱۴۴۰ دقیقه باشد.");
      }
      if (isCountCell(c) && (!Number.isInteger(c.count) || c.count < 0)) {
        throw new PerformanceValidationError("تعداد تست/تمرین باید عدد صحیح و نامنفی باشد.");
      }
      if (c.kind === "routine" && c.routineMode === "test" && (!Number.isInteger(c.count) || c.count < 0)) {
        throw new PerformanceValidationError("تعداد تست باید عدد صحیح و نامنفی باشد.");
      }
    }
  }
}

export async function getPerformanceView(studentId: string, weekStart: string): Promise<PerformanceView> {
  const db = await getDb();
  const slots = await getBellSlots(studentId);
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

  const baseGrid = panel?.cellsJson
    ? normalizePerfGrid(panel.cellsJson, slots.length)
    : emptyPerformanceGrid(slots.length);
  const kindById = await loadSubjectKindMap(db, studentId);
  const grid = normalizePerfGridForSubjectKinds(baseGrid, kindById);

  return {
    weekStart,
    grid,
    slots,
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
  const db = await getDb();
  const [studentRow] = await db
    .select({ id: students.id, workspaceId: students.workspaceId })
    .from(students)
    .where(eq(students.id, input.studentId))
    .limit(1);
  if (!studentRow) throw new PerformanceValidationError("دانش‌آموز پیدا نشد.");

  const slots = await getBellSlots(input.studentId);
  assertPerfGrid(input.grid, slots.length);
  let grid = normalizePerfGrid(input.grid, slots.length);

  const [subjectRows, resourceRows, existingPanelRows] = await Promise.all([
    db
      .select({ id: subjects.id, kind: subjects.kind })
      .from(subjects)
      .where(eq(subjects.workspaceId, studentRow.workspaceId)),
    db
      .select({
        id: resources.id,
        subjectId: resources.subjectId,
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

  const kindById = new Map(subjectRows.map((row) => [row.id, row.kind]));
  grid = normalizePerfGridForSubjectKinds(grid, kindById);
  const subjectIds = new Set(subjectRows.map((row) => row.id));
  const resourceById = new Map(resourceRows.map((row) => [row.id, row]));
  const chapterMap = await chaptersByResourceIds(db, [...resourceById.keys()]);
  const chapterById = new Map([...chapterMap.values()].flat().map((chapter) => [chapter.id, chapter]));

  for (const row of grid) {
    for (const cell of row) {
      if (cell.kind === "empty" || cell.kind === "rest") continue;
      if (cell.kind === "exam" || cell.kind === "examAnalysis") continue;
      if (!("subjectId" in cell) || !subjectIds.has(cell.subjectId)) {
        throw new PerformanceValidationError("یکی از درس‌های ثبت عملکرد معتبر نیست.");
      }
      const countCell = isCountCell(cell) ? cell : cell.kind === "routine" && cell.routineMode === "test" ? cell : null;
      if (!countCell) continue;
      if (countCell.resourceId) {
        const resource = resourceById.get(countCell.resourceId);
        if (!resource) throw new PerformanceValidationError("یکی از منابع ثبت عملکرد معتبر نیست.");
        if (!("subjectId" in cell) || resource.subjectId !== cell.subjectId) {
          throw new PerformanceValidationError("منبع انتخاب‌شده با درس عملکرد هم‌خوان نیست.");
        }
        if (!countCell.chapterId && (chapterMap.get(countCell.resourceId)?.length ?? 0) > 0) {
          throw new PerformanceValidationError("برای این منبع، فصل/بخش را هم انتخاب کنید.");
        }
      }
      if (countCell.chapterId) {
        const chapter = chapterById.get(countCell.chapterId);
        if (!chapter) throw new PerformanceValidationError("فصل انتخاب‌شده معتبر نیست.");
        if (countCell.resourceId && chapter.resourceId !== countCell.resourceId) {
          throw new PerformanceValidationError("فصل انتخاب‌شده به منبع انتخابی تعلق ندارد.");
        }
      }
    }
  }

  const previousGrid = existingPanelRows[0]?.cellsJson
    ? normalizePerfGridForSubjectKinds(
        normalizePerfGrid(existingPanelRows[0].cellsJson, slots.length),
        kindById,
      )
    : null;
  const deltas = diffResourceActionCounts(previousGrid, grid);

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

    await applyActionDeltas(tx, deltas);

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
      const slot = slotIndexForStart(slots, task.plannedStart);
      if (slot < 0) continue;
      const cell = grid[day]?.[slot];
      if (!cell) continue;

      if (isPerformedCell(cell)) {
        const activity = cell as Exclude<PerformanceCellJson, { kind: "empty" | "rest" }>;
        const count =
          isCountCell(activity) || (activity.kind === "routine" && activity.routineMode === "test")
            ? activity.count
            : 0;
        await tx
          .update(tasks)
          .set({
            status: "done",
            actualStartedAt: null,
            actualEndedAt: null,
            actualUnits: count,
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
  studyMinutes: number;
  reviewMinutes: number;
  testMinutes: number;
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

export type SubjectDayCell = {
  date: string;
  practiceMinutes: number;
  studyMinutes: number;
  testMinutes: number;
  exerciseMinutes: number;
};

export type SubjectDayRow = {
  subjectId: string;
  title: string;
  kind: string;
  days: SubjectDayCell[];
  totalPracticeMinutes: number;
  totalStudyMinutes: number;
  totalTestMinutes: number;
  totalExerciseMinutes: number;
};

export type SubjectTimeRow = {
  title: string;
  morning: number;
  afternoon: number;
  evening: number;
};

export type PlanningInsights = {
  subjectTimes: SubjectTimeRow[];
  firstSubjectByDay: { date: string; title: string }[];
};

function reportBucket(cell: PerfActivityCell): {
  study: number;
  test: number;
  exercise: number;
} {
  if (cell.kind === "school" || cell.kind === "exam" || cell.kind === "examAnalysis") {
    return { study: 0, test: 0, exercise: 0 };
  }
  if (cell.kind === "study" || cell.kind === "review") {
    return { study: cell.minutes, test: 0, exercise: 0 };
  }
  if (cell.kind === "routine") {
    return cell.routineMode === "study"
      ? { study: cell.minutes, test: 0, exercise: 0 }
      : { study: 0, test: cell.minutes, exercise: 0 };
  }
  if (cell.kind === "exercise") {
    return { study: 0, test: 0, exercise: cell.minutes };
  }
  return { study: 0, test: cell.minutes, exercise: 0 };
}

export function buildSubjectDayMatrix(
  perfGrid: PerformanceGridJson,
  dates: string[],
  subjectMeta: Map<string, { title: string; kind: string }>,
): SubjectDayRow[] {
  const bySubject = new Map<
    string,
    {
      subjectId: string;
      title: string;
      kind: string;
      days: Map<string, SubjectDayCell>;
      totalPracticeMinutes: number;
      totalStudyMinutes: number;
      totalTestMinutes: number;
      totalExerciseMinutes: number;
    }
  >();

  for (let day = 0; day < dates.length; day += 1) {
    const date = dates[day];
    for (const cell of perfGrid[day] ?? []) {
      if (!isPerformedCell(cell)) continue;
      const activity = cell as PerfActivityCell;
      if (!("subjectId" in activity) || !activity.subjectId) continue;
      const meta = subjectMeta.get(activity.subjectId);
      if (!meta) continue;
      const bucket = reportBucket(activity);
      const practice = bucket.test + bucket.exercise;
      if (practice === 0 && bucket.study === 0) continue;
      const row =
        bySubject.get(activity.subjectId) ??
        {
          subjectId: activity.subjectId,
          title: meta.title,
          kind: meta.kind,
          days: new Map<string, SubjectDayCell>(),
          totalPracticeMinutes: 0,
          totalStudyMinutes: 0,
          totalTestMinutes: 0,
          totalExerciseMinutes: 0,
        };
      const dayCell =
        row.days.get(date) ?? {
          date,
          practiceMinutes: 0,
          studyMinutes: 0,
          testMinutes: 0,
          exerciseMinutes: 0,
        };
      dayCell.practiceMinutes += practice;
      dayCell.studyMinutes += bucket.study;
      dayCell.testMinutes += bucket.test;
      dayCell.exerciseMinutes += bucket.exercise;
      row.days.set(date, dayCell);
      row.totalPracticeMinutes += practice;
      row.totalStudyMinutes += bucket.study;
      row.totalTestMinutes += bucket.test;
      row.totalExerciseMinutes += bucket.exercise;
      bySubject.set(activity.subjectId, row);
    }
  }

  return [...bySubject.values()]
    .map((row) => ({
      subjectId: row.subjectId,
      title: row.title,
      kind: row.kind,
      days: dates.map(
        (date) =>
          row.days.get(date) ?? {
            date,
            practiceMinutes: 0,
            studyMinutes: 0,
            testMinutes: 0,
            exerciseMinutes: 0,
          },
      ),
      totalPracticeMinutes: row.totalPracticeMinutes,
      totalStudyMinutes: row.totalStudyMinutes,
      totalTestMinutes: row.totalTestMinutes,
      totalExerciseMinutes: row.totalExerciseMinutes,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "fa"));
}

export function buildPlanningInsights(
  planGrid: WeeklyGridJson | null,
  dates: string[],
  slots: readonly PanelSlot[],
  subjectMeta: Map<string, { title: string; kind: string }>,
): PlanningInsights {
  const bySubject = new Map<string, SubjectTimeRow>();
  const firstSubjectByDay: { date: string; title: string }[] = [];
  if (!planGrid) return { subjectTimes: [], firstSubjectByDay };

  for (let day = 0; day < dates.length; day += 1) {
    let first: string | null = null;
    for (let slot = 0; slot < slots.length; slot += 1) {
      const cell = planGrid[day]?.[slot];
      if (!cell || cell.kind === "empty" || cell.kind === "rest") continue;
      if (!("subjectId" in cell) || !cell.subjectId) continue;
      const title = subjectMeta.get(cell.subjectId)?.title;
      if (!title) continue;
      const row = bySubject.get(title) ?? { title, morning: 0, afternoon: 0, evening: 0 };
      const start = slots[slot].startMin;
      if (start < 12 * 60) row.morning += 1;
      else if (start < 18 * 60) row.afternoon += 1;
      else row.evening += 1;
      bySubject.set(title, row);
      if (!first) first = title;
    }
    if (first) firstSubjectByDay.push({ date: dates[day], title: first });
  }

  return {
    subjectTimes: [...bySubject.values()].sort(
      (a, b) => b.morning + b.afternoon + b.evening - (a.morning + a.afternoon + a.evening),
    ),
    firstSubjectByDay,
  };
}

async function loadOpenedMinutes(
  studentId: string,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ date: dailyLogs.logDate, firstOpenedAt: dailyLogs.firstOpenedAt })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.studentId, studentId),
        gte(dailyLogs.logDate, from),
        lte(dailyLogs.logDate, to),
      ),
    );
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.firstOpenedAt) map.set(row.date, tehranMinutesOf(row.firstOpenedAt));
  }
  return map;
}

const ONPLAN_MAX_DIFF_MIN = 30;

function plannedKind(cell: { kind: string } | undefined): boolean {
  return Boolean(cell && cell.kind !== "empty" && cell.kind !== "rest");
}

type PerfActivityCell = Exclude<PerformanceCellJson, { kind: "empty" | "rest" }>;

function cellCount(cell: PerfActivityCell): number {
  if (isCountCell(cell)) return Math.max(0, cell.count);
  if (cell.kind === "routine" && cell.routineMode === "test") return Math.max(0, cell.count);
  return 0;
}

export function buildPerformanceAnalysis(
  weekStart: string,
  planGrid: WeeklyGridJson | null,
  perfGrid: PerformanceGridJson,
  plannedStartByDate?: Map<string, number>,
  openedMinutesByDate?: Map<string, number>,
  slots: readonly PanelSlot[] = PANEL_SLOTS,
): PerformanceAnalysis {
  const dates = weekDates(weekStart);
  const days: DayStartStatus[] = [];

  for (let day = 0; day < PANEL_DAYS; day += 1) {
    const gridPlannedStartMin = (() => {
      if (!planGrid) return null;
      for (let slot = 0; slot < slots.length; slot += 1) {
        if (plannedKind(planGrid[day]?.[slot])) return slots[slot].startMin;
      }
      return null;
    })();
    const plannedStartMin = plannedStartByDate?.get(dates[day]) ?? gridPlannedStartMin;

    const performedAll = (perfGrid[day] ?? []).filter(
      (cell): cell is PerfActivityCell => isPerformedCell(cell),
    );
    const performed = performedAll.filter(
      (cell) => cell.kind !== "school" && cell.kind !== "exam" && cell.kind !== "examAnalysis",
    );

    const performedMinutes = performed.reduce((sum, cell) => sum + cell.minutes, 0);
    const practiceCount = performed.reduce((sum, cell) => sum + cellCount(cell), 0);
    const studyMinutes = performed.reduce(
      (sum, cell) =>
        sum +
        (cell.kind === "study" || (cell.kind === "routine" && cell.routineMode === "study")
          ? cell.minutes
          : 0),
      0,
    );
    const reviewMinutes = performed.reduce(
      (sum, cell) => sum + (cell.kind === "review" ? cell.minutes : 0),
      0,
    );
    const testMinutes = performed.reduce(
      (sum, cell) =>
        sum +
        (cell.kind === "test" ||
        cell.kind === "timedTest" ||
        cell.kind === "exercise" ||
        (cell.kind === "routine" && cell.routineMode === "test")
          ? cell.minutes
          : 0),
      0,
    );

    const performedStartMin = openedMinutesByDate?.get(dates[day]) ?? null;
    const performedEndMin = null;

    const status: DayStartStatus["status"] =
      performedStartMin === null || plannedStartMin === null
        ? "none"
        : Math.abs(performedStartMin - plannedStartMin) <= ONPLAN_MAX_DIFF_MIN
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
      studyMinutes,
      reviewMinutes,
      testMinutes,
      practiceCount,
    });
  }

  const activeDays = days.filter(
    (day) => day.performedStartMin !== null || day.performedMinutes > 0,
  ).length;
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
  const [plan, perf, openedMinutes] = await Promise.all([
    getWeeklyPanelView(studentId, weekStart),
    getPerformanceView(studentId, weekStart),
    loadOpenedMinutes(studentId, weekStart, addDays(weekStart, 6)),
  ]);
  return buildPerformanceAnalysis(
    weekStart,
    plan.grid,
    perf.grid,
    undefined,
    openedMinutes,
    plan.slots,
  );
}

export type PerformanceRangeData = {
  analysis: PerformanceAnalysis;
  dates: string[];
  subjectDayMatrix: SubjectDayRow[];
  planningInsights: PlanningInsights;
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

  await ensureSubjectCatalog(studentRow.workspaceId);

  const subjectRows = await db
    .select({ id: subjects.id, title: subjects.title, kind: subjects.kind })
    .from(subjects)
    .where(eq(subjects.workspaceId, studentRow.workspaceId));
  const subjectTitles = new Map(subjectRows.map((row) => [row.id, row.title]));
  const subjectMeta = new Map(
    subjectRows.map((row) => [row.id, { title: row.title, kind: row.kind }]),
  );

  const openedMinutesByDate = await loadOpenedMinutes(studentId, from, to);
  const days: DayStartStatus[] = [];
  const plannedSubjectsByDay: string[][] = [];
  const notes: { weekday: number; slot: number; text: string }[] = [];
  const matrixCells = new Map<
    string,
    {
      title: string;
      kind: string;
      cells: Map<string, SubjectDayCell>;
    }
  >();
  const timeBySubject = new Map<string, SubjectTimeRow>();
  const firstSubjectByDay: { date: string; title: string }[] = [];
  const rangeDates: string[] = [];
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
        openedMinutesByDate,
        planView.slots,
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
              .filter(
                (cell) =>
                  cell.kind !== "empty" &&
                  cell.kind !== "rest" &&
                  cell.kind !== "school" &&
                  "subjectId" in cell,
              )
              .map((cell) => subjectTitles.get("subjectId" in cell ? cell.subjectId : "") ?? "درس"),
          ),
        ]);

        rangeDates.push(date);
        const perfRow = perfView.grid[dayIndex] ?? [];
        perfRow.forEach((cell, slot) => {
          if (!isPerformedCell(cell)) return;
          const activity = cell as PerfActivityCell;
          if (!("subjectId" in activity) || !activity.subjectId) return;
          const note = activity.note.trim();
          if (note) notes.push({ weekday: dayIndex, slot, text: note.slice(0, 300) });
          const meta = subjectMeta.get(activity.subjectId);
          if (!meta) return;
          const bucket = reportBucket(activity);
          const practice = bucket.test + bucket.exercise;
          if (practice === 0 && bucket.study === 0) return;
          const entry =
            matrixCells.get(activity.subjectId) ??
            {
              title: meta.title,
              kind: meta.kind,
              cells: new Map<string, SubjectDayCell>(),
            };
          const dayCell =
            entry.cells.get(date) ?? {
              date,
              practiceMinutes: 0,
              studyMinutes: 0,
              testMinutes: 0,
              exerciseMinutes: 0,
            };
          dayCell.practiceMinutes += practice;
          dayCell.studyMinutes += bucket.study;
          dayCell.testMinutes += bucket.test;
          dayCell.exerciseMinutes += bucket.exercise;
          entry.cells.set(date, dayCell);
          matrixCells.set(activity.subjectId, entry);
        });
      }

      const weekPlanning = buildPlanningInsights(
        planView.grid,
        dates,
        planView.slots,
        subjectMeta,
      );
      for (const row of weekPlanning.subjectTimes) {
        const current = timeBySubject.get(row.title) ?? {
          title: row.title,
          morning: 0,
          afternoon: 0,
          evening: 0,
        };
        current.morning += row.morning;
        current.afternoon += row.afternoon;
        current.evening += row.evening;
        timeBySubject.set(row.title, current);
      }
      for (const item of weekPlanning.firstSubjectByDay) {
        if (item.date >= from && item.date <= to) firstSubjectByDay.push(item);
      }

      if (planView.dailyRoutine.trim()) dailyRoutine = planView.dailyRoutine;
      weekStart = addDays(weekStart, 7);
    }
  }

  const activeDays = days.filter(
    (day) => day.performedStartMin !== null || day.performedMinutes > 0,
  ).length;
  const onplanDays = days.filter((day) => day.status === "onplan").length;
  const offplanDays = days.filter((day) => day.status === "offplan").length;
  const totalMinutes = days.reduce((sum, day) => sum + day.performedMinutes, 0);
  const totalPractice = days.reduce((sum, day) => sum + day.practiceCount, 0);

  const subjectDayMatrix: SubjectDayRow[] = [...matrixCells.entries()]
    .map(([subjectId, entry]) => ({
      subjectId,
      title: entry.title,
      kind: entry.kind,
      days: rangeDates.map(
        (date) =>
          entry.cells.get(date) ?? {
            date,
            practiceMinutes: 0,
            studyMinutes: 0,
            testMinutes: 0,
            exerciseMinutes: 0,
          },
      ),
      totalPracticeMinutes: [...entry.cells.values()].reduce(
        (sum, cell) => sum + cell.practiceMinutes,
        0,
      ),
      totalStudyMinutes: [...entry.cells.values()].reduce(
        (sum, cell) => sum + cell.studyMinutes,
        0,
      ),
      totalTestMinutes: [...entry.cells.values()].reduce(
        (sum, cell) => sum + cell.testMinutes,
        0,
      ),
      totalExerciseMinutes: [...entry.cells.values()].reduce(
        (sum, cell) => sum + cell.exerciseMinutes,
        0,
      ),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "fa"));

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
    dates: rangeDates,
    subjectDayMatrix,
    planningInsights: {
      subjectTimes: [...timeBySubject.values()].sort(
        (a, b) =>
          b.morning + b.afternoon + b.evening - (a.morning + a.afternoon + a.evening),
      ),
      firstSubjectByDay,
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
