import { addDays, daysBetween, startOfWeekSaturday, weekDates, weekdayIndex } from "./dates";
import type {
  GeneratedPlan,
  PlannedTask,
  PlannerAvailability,
  PlannerChapter,
  PlannerConstraints,
  PlannerResource,
} from "./planner";

export type GoalMetric = "percent" | "score";

export type StudyGoalInput = {
  subjectId: string;
  subjectTitle: string;
  metric: GoalMetric;
  currentValue: number;
  targetValue: number;
  weight: number;
};

export type AllocationDistribution = "even" | "front_loaded" | "back_loaded";

export type PlanningStrategy = "balanced" | "weakest_first" | "exam_weighted";

export type PlanningPolicy = {
  strategy: PlanningStrategy;
  minutesPerPercentPoint: number;
  minutesPerTest: number;
  testsPerHour: number;
  exercisesPerHour: number;
  testRatioPct: number;
  reviewRatioPct: number;
  maxSubjectsPerDay: number;
  minBlockMinutes: number;
  maxBlockMinutes: number;
  fillCapacity: boolean;
  notes: string;
};

export type PlanningLevel = "weak" | "normal" | "strong";

export type SubjectSpeed = { testsPerHour: number; exercisesPerHour: number };

export type PlannerSchoolPeriod = {
  weekday: number;
  startMin: number;
  endMin: number;
  subjectId: string;
  subjectTitle: string;
};

export type PlannerExamBudget = {
  subjectTitle: string;
  chapters: string[];
  weight?: number;
};

export type PlannerExamAnchor = {
  id: string;
  title: string;
  date: string;
  startMin: number;
  durationMinutes: number;
  analysisMinutes: number;
  budget: PlannerExamBudget[];
};

export const DEFAULT_PLANNING_POLICY: PlanningPolicy = {
  strategy: "balanced",
  minutesPerPercentPoint: 60,
  minutesPerTest: 1.5,
  testsPerHour: 40,
  exercisesPerHour: 30,
  testRatioPct: 75,
  reviewRatioPct: 10,
  maxSubjectsPerDay: 3,
  minBlockMinutes: 30,
  maxBlockMinutes: 90,
  fillCapacity: true,
  notes:
    "اولویت با جبران فاصله هدف است؛ منابع لازم نیست کامل شوند و فقط به اندازه نیاز هدف از آن‌ها تمرین گرفته می‌شود. هر روز حداکثر سه درس، شروع با مرور کوتاه و پایان با تست.",
};

export type AutoPlanInput = {
  startDate: string;
  targetDate: string;
  availability: PlannerAvailability[];
  constraints: PlannerConstraints;
  goals: StudyGoalInput[];
  resources: PlannerResource[];
  policy: PlanningPolicy;
  schoolPeriods?: PlannerSchoolPeriod[];
  exams?: PlannerExamAnchor[];
  level?: PlanningLevel;
  subjectSpeeds?: Record<string, SubjectSpeed>;
  goalExamId?: string | null;
  systemSubjectId?: string;
};

export type SubjectAllocation = {
  subjectId: string;
  tests: number;
  studyMinutes: number;
  reviewMinutes: number;
  distribution: AllocationDistribution;
  focus: string;
};

export type AutoAllocation = {
  subjects: SubjectAllocation[];
  warnings: string[];
};

export type AutoPlanWeek = {
  weekStart: string;
  tasks: PlannedTask[];
  warnings: string[];
  stats: GeneratedPlan["stats"];
  dailyRoutine: string;
  nextWeekHomework: string;
};

export type GeneratedAutoPlan = {
  startDate: string;
  targetDate: string;
  weeks: AutoPlanWeek[];
  warnings: string[];
  allocation: AutoAllocation;
};

export type AutoAllocationValidation = {
  ok: boolean;
  allocation: AutoAllocation;
  warnings: string[];
  errors: string[];
};

