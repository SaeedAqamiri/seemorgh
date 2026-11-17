import { addDays, daysBetween, weekDates, weekdayIndex } from "./dates";

export type PlannerUnitType = "test" | "exercise" | "page" | "chapter";

export type PlannerChapter = {
  id?: string;
  title: string;
  pages: number;
  startPage: number;
  endPage: number;
  testCount?: number;
  completedTests?: number;
  exerciseCount?: number;
  completedExercises?: number;
};

export type PlannerResource = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  title: string;
  unitType: PlannerUnitType;
  totalUnits: number;
  completedUnits: number;
  priority: number;
  chapters?: PlannerChapter[] | null;
};

export type PlannerAvailability = {
  weekday: number;
  startMin: number;
  endMin: number;
};

export type PlannerExamTarget = {
  title: string;
  examDate: string;
  weight: number;
};

export type PlannerConstraints = {
  maxDailyMinutes: number;
  restWeekday: number;
  bufferPct: number;
};

export type PlannerInput = {
  weekStart: string;
  availability: PlannerAvailability[];
  constraints: PlannerConstraints;
  resources: PlannerResource[];
  examTargets: PlannerExamTarget[];
};

export type PlannedActionKind =
  | "study"
  | "review"
  | "test"
  | "timedTest"
  | "exercise"
  | "school"
  | "exam"
  | "examAnalysis";

export type PlannedTask = {
  planDate: string;
  plannedStart: number;
  plannedEnd: number;
  subjectId: string;
  resourceId: string;
  chapterId: string | null;
  resourceText: string;
  topic: string;
  type: "study" | "review" | "test" | "timed_test" | "exercise" | "school" | "exam" | "exam_analysis";
  actionKind: PlannedActionKind;
  routineMode: "study" | "test" | null;
  targetUnits: number;
  estMinutes: number;
  mockExamId?: string | null;
};

export type GeneratedPlan = {
  weekStart: string;
  tasks: PlannedTask[];
  warnings: string[];
  stats: {
    capacityMinutes: number;
    plannedMinutes: number;
    plannedUnits: number;
    bySubject: Record<string, { title: string; minutes: number; units: number }>;
  };
};

type Window = { startMin: number; endMin: number };

type ChapterRemaining = { id: string | null; title: string; remaining: number };

type PoolItem = {
  resource: PlannerResource;
  remainingUnits: number;
  remainingMinutes: number;
  totalMinutes: number;
  chapterRemaining: ChapterRemaining[];
};

const MIN_BLOCK = 20;
const MAX_BLOCK = 60;
const BREAK_MIN = 5;

function unitWeight(unitType: PlannerUnitType): number {
  if (unitType === "chapter") return 2;
  if (unitType === "page") return 0.7;
  return 1;
}

function minutesPerUnit(unitType: PlannerUnitType): number {
  if (unitType === "test") return 1.5;
  if (unitType === "exercise") return 2;
  if (unitType === "page") return 2;
  return 60;
}

function unitsForMinutes(minutes: number, unitType: PlannerUnitType): number {
  return Math.max(1, Math.round(minutes / minutesPerUnit(unitType)));
}

