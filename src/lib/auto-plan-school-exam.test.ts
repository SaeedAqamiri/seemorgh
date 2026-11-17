import { describe, expect, it } from "vitest";
import {
  buildDeterministicAllocation,
  dateCapacity,
  scheduleAutoPlan,
  DEFAULT_PLANNING_POLICY,
  type AutoPlanInput,
} from "./auto-plan";

const base: AutoPlanInput = {
  startDate: "2026-11-21",
  targetDate: "2026-12-04",
  availability: [0, 1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 14 * 60, endMin: 20 * 60 })),
  constraints: { maxDailyMinutes: 360, restWeekday: 6, bufferPct: 0 },
  goals: [
    { subjectId: "bio", subjectTitle: "زیست‌شناسی", metric: "percent", currentValue: 30, targetValue: 60, weight: 5 },
  ],
  resources: [
    {
      id: "r-bio",
      subjectId: "bio",
      subjectTitle: "زیست‌شناسی",
      title: "تست زیست",
      unitType: "test",
      totalUnits: 1000,
      completedUnits: 0,
      priority: 5,
      chapters: [{ title: "فصل ۱ — مولکول‌های اطلاعاتی", pages: 0, startPage: 1, endPage: 0, testCount: 1000, completedTests: 0 }],
    },
  ],
  policy: { ...DEFAULT_PLANNING_POLICY },
  schoolPeriods: [
    { weekday: 0, startMin: 14 * 60, endMin: 16 * 60, subjectId: "math", subjectTitle: "ریاضی" },
  ],
  exams: [
    {
      id: "exam-1",
      title: "آزمون آزمایشی — مرحله ۱",
      date: "2026-11-27",
      startMin: 8 * 60,
      durationMinutes: 240,
      analysisMinutes: 120,
      budget: [{ subjectTitle: "زیست‌شناسی", chapters: ["مولکول‌های اطلاعاتی"], weight: 10 }],
    },
  ],
  level: "normal",
  systemSubjectId: "system-exam",
};

describe("school and exam anchors", () => {
  it("subtracts school from capacity", () => {
    const withoutSchool = dateCapacity(base.availability, base.constraints, "2026-11-21");
    const withSchool = dateCapacity(
      base.availability,
      base.constraints,
      "2026-11-21",
      base.schoolPeriods,
    );
    expect(withSchool).toBeLessThan(withoutSchool);
  });

  it("creates school, exam and analysis tasks and excludes them from study stats", () => {
    const plan = scheduleAutoPlan(base, buildDeterministicAllocation(base));
    const tasks = plan.weeks.flatMap((week) => week.tasks);
    expect(tasks.some((task) => task.type === "school")).toBe(true);
    expect(tasks.some((task) => task.type === "exam")).toBe(true);
    expect(tasks.some((task) => task.type === "exam_analysis")).toBe(true);
    const counted = tasks.filter(
      (task) => task.type !== "school" && task.type !== "exam" && task.type !== "exam_analysis",
    );
    const plannedMinutes = counted.reduce((sum, task) => sum + task.estMinutes, 0);
    expect(plan.weeks.reduce((sum, week) => sum + week.stats.plannedMinutes, 0)).toBe(plannedMinutes);
  });

  it("uses faster test speeds for strong students", () => {
    const normal = scheduleAutoPlan(base, buildDeterministicAllocation(base));
    const strongBase = { ...base, level: "strong" as const };
    const strong = scheduleAutoPlan(strongBase, buildDeterministicAllocation(strongBase));
    const tests = (plan: typeof normal) =>
      plan.weeks.flatMap((week) => week.tasks).filter((task) => task.type === "test").reduce((sum, task) => sum + task.targetUnits, 0);
    expect(tests(strong)).toBeGreaterThanOrEqual(tests(normal));
  });
});