export function metricScale(metric: GoalMetric): number {
  return metric === "score" ? 20 : 100;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizePolicy(value: unknown): PlanningPolicy {
  const source = (value ?? {}) as Partial<Record<keyof PlanningPolicy, unknown>>;
  const strategy =
    source.strategy === "weakest_first" || source.strategy === "exam_weighted"
      ? source.strategy
      : "balanced";

  const minBlock = Math.round(
    clampNumber(Number(source.minBlockMinutes ?? DEFAULT_PLANNING_POLICY.minBlockMinutes), 15, 120),
  );
  const maxBlock = Math.round(
    clampNumber(
      Number(source.maxBlockMinutes ?? DEFAULT_PLANNING_POLICY.maxBlockMinutes),
      minBlock,
      180,
    ),
  );

  return {
    strategy,
    minutesPerPercentPoint: clampNumber(
      Number(source.minutesPerPercentPoint ?? DEFAULT_PLANNING_POLICY.minutesPerPercentPoint),
      5,
      240,
    ),
    minutesPerTest: clampNumber(
      Number(source.minutesPerTest ?? DEFAULT_PLANNING_POLICY.minutesPerTest),
      0.5,
      10,
    ),
    testsPerHour: clampNumber(
      Number(source.testsPerHour ?? DEFAULT_PLANNING_POLICY.testsPerHour),
      5,
      120,
    ),
    exercisesPerHour: clampNumber(
      Number(source.exercisesPerHour ?? DEFAULT_PLANNING_POLICY.exercisesPerHour),
      5,
      120,
    ),
    testRatioPct: Math.round(
      clampNumber(Number(source.testRatioPct ?? DEFAULT_PLANNING_POLICY.testRatioPct), 0, 90),
    ),
    reviewRatioPct: Math.round(
      clampNumber(Number(source.reviewRatioPct ?? DEFAULT_PLANNING_POLICY.reviewRatioPct), 0, 50),
    ),
    maxSubjectsPerDay: Math.round(
      clampNumber(
        Number(source.maxSubjectsPerDay ?? DEFAULT_PLANNING_POLICY.maxSubjectsPerDay),
        1,
        6,
      ),
    ),
    minBlockMinutes: minBlock,
    maxBlockMinutes: maxBlock,
    fillCapacity:
      typeof source.fillCapacity === "boolean"
        ? source.fillCapacity
        : DEFAULT_PLANNING_POLICY.fillCapacity,
    notes: String(source.notes ?? DEFAULT_PLANNING_POLICY.notes).slice(0, 600),
  };
}

type Interval = { startMin: number; endMin: number };

function subtractIntervals(windows: Interval[], busy: Interval[]): Interval[] {
  let current = windows.map((window) => ({ ...window }));
  for (const block of busy) {
    const next: Interval[] = [];
    for (const window of current) {
      if (block.endMin <= window.startMin || block.startMin >= window.endMin) {
        next.push(window);
        continue;
      }
      if (block.startMin > window.startMin) {
        next.push({ startMin: window.startMin, endMin: block.startMin });
      }
      if (block.endMin < window.endMin) {
        next.push({ startMin: block.endMin, endMin: window.endMin });
      }
    }
    current = next;
  }
  return current.filter((window) => window.endMin > window.startMin);
}

export function capacityBusyBlocks(
  date: string,
  schoolPeriods: PlannerSchoolPeriod[] = [],
  exams: PlannerExamAnchor[] = [],
): Interval[] {
  const weekday = weekdayIndex(date);
  const blocks: Interval[] = schoolPeriods
    .filter((period) => period.weekday === weekday)
    .map((period) => ({ startMin: period.startMin, endMin: period.endMin }));
  for (const exam of exams) {
    if (exam.date === date) {
      blocks.push({
        startMin: exam.startMin,
        endMin: exam.startMin + exam.durationMinutes,
      });
      if (exam.analysisMinutes > 0) {
        blocks.push({
          startMin: exam.startMin + exam.durationMinutes,
          endMin: Math.min(24 * 60, exam.startMin + exam.durationMinutes + exam.analysisMinutes),
        });
      }
    }
  }
  return blocks;
}

export function dateCapacity(
  availability: PlannerAvailability[],
  constraints: PlannerConstraints,
  date: string,
  schoolPeriods: PlannerSchoolPeriod[] = [],
  exams: PlannerExamAnchor[] = [],
): number {
  const weekday = weekdayIndex(date);
  if (weekday === constraints.restWeekday) return 0;
  const windows = availability
    .filter((slot) => slot.weekday === weekday)
    .map((slot) => ({ startMin: slot.startMin, endMin: slot.endMin }));
  const free = subtractIntervals(windows, capacityBusyBlocks(date, schoolPeriods, exams));
  const total = free.reduce((sum, slot) => sum + Math.max(0, slot.endMin - slot.startMin), 0);
  const capped = Math.min(total, Math.max(0, constraints.maxDailyMinutes));
  const buffer = clampNumber(constraints.bufferPct, 0, 80);
  return Math.max(0, Math.floor((capped * (100 - buffer)) / 100));
}

export function planDates(input: Pick<AutoPlanInput, "startDate" | "targetDate">): string[] {
  const start = input.startDate;
  const end = input.targetDate;
  if (!end || end < start) return [];
  const total = Math.min(daysBetween(start, end), 370);
  return Array.from({ length: total + 1 }, (_, index) => addDays(start, index));
}

export function levelFactor(level: PlanningLevel | undefined): number {
  if (level === "strong") return 1.2;
  if (level === "weak") return 0.7;
  return 1;
}

export function subjectSpeedFor(input: AutoPlanInput, subjectId: string): SubjectSpeed {
  const override = input.subjectSpeeds?.[subjectId];
  const factor = levelFactor(input.level);
  return {
    testsPerHour: Math.max(1, override?.testsPerHour ?? input.policy.testsPerHour * factor),
    exercisesPerHour: Math.max(1, override?.exercisesPerHour ?? input.policy.exercisesPerHour * factor),
  };
}

function examFocusFor(input: AutoPlanInput, subjectId: string, subjectTitle: string): number {
  const exams = [...(input.exams ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (exams.length === 0) return 0;
  let score = 0;
  for (const exam of exams.slice(0, 4)) {
    const item = exam.budget.find(
      (entry) => entry.subjectTitle === subjectTitle || entry.subjectTitle === subjectId,
    );
    if (item) score += item.weight ?? Math.max(1, item.chapters.length);
  }
  return Math.min(1.5, score / 8);
}

type GoalDemand = {
  goal: StudyGoalInput;
  gapPct: number;
  requiredMinutes: number;
  demand: number;
};

function strategyExponent(strategy: PlanningStrategy): number {
  if (strategy === "weakest_first") return 1.6;
  if (strategy === "exam_weighted") return 0.85;
  return 1;
}

function subjectResources(input: AutoPlanInput, subjectId: string): PlannerResource[] {
  return input.resources
    .filter((resource) => resource.subjectId === subjectId)
    .sort((a, b) => b.priority - a.priority);
}

function goalDemand(input: AutoPlanInput, goal: StudyGoalInput): GoalDemand {
  const scale = metricScale(goal.metric);
  const current = clampNumber(goal.currentValue, 0, scale);
  const target = clampNumber(goal.targetValue, 0, scale);
  const gapPct = Math.max(0, ((target - current) / scale) * 100);
  const requiredMinutes = gapPct * input.policy.minutesPerPercentPoint;
  const exponent = strategyExponent(input.policy.strategy);
  const gapFactor = gapPct > 0 ? Math.pow(gapPct, exponent) : 0.08;
  const weightFactor =
    input.policy.strategy === "exam_weighted"
      ? Math.pow(clampNumber(goal.weight, 1, 5), 1.5)
      : clampNumber(goal.weight, 1, 5);
  return {
    goal,
    gapPct,
    requiredMinutes,
    demand: Math.max(0.08, gapFactor * weightFactor * (1 + examFocusFor(input, goal.subjectId, goal.subjectTitle))),
  };
}

function focusForGoal(input: AutoPlanInput, goal: StudyGoalInput, gapPct: number): string {
  const resources = subjectResources(input, goal.subjectId);
  const first = resources.find((resource) => resource.totalUnits > resource.completedUnits);
  const chapters = first?.chapters;
  if (chapters?.length) {
    const firstChapter = chapters[0];
    return `${goal.subjectTitle}: ${firstChapter.title} و ادامه مباحث (هدف ${gapPct.toFixed(
      0,
    )} درصد پیشرفت)`;
  }
  return `${goal.subjectTitle}: جبران ${gapPct.toFixed(0)} درصد فاصله تا هدف`;
}

export function buildDeterministicAllocation(input: AutoPlanInput): AutoAllocation {
  const warnings: string[] = [];
  const dates = planDates(input);
  const capacity = dates.reduce(
    (sum, date) => sum + dateCapacity(input.availability, input.constraints, date, input.schoolPeriods ?? [], input.exams ?? []),
    0,
  );

  if (input.targetDate < input.startDate) {
    return { subjects: [], warnings: ["تاریخ هدف باید بعد از تاریخ شروع باشد."] };
  }
  if (capacity === 0) {
    return { subjects: [], warnings: ["برای بازه هدف هیچ زمان آزادی ثبت نشده است."] };
  }
  if (input.goals.length === 0) {
    return { subjects: [], warnings: ["هیچ هدف درسی ثبت نشده است."] };
  }

  const demands = input.goals.map((goal) => goalDemand(input, goal));
  const totalDemand = demands.reduce((sum, item) => sum + item.demand, 0);
  const totalRequired = demands.reduce((sum, item) => sum + item.requiredMinutes, 0);

  if (totalRequired > capacity) {
    warnings.push(
      `ظرفیت زمانی این بازه (${Math.round(capacity / 60)} ساعت) از زمان لازم برای همه اهداف (${Math.round(
        totalRequired / 60,
      )} ساعت) کمتر است؛ برنامه با اولویت بیشترین فاصله ساخته می‌شود.`,
    );
  }

  const subjects: SubjectAllocation[] = [];

  for (const item of demands) {
    let minutes = totalRequired > 0 ? item.requiredMinutes : 0;

    if (input.policy.fillCapacity) {
      const extra = Math.max(0, capacity - totalRequired);
      if (extra > 0 && totalDemand > 0) {
        minutes += extra * (item.demand / totalDemand);
      }
    }
    if (!Number.isFinite(minutes) || minutes <= 0) continue;

    const scale = metricScale(item.goal.metric);
    const speed = subjectSpeedFor(input, item.goal.subjectId);
    const minutesPerTest = 60 / speed.testsPerHour;
    const clampedGap = Math.max(0, item.goal.targetValue - item.goal.currentValue);
    // Score-based (final exam) goals lean towards study; konkur percent goals lean towards tests.
    const testRatio =
      item.goal.metric === "score"
        ? Math.min(input.policy.testRatioPct, 40)
        : input.policy.testRatioPct;
    const reviewMinutes = (minutes * input.policy.reviewRatioPct) / 100;
    const testMinutes = (minutes * testRatio) / 100;
    const studyMinutes = Math.max(0, minutes - reviewMinutes - testMinutes);
    const tests = Math.round(testMinutes / minutesPerTest);

    const subjectResourceList = subjectResources(input, item.goal.subjectId);
    if (subjectResourceList.length === 0) {
      warnings.push(
        `برای ${item.goal.subjectTitle} منبعی ثبت نشده است؛ سهم این درس به تمرین آزاد اختصاص می‌یابد.`,
      );
    }

    const testResources = subjectResourceList.filter(
      (resource) => resource.unitType === "test" || resource.unitType === "exercise",
    );
    const remainingTests = testResources.reduce(
      (sum, resource) => sum + Math.max(0, resource.totalUnits - resource.completedUnits),
      0,
    );
    if (tests > remainingTests && remainingTests > 0) {
      warnings.push(
        `برای ${item.goal.subjectTitle} حدود ${tests.toLocaleString(
          "fa-IR",
        )} تست/تمرین پیش‌بینی شده ولی ${remainingTests.toLocaleString(
          "fa-IR",
        )} واحد در منابع باقی مانده است؛ ادامه به تمرین آزاد اختصاص می‌یابد.`,
      );
    }

    subjects.push({
      subjectId: item.goal.subjectId,
      tests,
      studyMinutes: Math.round(studyMinutes),
      reviewMinutes: Math.round(reviewMinutes),
      distribution: "even",
      focus: focusForGoal(input, item.goal, (clampedGap / scale) * 100),
    });
  }

  if (subjects.length === 0) {
    warnings.push("با اهداف فعلی برنامه‌ای قابل ساخت نیست.");
  }

  return { subjects, warnings };
}

function toNonNegativeNumber(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, number);
}

export function sanitizeAutoAllocation(
  input: AutoPlanInput,
  raw: unknown,
): AutoAllocationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = (raw ?? {}) as { subjects?: unknown; warnings?: unknown };
  const goalBySubject = new Map(input.goals.map((goal) => [goal.subjectId, goal]));

  if (Array.isArray(root.warnings)) {
    for (const warning of root.warnings.slice(0, 8)) {
      const text = String(warning ?? "").trim();
      if (text) warnings.push(text.slice(0, 300));
    }
  }

  const rawSubjects = Array.isArray(root.subjects) ? root.subjects : [];
  if (rawSubjects.length === 0) errors.push("خروجی AI هیچ درسی ندارد.");

  const seen = new Set<string>();
  const subjects: SubjectAllocation[] = [];

  for (const rawSubject of rawSubjects) {
    if (!rawSubject || typeof rawSubject !== "object") {
      errors.push("ساختار یکی از دروس خروجی نامعتبر است.");
      continue;
    }
    const record = rawSubject as Record<string, unknown>;
    const subjectId = String(record.subject_id ?? "").trim();
    const goal = goalBySubject.get(subjectId);
    if (!goal) {
      errors.push(`درس ${subjectId || "نامشخص"} در اهداف ثبت نشده است.`);
      continue;
    }
    if (seen.has(subjectId)) {
      errors.push(`درس ${goal.subjectTitle} تکراری است.`);
      continue;
    }
    seen.add(subjectId);

    const tests = Math.min(50_000, Math.round(toNonNegativeNumber(record.tests)));
    const studyMinutes = Math.min(400_000, Math.round(toNonNegativeNumber(record.study_minutes)));
    const reviewMinutes = Math.min(400_000, Math.round(toNonNegativeNumber(record.review_minutes)));
    const distributionRaw = String(record.distribution ?? "even");
    const distribution: AllocationDistribution =
      distributionRaw === "front_loaded" || distributionRaw === "back_loaded"
        ? distributionRaw
        : "even";

    if (tests + studyMinutes + reviewMinutes === 0) {
      warnings.push(`درس ${goal.subjectTitle} بدون زمان یا تست بود و نادیده گرفته شد.`);
      continue;
    }

    subjects.push({
      subjectId,
      tests,
      studyMinutes,
      reviewMinutes,
      distribution,
      focus: String(record.focus ?? goal.subjectTitle).slice(0, 220),
    });
  }

  const totals = subjects.reduce(
    (sum, subject) =>
      sum + subject.studyMinutes + subject.reviewMinutes + subject.tests * input.policy.minutesPerTest,
    0,
  );
  const dates = planDates(input);
  const capacity = dates.reduce(
    (sum, date) => sum + dateCapacity(input.availability, input.constraints, date, input.schoolPeriods ?? [], input.exams ?? []),
    0,
  );

  if (subjects.length === 0) {
    errors.push("هیچ درس معتبری با زمان یا تست در خروجی AI نبود.");
  } else if (totals === 0) {
    errors.push("مجموع زمان خروجی AI صفر است.");
  }

  if (capacity > 0 && totals > capacity * 2) {
    const factor = (capacity * 2) / totals;
    for (const subject of subjects) {
      subject.tests = Math.round(subject.tests * factor);
      subject.studyMinutes = Math.round(subject.studyMinutes * factor);
      subject.reviewMinutes = Math.round(subject.reviewMinutes * factor);
    }
    warnings.push("حجم خواسته‌شده AI بیش از ظرفیت بود و به سقف دو برابر ظرفیت محدود شد.");
  }

  return {
    ok: errors.length === 0 && subjects.length > 0,
    allocation: { subjects, warnings },
    warnings,
    errors,
  };
}

type Window = { startMin: number; endMin: number };

const BREAK_MIN = 5;
const MAX_BLOCKS_PER_DAY = 4;

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
    if (end <= window.endMin) return { start, end };
    cursor = Math.max(cursor, window.endMin + BREAK_MIN);
  }
  return null;
}

