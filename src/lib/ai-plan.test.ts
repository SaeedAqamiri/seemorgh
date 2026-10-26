import { describe, expect, it } from "vitest";
import { validateAiPlan, type AiPlannerInput } from "./ai-plan";

const input: AiPlannerInput = {
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
      unitType: "page",
      totalUnits: 100,
      completedUnits: 20,
      priority: 5,
      chapters: [{ title: "فصل ۱", pages: 80, startPage: 1, endPage: 80 }],
    },
  ],
  examTargets: [],
};

function planWith(block: Record<string, unknown>, date = "2026-10-24") {
  return { days: [{ date, blocks: [block] }], warnings: [] };
}

const validBlock = {
  start_min: 16 * 60,
  minutes: 60,
  subject_id: "sub-bio",
  resource_id: "res-bio",
  topic: "فصل ۱",
  type: "study",
  target_units: 30,
  reason: "باقی‌مانده زیاد",
};

describe("AI plan validation", () => {
  it("accepts a valid plan", () => {
    const result = validateAiPlan(input, planWith(validBlock));
    expect(result.ok).toBe(true);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].targetUnits).toBe(30);
  });

  it("rejects units beyond the remaining amount", () => {
    const result = validateAiPlan(input, planWith({ ...validBlock, target_units: 200 }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("بیشتر");
  });

  it("rejects blocks outside availability or on the rest day", () => {
    const outside = validateAiPlan(input, planWith({ ...validBlock, start_min: 9 * 60 }));
    expect(outside.ok).toBe(false);
    expect(outside.errors.join(" ")).toContain("زمان آزاد");

    const restDay = validateAiPlan(
      input,
      planWith({ ...validBlock }, "2026-10-30"),
    );
    expect(restDay.ok).toBe(false);
    expect(restDay.errors.join(" ")).toContain("تعطیل");
  });

  it("rejects daily capacity overflow and unknown resources", () => {
    const overflow = validateAiPlan(input, {
      days: [
        {
          date: "2026-10-24",
          blocks: [
            { ...validBlock, start_min: 16 * 60, minutes: 120 },
            { ...validBlock, start_min: 18 * 60, minutes: 120 },
          ],
        },
      ],
    });
    expect(overflow.ok).toBe(false);
    expect(overflow.errors.join(" ")).toContain("ظرفیت");

    const unknown = validateAiPlan(input, planWith({ ...validBlock, resource_id: "nope" }));
    expect(unknown.ok).toBe(false);
  });
});
