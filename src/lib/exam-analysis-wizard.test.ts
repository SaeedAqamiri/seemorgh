import { describe, expect, it } from "vitest";
import type { ExamResultView, ExamSubjectResult } from "./exam-analysis";
import {
  buildGoalBaseline,
  computeSkipStats,
  hydrateStep1Rows,
  hydrateStep3Rows,
  isLowPercent,
  weightedTargetPercent,
} from "./exam-analysis-wizard";

function subject(partial: Partial<ExamSubjectResult>): ExamSubjectResult {
  return {
    subjectId: partial.subjectId ?? null,
    subjectTitle: partial.subjectTitle ?? "درس",
    percent: partial.percent ?? 0,
    correct: partial.correct ?? 0,
    wrong: partial.wrong ?? 0,
    blank: partial.blank ?? 0,
    total: partial.total ?? 0,
  };
}

function exam(
  id: string,
  examDate: string,
  subjects: ExamSubjectResult[],
  overallPercent = 0,
): ExamResultView {
  return {
    id,
    source: "external",
    title: `آزمون ${id}`,
    examDate,
    examType: "external",
    provider: "",
    subjects,
    overallPercent,
    note: "",
  };
}

describe("isLowPercent", () => {
  it("splits at the 30 percent threshold", () => {
    expect(isLowPercent(29)).toBe(true);
    expect(isLowPercent(30)).toBe(false);
    expect(isLowPercent(0)).toBe(true);
  });
});

describe("computeSkipStats", () => {
  it("counts consecutive and non-consecutive drops including the current exam", () => {
    const history = [
      exam("a", "2026-01-01", [subject({ subjectTitle: "زیست", percent: 60 })]),
      exam("b", "2026-02-01", [subject({ subjectTitle: "زیست", percent: 0 })]),
      exam("c", "2026-03-01", [subject({ subjectTitle: "زیست", percent: 50 })]),
      exam("d", "2026-04-01", [subject({ subjectTitle: "زیست", percent: 0 })]),
    ];
    const current = exam("e", "2026-05-01", [subject({ subjectTitle: "زیست", percent: 0 })]);
    const stats = computeSkipStats(history, current);
    const stat = stats.get("زیست");
    expect(stat?.consecutive).toBe(2);
    expect(stat?.nonConsecutive).toBe(1);
  });

  it("treats a missing subject as dropped and a passing subject as zero streak", () => {
    const history = [
      exam("a", "2026-01-01", [subject({ subjectTitle: "شیمی", percent: 0 })]),
      exam("b", "2026-02-01", [subject({ subjectTitle: "شیمی", percent: 45 })]),
    ];
    const current = exam("c", "2026-03-01", [subject({ subjectTitle: "شیمی", percent: 20 })]);
    const stats = computeSkipStats(history, current);
    const stat = stats.get("شیمی");
    expect(stat?.consecutive).toBe(0);
    expect(stat?.nonConsecutive).toBe(1);
    expect(stat?.currentSkipped).toBe(false);
  });
});

describe("hydrateStep1Rows", () => {
  it("merges saved causes over fresh score rows", () => {
    const current = exam("a", "2026-05-01", [
      subject({ subjectTitle: "فیزیک", percent: 45, wrong: 5, blank: 3 }),
    ]);
    const rows = hydrateStep1Rows(current, [
      {
        subjectId: null,
        subjectTitle: "فیزیک",
        percent: 90,
        wrong: 0,
        blank: 0,
        total: 0,
        questionNote: "۲، ۵",
        cause: "بی‌دقتی",
        action: "دفترچه اشتباه",
        actionSource: "user",
      },
    ]);
    expect(rows[0].percent).toBe(45);
    expect(rows[0].cause).toBe("بی‌دقتی");
    expect(rows[0].actionSource).toBe("user");
  });
});

describe("buildGoalBaseline", () => {
  it("suggests a bigger boost for weaker subjects and caps at 100", () => {
    const current = exam("a", "2026-05-01", [
      subject({ subjectTitle: "زیست", percent: 20 }),
      subject({ subjectTitle: "شیمی", percent: 96 }),
    ]);
    const goals = buildGoalBaseline(current);
    expect(goals[0].targetPercent).toBe(35);
    expect(goals[1].targetPercent).toBe(100);
  });
});

describe("hydrateStep3Rows", () => {
  it("starts empty and keeps saved targets", () => {
    const current = exam("a", "2026-05-01", [subject({ subjectTitle: "ریاضی", percent: 40 })]);
    expect(hydrateStep3Rows(current, [])[0].targetPercent).toBeNull();
    const saved = hydrateStep3Rows(current, [
      { subjectTitle: "ریاضی", currentPercent: 40, targetPercent: 55, note: "تست بیشتر" },
    ]);
    expect(saved[0].targetPercent).toBe(55);
    expect(saved[0].currentPercent).toBe(40);
  });
});

describe("weightedTargetPercent", () => {
  it("returns null when no targets and averages simple targets", () => {
    expect(weightedTargetPercent([])).toBeNull();
    expect(
      weightedTargetPercent([
        { subjectTitle: "a", currentPercent: 10, targetPercent: 50, note: "" },
        { subjectTitle: "b", currentPercent: 10, targetPercent: 70, note: "" },
      ]),
    ).toBe(60);
  });
});