function minutesPerUnit(resource: PlannerResource | null): number {
  if (!resource) return 0;
  if (resource.unitType === "test") return 1.5;
  if (resource.unitType === "exercise") return 2;
  if (resource.unitType === "page") return 2;
  return 60;
}

type WeekAllocation = {
  subjectId: string;
  subjectTitle: string;
  testMinutes: number;
  reviewMinutes: number;
  studyMinutes: number;
};

type ResourceState = {
  resource: PlannerResource;
  remaining: number;
  consumed: number;
};

function allocationMinutes(input: AutoPlanInput, subject: SubjectAllocation): number {
  const speed = subjectSpeedFor(input, subject.subjectId);
  return (
    subject.studyMinutes +
    subject.reviewMinutes +
    subject.tests * (60 / speed.testsPerHour)
  );
}

function allocationWeights(
  subject: SubjectAllocation,
  weekCount: number,
): number[] {
  if (weekCount <= 1) return [1];
  return Array.from({ length: weekCount }, (_, index) => {
    if (subject.distribution === "front_loaded") return weekCount - index;
    if (subject.distribution === "back_loaded") return index + 1;
    return 1;
  });
}

function buildWeekBudgets(
  input: AutoPlanInput,
  allocation: AutoAllocation,
  weekStarts: string[],
  weekCapacities: number[],
): WeekAllocation[][] {
  const budgets = weekStarts.map(() =>
    allocation.subjects.map((subject) => ({
      subjectId: subject.subjectId,
      subjectTitle:
        input.goals.find((goal) => goal.subjectId === subject.subjectId)?.subjectTitle ??
        subject.subjectId,
      testMinutes: 0,
      reviewMinutes: 0,
      studyMinutes: 0,
    })),
  );

  allocation.subjects.forEach((subject) => {
    const distributionWeights = allocationWeights(subject, weekStarts.length);
    const weights = distributionWeights.map((weight, index) =>
      weight * Math.max(0, weekCapacities[index] ?? 0),
    );
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const totalMinutes = allocationMinutes(input, subject);
    const speed = subjectSpeedFor(input, subject.subjectId);
    const testShare = subject.tests * (60 / speed.testsPerHour);

    for (let index = 0; index < weekStarts.length; index += 1) {
      const ratio =
        weightSum > 0
          ? weights[index] / weightSum
          : 1 / Math.max(1, weekStarts.length);
      const bucket = budgets[index].find((item) => item.subjectId === subject.subjectId);
      if (!bucket) continue;
      bucket.testMinutes += testShare * ratio;
      bucket.reviewMinutes += subject.reviewMinutes * ratio;
      bucket.studyMinutes += subject.studyMinutes * ratio;
    }
  });

  return budgets;
}

