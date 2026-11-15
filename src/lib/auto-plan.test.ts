import { describe, expect, it } from "vitest";
import {
  buildDeterministicAllocation,
  dateCapacity,
  normalizePolicy,
  sanitizeAutoAllocation,
  scheduleAutoPlan,
  DEFAULT_PLANNING_POLICY,
  type AutoPlanInput,
} from "./auto-plan";

const baseInput: AutoPlanInput = {
  startDate: "2026-10-24",
  targetDate: "2026-11-20",
  availability: [0, 1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMin: 16 * 60,
    endMin: 20 * 60,
  })),
  constraints: { maxDailyMinutes: 240, restWeekday: 6, bufferPct: 15 },
  goals: [
    {
      subjectId: "sub-math",
      subjectTitle: "ریاضی",
      metric: "percent",
      currentValue: 30,
      targetValue: 60,
      weight: 5,
    },
    {
      subjectId: "sub-bio",
      subjectTitle: "زیست",
      metric: "percent",
      currentValue: 50,
      targetValue: 60,
      weight: 4,
    },
  ],
  resources: [
    {
      id: "res-math",
      subjectId: "sub-math",
      subjectTitle: "ریاضی",
      title: "تست ریاضی",
      unitType: "test",
      totalUnits: 2000,
      completedUnits: 200,
      priority: 5,
    },
    {
      id: "res-bio",
      subjectId: "sub-bio",
      subjectTitle: "زیست",
      title: "تست زیست",
      unitType: "test",
      totalUnits: 1500,
      completedUnits: 500,
      priority: 4,
    },
  ],
  policy: { ...DEFAULT_PLANNING_POLICY },
};

describe("auto plan allocation", () => {
  it("gives the larger gap a larger share", () => {
    const allocation = buildDeterministicAllocation(baseInput);
    const math = allocation.subjects.find((subject) => subject.subjectId === "sub-math");
    const bio = allocation.subjects.find((subject) => subject.subjectId === "sub-bio");
    expect(math).toBeTruthy();
    expect(bio).toBeTruthy();
    expect(math!.tests).toBeGreaterThan(bio!.tests);
  });

  it("turns planned practice into exercise tasks for exercise resources", () => {
    const input: AutoPlanInput = {
      ...baseInput,
      goals: [
        {
          subjectId: "sub-lit",
          subjectTitle: "ادبیات",
          metric: "percent",
          currentValue: 20,
          targetValue: 60,
          weight: 5,
        },
      ],
      resources: [
        {
          id: "res-lit",
          subjectId: "sub-lit",
          subjectTitle: "ادبیات",
          title: "ادبیات دوازدهم",
          unitType: "exercise",
          totalUnits: 500,
          completedUnits: 0,
          priority: 5,
          chapters: [
            {
              title: "درس ۱",
              pages: 0,
              startPage: 1,
              endPage: 0,
              exerciseCount: 500,
              completedExercises: 0,
            },
          ],
        },
      ],
    };

    const plan = scheduleAutoPlan(input, buildDeterministicAllocation(input));
    const practice = plan.weeks
      .flatMap((week) => week.tasks)
      .filter((task) => task.type === "test" || task.type === "exercise");
    expect(practice.length).toBeGreaterThan(0);
    expect(
      practice.every((task) => task.type === "exercise" && task.actionKind === "exercise"),
    ).toBe(true);
  });

  it("warns when the horizon has no free time", () => {
    const allocation = buildDeterministicAllocation({ ...baseInput, availability: [] });
    expect(allocation.subjects).toHaveLength(0);
    expect(allocation.warnings.join(" ")).toContain("زمان آزاد");
  });

  it("normalizes policies into safe bounds", () => {
    const policy = normalizePolicy({
      strategy: "unknown",
      minutesPerPercentPoint: -5,
      minutesPerTest: 100,
      testRatioPct: 200,
      reviewRatioPct: -10,
      maxSubjectsPerDay: 99,
      minBlockMinutes: 5,
      maxBlockMinutes: 10,
      fillCapacity: false,
      notes: "x".repeat(1000),
    });
    expect(policy.strategy).toBe("balanced");
    expect(policy.minutesPerPercentPoint).toBe(5);
    expect(policy.testRatioPct).toBe(90);
    expect(policy.reviewRatioPct).toBe(0);
    expect(policy.maxSubjectsPerDay).toBe(6);
    expect(policy.minBlockMinutes).toBe(15);
    expect(policy.maxBlockMinutes).toBeGreaterThanOrEqual(policy.minBlockMinutes);
    expect(policy.notes.length).toBeLessThanOrEqual(600);
    expect(policy.fillCapacity).toBe(false);
  });
});

