import { describe, expect, it } from "vitest";
import { deterministicPerformanceNarrative, type PerformanceNarrativeInput } from "./ai-performance";
import type { DayStartStatus, PerformanceAnalysis } from "./performance";

function day(overrides: Partial<DayStartStatus>): DayStartStatus {
  return {
    date: "2026-11-14",
    weekday: 0,
    plannedStartMin: 8 * 60,
    performedStartMin: 8 * 60,
    performedEndMin: null,
    status: "onplan",
    performedMinutes: 60,
    studyMinutes: 30,
    reviewMinutes: 0,
    testMinutes: 30,
    practiceCount: 10,
    ...overrides,
  };
}

const days: DayStartStatus[] = [
  day({ date: "2026-11-14", weekday: 0 }),
  day({ date: "2026-11-15", weekday: 1, performedStartMin: 9 * 60, status: "offplan", performedMinutes: 180, studyMinutes: 40, testMinutes: 140, practiceCount: 60 }),
  day({ date: "2026-11-16", weekday: 2 }),
  day({ date: "2026-11-17", weekday: 3, performedStartMin: 10 * 60, status: "offplan", performedMinutes: 150, studyMinutes: 30, testMinutes: 120, practiceCount: 50 }),
];

const analysis: PerformanceAnalysis = {
  weekStart: "2026-11-14",
  dates: days.map((item) => item.date),
  days,
  activeDays: days.length,
  onplanDays: days.filter((item) => item.status === "onplan").length,
  offplanDays: days.filter((item) => item.status === "offplan").length,
  totalMinutes: days.reduce((sum, item) => sum + item.performedMinutes, 0),
  totalPractice: days.reduce((sum, item) => sum + item.practiceCount, 0),
  hasAnyData: true,
};

const input: PerformanceNarrativeInput = {
  workspaceId: "ws",
  studentId: "st",
  analysis,
  plannedSubjectsByDay: [["ریاضی"], ["زیست‌شناسی"], ["ریاضی"], ["شیمی"]],
  notes: [],
  dailyRoutine: "",
  subjectSummary: [
    { title: "ریاضی", practiceMinutes: 200, studyMinutes: 60, testMinutes: 200 },
    { title: "زیست‌شناسی", practiceMinutes: 40, studyMinutes: 40, testMinutes: 40 },
  ],
  resourceProgress: [
    { subjectTitle: "ریاضی", title: "ریاضی جامع", percent: 35, remainingUnits: 400, remainingTests: 300 },
    { subjectTitle: "زیست‌شناسی", title: "زیست جامع", percent: 80, remainingUnits: 100, remainingTests: 80 },
  ],
  planningInsights: {
    subjectTimes: [],
    firstSubjectByDay: [
      { date: "2026-11-14", title: "ریاضی" },
      { date: "2026-11-15", title: "ریاضی" },
      { date: "2026-11-16", title: "ریاضی" },
    ],
  },
};

describe("deterministicPerformanceNarrative", () => {
  it("surfaces cross-variable insights instead of only restating totals", () => {
    const narrative = deterministicPerformanceNarrative(input);
    const paragraphs = narrative.split("\n\n");

    expect(paragraphs.length).toBeGreaterThan(3);
    expect(narrative).toContain("نکتهٔ غیربدیهی");
    expect(narrative).toContain("ریاضی");
    expect(narrative).toContain("اقدام هفتهٔ بعد");
  });

  it("returns a short explanation when there is no data", () => {
    const empty = deterministicPerformanceNarrative({
      ...input,
      analysis: { ...analysis, days: [], activeDays: 0, hasAnyData: false },
    });
    expect(empty).toContain("ثبت نشده");
  });
});