function mergeWindows(windows: Window[]): Window[] {
  const sorted = [...windows]
    .filter((window) => window.endMin > window.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const merged: Window[] = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (last && window.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, window.endMin);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

function placeBlock(
  windows: Window[],
  cursor: number,
  duration: number,
): { start: number; end: number } | null {
  for (const window of windows) {
    const start = Math.max(cursor, window.startMin);
    const end = start + duration;
    if (end <= window.endMin) {
      return { start, end };
    }
    cursor = Math.max(cursor, window.endMin + BREAK_MIN);
  }
  return null;
}

function nearestExamWeeks(weekStart: string, examTargets: PlannerExamTarget[]): number {
  const upcoming = examTargets
    .map((target) => daysBetween(weekStart, target.examDate))
    .filter((days) => days >= 0)
    .sort((a, b) => a - b);

  if (upcoming.length === 0) return 4;
  return Math.max(1, Math.ceil(upcoming[0] / 7));
}

export function generatePlan(input: PlannerInput): GeneratedPlan {
  const warnings: string[] = [];

  if (weekdayIndex(input.weekStart) !== 0) {
    warnings.push("شروع هفته باید شنبه باشد؛ تاریخ به شنبه همان هفته اصلاح شد.");
    input = {
      ...input,
      weekStart: addDays(input.weekStart, -weekdayIndex(input.weekStart)),
    };
  }

  const dates = weekDates(input.weekStart);
  const weeksLeft = nearestExamWeeks(input.weekStart, input.examTargets);

  const dayWindows: Window[][] = dates.map((_, dayIndex) => {
    if (dayIndex === input.constraints.restWeekday) return [];
    return mergeWindows(
      input.availability
        .filter((slot) => slot.weekday === dayIndex)
        .map((slot) => ({ startMin: slot.startMin, endMin: slot.endMin })),
    );
  });

  const dayCapacities = dayWindows.map((windows) => {
    const total = windows.reduce((sum, window) => sum + (window.endMin - window.startMin), 0);
    const capped = Math.min(total, Math.max(0, input.constraints.maxDailyMinutes));
    const buffer = Math.max(0, Math.min(80, input.constraints.bufferPct));
    return Math.max(0, Math.floor((capped * (100 - buffer)) / 100));
  });

  const capacityMinutes = dayCapacities.reduce((sum, value) => sum + value, 0);

  const pool: PoolItem[] = input.resources
    .map((resource) => {
      const remainingUnits = Math.max(0, resource.totalUnits - resource.completedUnits);
      if (remainingUnits === 0) return null;
      const priority = Math.max(1, Math.min(5, resource.priority));
      const demand =
        (remainingUnits * unitWeight(resource.unitType) * priority) / (3 * weeksLeft);
      const chapterRemaining: ChapterRemaining[] =
        resource.unitType === "test" || resource.unitType === "exercise"
          ? (resource.chapters ?? [])
              .filter((chapter) =>
                resource.unitType === "test"
                  ? (chapter.testCount ?? 0) > 0
                  : (chapter.exerciseCount ?? 0) > 0,
              )
              .map((chapter) => ({
                id: chapter.id ?? null,
                title: chapter.title,
                remaining: Math.max(
                  0,
                  resource.unitType === "test"
                    ? (chapter.testCount ?? 0) - (chapter.completedTests ?? 0)
                    : (chapter.exerciseCount ?? 0) - (chapter.completedExercises ?? 0),
                ),
              }))
          : [];
      return {
        resource: { ...resource, priority },
        remainingUnits,
        remainingMinutes: 0,
        totalMinutes: demand,
        chapterRemaining,
      } satisfies PoolItem;
    })
    .filter((item): item is PoolItem => item !== null);

  const totalDemand = pool.reduce((sum, item) => sum + item.totalMinutes, 0);

  if (capacityMinutes === 0) {
    warnings.push("هیچ زمان آزادی برای این هفته ثبت نشده است.");
    return emptyPlan(input.weekStart, capacityMinutes, warnings);
  }

  if (pool.length === 0) {
    warnings.push("منبعی با واحد باقی‌مانده وجود ندارد؛ برنامه‌ای ساخته نشد.");
    return emptyPlan(input.weekStart, capacityMinutes, warnings);
  }

  if (totalDemand <= 0) {
    warnings.push("تقاضای کافی برای ساخت برنامه پیدا نشد.");
    return emptyPlan(input.weekStart, capacityMinutes, warnings);
  }

  for (const item of pool) {
    const share = item.totalMinutes / totalDemand;
    item.remainingMinutes = Math.floor(capacityMinutes * share);
  }

  const allocated = pool.reduce((sum, item) => sum + item.remainingMinutes, 0);
  if (allocated < capacityMinutes && pool.length > 0) {
    pool[0].remainingMinutes += capacityMinutes - allocated;
  }

  const tasks: PlannedTask[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = dates[dayIndex];
    const windows = dayWindows[dayIndex];
    let dayRemaining = dayCapacities[dayIndex];
    let cursor = windows[0]?.startMin ?? 0;
    let lastSubjectId: string | null = null;

    if (windows.length === 0 || dayRemaining <= 0) continue;

    let safety = 0;
    while (dayRemaining >= MIN_BLOCK && safety < 60) {
      safety += 1;

      const candidates = pool
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.remainingMinutes > 0 && item.remainingUnits > 0);

      if (candidates.length === 0) break;

      candidates.sort((a, b) => {
        const subjectPenaltyA = a.item.resource.subjectId === lastSubjectId ? 1 : 0;
        const subjectPenaltyB = b.item.resource.subjectId === lastSubjectId ? 1 : 0;
        if (subjectPenaltyA !== subjectPenaltyB) return subjectPenaltyA - subjectPenaltyB;
        if (b.item.remainingMinutes !== a.item.remainingMinutes) {
          return b.item.remainingMinutes - a.item.remainingMinutes;
        }
        return a.index - b.index;
      });

      const chosen =
        candidates.find(({ item }) => item.resource.subjectId !== lastSubjectId) ?? candidates[0];
      const item = chosen.item;

      const minutesForAllUnits = Math.ceil(
        item.remainingUnits * minutesPerUnit(item.resource.unitType),
      );
      const ideal = Math.min(MAX_BLOCK, dayRemaining, item.remainingMinutes);
      const duration = Math.max(MIN_BLOCK, Math.min(ideal, minutesForAllUnits));

      if (duration < MIN_BLOCK) break;

      const placement = placeBlock(windows, cursor, duration);
      if (!placement) {
        // Try a shorter block in the remaining window before giving up on the day.
        const fallbackDuration = dayRemaining >= MIN_BLOCK ? MIN_BLOCK : 0;
        const fallback = fallbackDuration
          ? placeBlock(windows, cursor, fallbackDuration)
          : null;
        if (!fallback) break;
        const { task, units } = buildTask(item, date, fallback, Math.min(
          item.remainingUnits,
          unitsForMinutes(fallbackDuration, item.resource.unitType),
        ), fallbackDuration);
        if (units <= 0) break;
        tasks.push(task);
        item.remainingUnits -= units;
        item.remainingMinutes -= fallbackDuration;
        dayRemaining -= fallbackDuration;
        cursor = fallback.end + BREAK_MIN;
        lastSubjectId = item.resource.subjectId;
        continue;
      }

      const rawUnits = Math.min(
        item.remainingUnits,
        unitsForMinutes(placement.end - placement.start, item.resource.unitType),
      );
      const { task, units } = buildTask(item, date, placement, rawUnits, duration);
      if (units <= 0) break;

      tasks.push(task);
      item.remainingUnits -= units;
      item.remainingMinutes -= duration;
      dayRemaining -= duration;
      cursor = placement.end + BREAK_MIN;
      lastSubjectId = item.resource.subjectId;
    }
  }

  return {
    weekStart: input.weekStart,
    tasks,
    warnings,
    stats: summarize(tasks, capacityMinutes, input.resources),
  };
}

function topicForBlock(item: PoolItem, units: number): string {
  const chapters = item.resource.chapters;
  if (!chapters?.length || item.resource.unitType !== "page") return item.resource.title;

  const remainingAtStart = Math.max(
    0,
    item.resource.totalUnits - item.resource.completedUnits,
  );
  const plannedBefore = Math.max(0, remainingAtStart - item.remainingUnits);
  const startPage = item.resource.completedUnits + plannedBefore + 1;
  const chapter = chapters.find(
    (entry) => startPage >= entry.startPage && startPage <= entry.endPage,
  );
  if (!chapter) return item.resource.title;

  return chapter.title;
}

function buildTask(
  item: PoolItem,
  planDate: string,
  placement: { start: number; end: number },
  requestedUnits: number,
  minutes: number,
): { task: PlannedTask; units: number } {
  let units = Math.max(1, requestedUnits);
  let chapterId: string | null = null;
  let topic = "";

  if (
    (item.resource.unitType === "test" || item.resource.unitType === "exercise") &&
    item.chapterRemaining.length > 0
  ) {
    const chapter = item.chapterRemaining.find((entry) => entry.remaining > 0);
    if (chapter) {
      units = Math.min(units, chapter.remaining);
      chapter.remaining -= units;
      chapterId = chapter.id;
      topic = chapter.title;
    }
  }

  if (!chapterId) topic = topicForBlock(item, units);

  if (item.resource.unitType === "page") {
    const chapter = item.resource.chapters?.find((entry) => {
      const page = item.resource.completedUnits + 1;
      return page >= entry.startPage && page <= entry.endPage;
    });
    chapterId = chapter?.id ?? null;
  }

  const isTest = item.resource.unitType === "test";
  const isExercise = item.resource.unitType === "exercise";
  return {
    units,
    task: {
      planDate,
      plannedStart: placement.start,
      plannedEnd: placement.end,
      subjectId: item.resource.subjectId,
      resourceId: item.resource.id,
      chapterId,
      resourceText: "",
      topic,
      type: isTest ? "test" : isExercise ? "exercise" : "study",
      actionKind: isTest ? "test" : isExercise ? "exercise" : "study",
      routineMode: null,
      targetUnits: units,
      estMinutes: minutes,
    },
  };
}

function summarize(
  tasks: PlannedTask[],
  capacityMinutes: number,
  resources: PlannerResource[],
): GeneratedPlan["stats"] {
  const bySubject: GeneratedPlan["stats"]["bySubject"] = {};
  for (const task of tasks) {
    const title =
      resources.find((resource) => resource.subjectId === task.subjectId)?.subjectTitle ??
      task.subjectId;
    bySubject[task.subjectId] ??= { title, minutes: 0, units: 0 };
    bySubject[task.subjectId].minutes += task.estMinutes;
    bySubject[task.subjectId].units += task.targetUnits;
  }

  return {
    capacityMinutes,
    plannedMinutes: tasks.reduce((sum, task) => sum + task.estMinutes, 0),
    plannedUnits: tasks.reduce((sum, task) => sum + task.targetUnits, 0),
    bySubject,
  };
}

function emptyPlan(weekStart: string, capacityMinutes: number, warnings: string[]): GeneratedPlan {
  return {
    weekStart,
    tasks: [],
    warnings,
    stats: {
      capacityMinutes,
      plannedMinutes: 0,
      plannedUnits: 0,
      bySubject: {},
    },
  };
}

export function planWeekStartFor(isoDate: string): string {
  const weekday = weekdayIndex(isoDate);
  return addDays(isoDate, -weekday);
}

export function nextWeekStart(isoDate: string): string {
  return addDays(planWeekStartFor(isoDate), 7);
}