describe("auto plan scheduler", () => {
  it("places blocks inside availability and before the target date", () => {
    const allocation = buildDeterministicAllocation(baseInput);
    const plan = scheduleAutoPlan(baseInput, allocation);
    expect(plan.weeks.length).toBeGreaterThan(0);

    for (const week of plan.weeks) {
      for (const task of week.tasks) {
        expect(task.planDate >= "2026-10-24").toBe(true);
        expect(task.planDate <= "2026-11-20").toBe(true);
        expect(task.plannedStart).toBeGreaterThanOrEqual(16 * 60);
        expect(task.plannedEnd).toBeLessThanOrEqual(20 * 60);
        expect(task.estMinutes).toBe(task.plannedEnd - task.plannedStart);
      }
    }
  });

  it("does not schedule on the rest day and respects daily capacity", () => {
    const allocation = buildDeterministicAllocation(baseInput);
    const plan = scheduleAutoPlan(baseInput, allocation);
    const tasks = plan.weeks.flatMap((week) => week.tasks);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some((task) => task.planDate === "2026-10-30")).toBe(false);

    const capacity = dateCapacity(
      baseInput.availability,
      baseInput.constraints,
      "2026-10-24",
    );
    expect(capacity).toBeGreaterThan(0);

    const byDate = new Map<string, number>();
    for (const task of tasks) {
      byDate.set(task.planDate, (byDate.get(task.planDate) ?? 0) + task.estMinutes);
    }
    for (const [date, minutes] of byDate.entries()) {
      expect(minutes).toBeLessThanOrEqual(
        dateCapacity(baseInput.availability, baseInput.constraints, date),
      );
    }
  });

  it("labels page blocks with the covering chapter", () => {
    const input: AutoPlanInput = {
      ...baseInput,
      goals: [
        {
          subjectId: "sub-bio",
          subjectTitle: "زیست",
          metric: "score",
          currentValue: 10,
          targetValue: 18,
          weight: 5,
        },
      ],
      resources: [
        {
          id: "res-bio-page",
          subjectId: "sub-bio",
          subjectTitle: "زیست",
          title: "کتاب زیست",
          unitType: "page",
          totalUnits: 300,
          completedUnits: 20,
          priority: 5,
          chapters: [
            { title: "فصل ۱", pages: 100, startPage: 1, endPage: 100 },
            { title: "فصل ۲", pages: 100, startPage: 101, endPage: 200 },
            { title: "فصل ۳", pages: 100, startPage: 201, endPage: 300 },
          ],
        },
      ],
    };
    const plan = scheduleAutoPlan(input, buildDeterministicAllocation(input));
    const topics = plan.weeks.flatMap((week) => week.tasks).map((task) => task.topic);
    expect(topics.some((topic) => topic.includes("فصل"))).toBe(true);
    expect(topics.every((topic) => !topic.includes("صفحه"))).toBe(true);
  });

  it("keeps test counts finite and positive for percent goals", () => {
    const allocation = buildDeterministicAllocation(baseInput);
    const plan = scheduleAutoPlan(baseInput, allocation);
    const tests = plan.weeks.flatMap((week) => week.tasks).filter((task) => task.type === "test");
    expect(tests.length).toBeGreaterThan(0);
    for (const task of tests) {
      expect(task.targetUnits).toBeGreaterThan(0);
      expect(Number.isFinite(task.targetUnits)).toBe(true);
    }
  });
});

describe("AI allocation validation", () => {
  it("accepts a valid allocation", () => {
    const result = sanitizeAutoAllocation(baseInput, {
      subjects: [
        {
          subject_id: "sub-math",
          tests: 600,
          study_minutes: 300,
          review_minutes: 100,
          distribution: "even",
          focus: "فصل‌های ضعیف",
        },
      ],
      warnings: [],
    });
    expect(result.ok).toBe(true);
    expect(result.allocation.subjects[0]?.tests).toBe(600);
  });

  it("rejects unknown subjects and empty output", () => {
    const unknown = sanitizeAutoAllocation(baseInput, {
      subjects: [{ subject_id: "nope", tests: 10 }],
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.errors.join(" ")).toContain("اهداف");

    const empty = sanitizeAutoAllocation(baseInput, { subjects: [] });
    expect(empty.ok).toBe(false);
  });

  it("clamps an over-budget AI allocation", () => {
    const result = sanitizeAutoAllocation(baseInput, {
      subjects: [
        {
          subject_id: "sub-math",
          tests: 50000,
          study_minutes: 400000,
          review_minutes: 400000,
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("ظرفیت");
  });
});