function buildResourceStates(input: AutoPlanInput): Map<string, ResourceState> {
  const states = new Map<string, ResourceState>();
  for (const resource of input.resources) {
    states.set(resource.id, {
      resource,
      remaining: Math.max(0, resource.totalUnits - resource.completedUnits),
      consumed: 0,
    });
  }
  return states;
}

function normalizeTopic(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\s*[—–-]\s*/g, " ")
    .replace(/فصل\s*\d+/g, "")
    .replace(/درس\s*\d+/g, "")
    .replace(/[()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chapterMatches(target: string, title: string): boolean {
  const a = normalizeTopic(target);
  const b = normalizeTopic(title);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const tokens = a.split(" ").filter((token) => token.length > 2);
  return tokens.length > 0 && tokens.filter((token) => b.includes(token)).length >= Math.ceil(tokens.length / 2);
}

function targetChaptersForDate(input: AutoPlanInput, date: string): string[] {
  const next = (input.exams ?? [])
    .filter((exam) => exam.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return [];
  return next.budget.flatMap((item) => item.chapters);
}

function chapterAtUnits(
  resource: PlannerResource,
  startUnits: number,
): PlannerChapter | null {
  const chapters = resource.chapters ?? [];
  if (chapters.length === 0) return null;
  const sizeFor = (chapter: PlannerChapter) => {
    if (resource.unitType === "page") return Math.max(0, chapter.pages);
    if (resource.unitType === "exercise") return Math.max(0, chapter.exerciseCount ?? 0);
    if (resource.unitType === "chapter") return 1;
    return Math.max(0, chapter.testCount ?? 0);
  };
  const target = Math.max(0, startUnits);
  let cursor = 0;
  for (const chapter of chapters) {
    const size = sizeFor(chapter);
    if (size > 0 && target < cursor + size) return chapter;
    cursor += size;
  }
  return chapters.at(-1) ?? null;
}

function pickResource(
  states: Map<string, ResourceState>,
  subjectId: string,
  type: "test" | "study" | "review",
  targetChapters: string[] = [],
): ResourceState | null {
  const candidates = [...states.values()]
    .filter(
      (state) =>
        state.resource.subjectId === subjectId &&
        state.resource.totalUnits > 0 &&
        (state.remaining > 0 || type !== "test"),
    )
    .filter(
      (state) =>
        type !== "test" ||
        state.resource.unitType === "test" ||
        state.resource.unitType === "exercise",
    )
    .sort((a, b) => {
      const typeScore = (state: ResourceState) => {
        if (type === "test") return state.resource.unitType === "test" ? 0 : 1;
        return state.resource.unitType === "test" || state.resource.unitType === "exercise"
          ? 1
          : 0;
      };
      const diff = typeScore(a) - typeScore(b);
      if (diff !== 0) return diff;
      const matchScore = (state: ResourceState) =>
        targetChapters.length > 0 &&
        (state.resource.chapters ?? []).some((chapter) =>
          targetChapters.some((target) => chapterMatches(target, chapter.title)),
        )
          ? 1
          : 0;
      const matchDiff = matchScore(b) - matchScore(a);
      if (matchDiff !== 0) return matchDiff;
      if (b.resource.priority !== a.resource.priority) {
        return b.resource.priority - a.resource.priority;
      }
      return b.remaining - a.remaining;
    });
  return candidates[0] ?? null;
}

function resourceTopic(
  state: ResourceState,
  units: number,
  fallback: string,
): string {
  const resource = state.resource;
  const chapters = resource.chapters;
  if (resource.unitType === "page" && chapters?.length && units > 0) {
    // `consumed` already includes this block, so subtract it to get the start page.
    const startPage = resource.completedUnits + Math.max(0, state.consumed - units) + 1;
    const chapter = chapters.find(
      (entry) => startPage >= entry.startPage && startPage <= entry.endPage,
    );
    if (chapter) {
      return chapter.title;
    }
  }
  return resource.title || fallback;
}

function unitsForBlock(
  type: "test" | "study" | "review",
  minutes: number,
  resource: ResourceState | null,
  input: AutoPlanInput,
  subjectId: string,
): number {
  if (type === "test") {
    const speed = subjectSpeedFor(input, subjectId);
    const perUnit =
      resource?.resource.unitType === "exercise"
        ? 60 / speed.exercisesPerHour
        : 60 / speed.testsPerHour;
    return Math.max(1, Math.round(minutes / perUnit));
  }
  if (!resource) return 0;
  return Math.max(1, Math.round(minutes / minutesPerUnit(resource.resource)));
}

function takeUnits(
  state: ResourceState | null,
  units: number,
): { state: ResourceState | null; units: number } {
  if (!state) return { state: null, units };
  const taken = Math.min(units, state.remaining);
  state.remaining -= taken;
  state.consumed += taken;
  return { state, units: taken };
}

function countedTask(task: PlannedTask): boolean {
  return task.type !== "school" && task.type !== "exam" && task.type !== "exam_analysis";
}

function routineForWeek(tasks: PlannedTask[], goals: StudyGoalInput[]): string {
  const counted = tasks.filter(countedTask);
  if (counted.length === 0) return "";
  const bySubject = new Map<string, number>();
  for (const task of counted) {
    bySubject.set(task.subjectId, (bySubject.get(task.subjectId) ?? 0) + task.estMinutes);
  }
  const top = [...bySubject.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(
      ([subjectId]) =>
        goals.find((goal) => goal.subjectId === subjectId)?.subjectTitle ?? "درس",
    );
  return `این هفته تمرکز اصلی روی ${top.join("، ")} است. هر روز با ۱۰ تا ۱۵ دقیقه مرور شروع کن، بعد از هر بلوک ۵ دقیقه استراحت و پایان روز را به یک مرور کوتاه اختصاص بده.`;
}

function homeworkForWeek(tasks: PlannedTask[]): string {
  const tests = tasks
    .filter((task) => task.type === "test" || task.type === "exercise")
    .reduce((sum, task) => sum + task.targetUnits, 0);
  if (tests > 0) {
    return `پایان هفته: مرور تست‌ها و تمرین‌های غلط این هفته (حدود ${tests.toLocaleString(
      "fa-IR",
    )} واحد) و ثبت نتیجه در دفترچه عملکرد.`;
  }
  return "پایان هفته: مرور مباحث خوانده‌شده و ثبت پیشرفت منابع در دفترچه عملکرد.";
}

function scheduleWeek(
  input: AutoPlanInput,
  weekStart: string,
  weekBudgets: WeekAllocation[],
  states: Map<string, ResourceState>,
  warnings: string[],
): AutoPlanWeek {
  const dates = weekDates(weekStart).filter(
    (date) => date >= input.startDate && date <= input.targetDate,
  );
  const schoolPeriods = input.schoolPeriods ?? [];
  const exams = input.exams ?? [];
  const dayCapacities = new Map(
    dates.map((date) => [
      date,
      dateCapacity(input.availability, input.constraints, date, schoolPeriods, exams),
    ]),
  );
  const capacityMinutes = dates.reduce(
    (sum, date) => sum + (dayCapacities.get(date) ?? 0),
    0,
  );

  const buckets = weekBudgets.map((budget) => ({ ...budget }));
  const total = buckets.reduce(
    (sum, bucket) =>
      sum + bucket.studyMinutes + bucket.reviewMinutes + bucket.testMinutes,
    0,
  );

  if (total > capacityMinutes && total > 0) {
    const factor = capacityMinutes / total;
    for (const bucket of buckets) {
      bucket.studyMinutes *= factor;
      bucket.reviewMinutes *= factor;
      bucket.testMinutes *= factor;
    }
    warnings.push(
      `حجم برنامه هفته ${weekStart} بیش از ظرفیت بود و به اندازه ظرفیت همان هفته کاهش یافت.`,
    );
  } else if (input.policy.fillCapacity && total < capacityMinutes && total > 0) {
    const extra = capacityMinutes - total;
    const extraShare = extra / Math.max(1, buckets.length);
    for (const bucket of buckets) {
      bucket.studyMinutes += extraShare;
    }
  }

  const remaining = new Map<string, WeekAllocation>();
  for (const bucket of buckets) {
    remaining.set(bucket.subjectId, bucket);
  }

  const tasks: PlannedTask[] = [];
  const systemSubjectId = input.systemSubjectId ?? input.goals[0]?.subjectId ?? "";

  for (const date of dates) {
    const weekday = weekdayIndex(date);

    for (const period of schoolPeriods.filter((item) => item.weekday === weekday)) {
      tasks.push({
        planDate: date,
        plannedStart: period.startMin,
        plannedEnd: period.endMin,
        subjectId: period.subjectId,
        resourceId: "",
        chapterId: null,
        resourceText: period.subjectTitle,
        topic: period.subjectTitle,
        type: "school",
        actionKind: "school",
        routineMode: null,
        targetUnits: 0,
        estMinutes: Math.max(0, period.endMin - period.startMin),
        mockExamId: null,
      });
    }

    for (const exam of exams.filter((item) => item.date === date)) {
      const examEnd = Math.min(24 * 60, exam.startMin + exam.durationMinutes);
      tasks.push({
        planDate: date,
        plannedStart: exam.startMin,
        plannedEnd: examEnd,
        subjectId: systemSubjectId,
        resourceId: "",
        chapterId: null,
        resourceText: exam.title,
        topic: exam.title,
        type: "exam",
        actionKind: "exam",
        routineMode: null,
        targetUnits: 0,
        estMinutes: Math.max(0, examEnd - exam.startMin),
        mockExamId: exam.id,
      });
      if (exam.analysisMinutes > 0) {
        const analysisStart = Math.min(22 * 60, examEnd + 30);
        const analysisEnd = Math.min(24 * 60, analysisStart + exam.analysisMinutes);
        if (analysisEnd > analysisStart) {
          tasks.push({
            planDate: date,
            plannedStart: analysisStart,
            plannedEnd: analysisEnd,
            subjectId: systemSubjectId,
            resourceId: "",
            chapterId: null,
            resourceText: `تحلیل ${exam.title}`,
            topic: `تحلیل ${exam.title}`,
            type: "exam_analysis",
            actionKind: "examAnalysis",
            routineMode: null,
            targetUnits: 0,
            estMinutes: analysisEnd - analysisStart,
            mockExamId: exam.id,
          });
        }
      }
    }

    const baseWindows = mergeWindows(
      input.availability
        .filter((slot) => slot.weekday === weekday)
        .map((slot) => ({ startMin: slot.startMin, endMin: slot.endMin })),
    );
    const windows = subtractIntervals(
      baseWindows,
      capacityBusyBlocks(date, schoolPeriods, exams),
    );
    if (windows.length === 0) continue;

    let dayRemaining = dayCapacities.get(date) ?? 0;
    if (dayRemaining < input.policy.minBlockMinutes) continue;
    let cursor = windows[0].startMin;
    let lastSubjectId: string | null = null;
    const daySubjects = new Set<string>();
    const targetChapters = targetChaptersForDate(input, date);
    let safety = 0;
    let dayBlocks = 0;

    while (
      dayRemaining >= input.policy.minBlockMinutes &&
      safety < 80 &&
      dayBlocks < MAX_BLOCKS_PER_DAY
    ) {
      safety += 1;

      const candidates = [...remaining.values()].filter((bucket) => {
        const left = bucket.studyMinutes + bucket.reviewMinutes + bucket.testMinutes;
        if (left < input.policy.minBlockMinutes) return false;
        if (!daySubjects.has(bucket.subjectId)) {
          return daySubjects.size < input.policy.maxSubjectsPerDay;
        }
        return true;
      });

      if (candidates.length === 0) break;

      candidates.sort((a, b) => {
        const leftA = a.studyMinutes + a.reviewMinutes + a.testMinutes;
        const leftB = b.studyMinutes + b.reviewMinutes + b.testMinutes;
        const usedA = daySubjects.has(a.subjectId) ? 1 : 0;
        const usedB = daySubjects.has(b.subjectId) ? 1 : 0;
        if (usedA !== usedB) return usedA - usedB;
        if (b.subjectId === lastSubjectId && a.subjectId !== lastSubjectId) return -1;
        if (a.subjectId === lastSubjectId && b.subjectId !== lastSubjectId) return 1;
        return leftB - leftA;
      });

      const chosen =
        candidates.find((bucket) => bucket.subjectId !== lastSubjectId) ?? candidates[0];

      const typeOptions = (
        [
          { type: "test", minutes: chosen.testMinutes },
          { type: "study", minutes: chosen.studyMinutes },
          { type: "review", minutes: chosen.reviewMinutes },
        ] as const
      )
        .filter((option) => option.minutes >= input.policy.minBlockMinutes)
        .sort((a, b) => b.minutes - a.minutes);

      if (typeOptions.length === 0) break;

      const option = typeOptions[0];
      const duration = Math.min(
        input.policy.maxBlockMinutes,
        dayRemaining,
        Math.floor(option.minutes),
      );
      if (duration < input.policy.minBlockMinutes) break;

      const placement = placeBlock(windows, cursor, duration);
      if (!placement) break;

      const testResource = pickResource(states, chosen.subjectId, option.type, targetChapters);
      const fallbackResource =
        option.type === "test" && !testResource
          ? pickResource(states, chosen.subjectId, "study", targetChapters)
          : null;
      const resourceState = testResource ?? fallbackResource;
      const effectiveType =
        option.type === "test" && !testResource ? "study" : option.type;
      const rawUnits = unitsForBlock(effectiveType, duration, resourceState, input, chosen.subjectId);
      const taken = resourceState ? takeUnits(resourceState, rawUnits) : { state: null, units: rawUnits };
      const targetUnits = resourceState ? taken.units : rawUnits;
      const matchedChapterEntry = resourceState?.resource.chapters?.find((chapter) =>
        targetChapters.some((target) => chapterMatches(target, chapter.title)),
      );
      const chapterEntry =
        matchedChapterEntry ??
        (resourceState
          ? chapterAtUnits(
              resourceState.resource,
              Math.max(
                0,
                resourceState.resource.completedUnits +
                  resourceState.consumed -
                  targetUnits,
              ),
            )
          : null);
      const topic =
        chapterEntry?.title ??
        (option.type === "test" || !resourceState
          ? resourceState?.resource.title ?? chosen.subjectTitle
          : resourceTopic(resourceState, targetUnits, chosen.subjectTitle));

      const isExerciseResource = resourceState?.resource.unitType === "exercise";
      const taskType =
        effectiveType === "test" && !resourceState
          ? "study"
          : effectiveType === "test" && isExerciseResource
            ? "exercise"
            : effectiveType;
      const actionKind: PlannedTask["actionKind"] = taskType;

      tasks.push({
        planDate: date,
        plannedStart: placement.start,
        plannedEnd: placement.end,
        subjectId: chosen.subjectId,
        resourceId: taken.state?.resource.id ?? resourceState?.resource.id ?? "",
        chapterId: chapterEntry?.id ?? null,
        resourceText: topic,
        topic,
        type: taskType,
        actionKind,
        routineMode: null,
        targetUnits,
        estMinutes: duration,
        mockExamId: null,
      });

      if (option.type === "test") chosen.testMinutes -= duration;
      else if (option.type === "review") chosen.reviewMinutes -= duration;
      else chosen.studyMinutes -= duration;

      dayRemaining -= duration;
      dayBlocks += 1;
      cursor = placement.end + BREAK_MIN;
      lastSubjectId = chosen.subjectId;
      daySubjects.add(chosen.subjectId);
    }
  }

  for (const bucket of remaining.values()) {
    const left = bucket.studyMinutes + bucket.reviewMinutes + bucket.testMinutes;
    if (left >= input.policy.minBlockMinutes) {
      warnings.push(
        `بخشی از زمان ${bucket.subjectTitle} در هفته ${weekStart} (حدود ${Math.round(
          left,
        )} دقیقه) در زمان‌های آزاد جا نشد.`,
      );
    }
  }

  const bySubject: GeneratedPlan["stats"]["bySubject"] = {};
  for (const task of tasks.filter(countedTask)) {
    const title =
      input.goals.find((goal) => goal.subjectId === task.subjectId)?.subjectTitle ??
      task.subjectId;
    bySubject[task.subjectId] ??= { title, minutes: 0, units: 0 };
    bySubject[task.subjectId].minutes += task.estMinutes;
    bySubject[task.subjectId].units += task.targetUnits;
  }

  const countedTasks = tasks.filter(countedTask);
  return {
    weekStart,
    tasks,
    warnings,
    stats: {
      capacityMinutes,
      plannedMinutes: countedTasks.reduce((sum, task) => sum + task.estMinutes, 0),
      plannedUnits: countedTasks.reduce((sum, task) => sum + task.targetUnits, 0),
      bySubject,
    },
    dailyRoutine: routineForWeek(tasks, input.goals),
    nextWeekHomework: homeworkForWeek(tasks),
  };
}

export function scheduleAutoPlan(
  input: AutoPlanInput,
  allocation: AutoAllocation,
): GeneratedAutoPlan {
  const warnings: string[] = [];
  const dates = planDates(input);

  if (dates.length === 0 || allocation.subjects.length === 0) {
    return {
      startDate: input.startDate,
      targetDate: input.targetDate,
      weeks: [],
      warnings:
        allocation.warnings.length > 0
          ? allocation.warnings
          : ["برای ساخت برنامه، اهداف و بازه زمانی معتبر لازم است."],
      allocation,
    };
  }

  const firstWeek = startOfWeekSaturday(input.startDate);
  const weekStarts: string[] = [];
  let cursor = firstWeek;
  while (cursor <= input.targetDate) {
    weekStarts.push(cursor);
    cursor = addDays(cursor, 7);
    if (weekStarts.length > 60) break;
  }

  const weekCapacities = weekStarts.map((weekStart) =>
    weekDates(weekStart)
      .filter((date) => date >= input.startDate && date <= input.targetDate)
      .reduce(
        (sum, date) => sum + dateCapacity(input.availability, input.constraints, date, input.schoolPeriods ?? [], input.exams ?? []),
        0,
      ),
  );
  const weekBudgets = buildWeekBudgets(input, allocation, weekStarts, weekCapacities);
  const states = buildResourceStates(input);
  const weeks = weekStarts.map((weekStart, index) =>
    scheduleWeek(input, weekStart, weekBudgets[index], states, warnings),
  );

  const filtered = weeks.filter((week) => week.tasks.length > 0);
  const uniqueWarnings = [...new Set([...allocation.warnings, ...warnings])];

  if (filtered.length === 0) {
    uniqueWarnings.push("با داده‌های فعلی هیچ بلوک قابل برنامه‌ریزی ساخته نشد.");
  }

  return {
    startDate: input.startDate,
    targetDate: input.targetDate,
    weeks: filtered,
    warnings: uniqueWarnings,
    allocation,
  };
}
