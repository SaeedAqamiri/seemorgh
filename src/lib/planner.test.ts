import { describe, expect, it } from "vitest";
import { generatePlan, type PlannerInput } from "./planner";

const baseInput: PlannerInput = {
  weekStart: "2026-10-24",
  availability: [0, 1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMin: 16 * 60,
    endMin: 20 * 60,
  })),
  constraints: { maxDailyMinutes: 240, restWeekday: 6, bufferPct: 15 },
  resources: [
    {
      id: "res-bio",
      subjectId: "sub-bio",
      subjectTitle: "زیست",
      title: "زیست دوازدهم",
      unitType: "test",
      totalUnits: 1000,
      completedUnits: 400,
      priority: 5,
    },
    {
      id: "res-math",
      subjectId: "sub-math",
      subjectTitle: "ریاضی",
      title: "ریاضی تجربی",
      unitType: "test",
      totalUnits: 600,
      completedUnits: 100,
      priority: 4,
    },
  ],
  examTargets: [{ title: "کنکور", examDate: "2027-01-01", weight: 5 }],
};

describe("planner", () => {
  it("builds a plan with blocks inside availability windows", () => {
    const plan = generatePlan(baseInput);
    expect(plan.tasks.length).toBeGreaterThan(0);

    for (const task of plan.tasks) {
      expect(task.plannedEnd).toBeGreaterThan(task.plannedStart);
      expect(task.plannedStart).toBeGreaterThanOrEqual(16 * 60);
      expect(task.plannedEnd).toBeLessThanOrEqual(20 * 60);
      expect(task.estMinutes).toBe(task.plannedEnd - task.plannedStart);
    }
  });

  it("never plans on the rest weekday", () => {
    const plan = generatePlan(baseInput);
    expect(plan.tasks.some((task) => task.planDate === "2026-10-30")).toBe(false);
  });

  it("respects the daily cap and buffer", () => {
    const plan = generatePlan(baseInput);
    const capacityPerDay = Math.floor((240 * 85) / 100);

    for (const date of ["2026-10-24", "2026-10-25", "2026-10-26"]) {
      const minutes = plan.tasks
        .filter((task) => task.planDate === date)
        .reduce((sum, task) => sum + task.estMinutes, 0);
      expect(minutes).toBeLessThanOrEqual(capacityPerDay);
    }
  });

  it("does not exceed remaining resource units", () => {
    const plan = generatePlan(baseInput);
    const byResource = new Map<string, number>();
    for (const task of plan.tasks) {
      byResource.set(task.resourceId, (byResource.get(task.resourceId) ?? 0) + task.targetUnits);
    }
    expect(byResource.get("res-bio") ?? 0).toBeLessThanOrEqual(600);
    expect(byResource.get("res-math") ?? 0).toBeLessThanOrEqual(500);
  });

  it("returns a warning when there is no availability", () => {
    const plan = generatePlan({
      ...baseInput,
      availability: [],
      constraints: { ...baseInput.constraints, restWeekday: -1 },
    });
    expect(plan.tasks).toHaveLength(0);
    expect(plan.warnings[0]).toContain("زمان آزاد");
  });

  it("returns a warning when no resource has units remaining", () => {
    const plan = generatePlan({
      ...baseInput,
      resources: baseInput.resources.map((resource) => ({
        ...resource,
        completedUnits: resource.totalUnits,
      })),
    });
    expect(plan.tasks).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("corrects a week start that is not Saturday", () => {
    const plan = generatePlan({ ...baseInput, weekStart: "2026-10-26" });
    expect(plan.weekStart).toBe("2026-10-24");
    expect(plan.warnings[0]).toContain("شنبه");
  });
});
