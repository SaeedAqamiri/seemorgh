import { describe, expect, it } from "vitest";
import type { PerformanceCellJson, PerformanceGridJson } from "@/db/schema";
import { summarizeSubjectActivity } from "./student-summary";

function cell(value: Record<string, unknown>): PerformanceCellJson {
  return value as unknown as PerformanceCellJson;
}

function testCell(
  subjectId: string | null,
  count: number,
  kind: string = "test",
): PerformanceCellJson {
  return cell({
    kind,
    subjectId,
    resourceId: "r1",
    chapterId: null,
    count,
    minutes: 30,
    note: "",
  });
}

function routineCell(subjectId: string, count: number, mode: "study" | "test"): PerformanceCellJson {
  return cell({
    kind: "routine",
    routineMode: mode,
    subjectId,
    resourceText: "کتاب",
    resourceId: "r1",
    chapterId: null,
    count,
    minutes: 60,
    note: "",
  });
}

describe("summarizeSubjectActivity", () => {
  it("aggregates test and exercise counts per subject across grids", () => {
    const gridA: PerformanceGridJson = [
      [testCell("s-bio", 20), testCell("s-chem", 10, "exercise")],
    ];
    const gridB: PerformanceGridJson = [
      [testCell("s-bio", 15, "timedTest"), testCell("s-bio", 5, "exercise")],
    ];

    const rows = summarizeSubjectActivity([gridA, gridB]);

    expect(rows).toHaveLength(2);
    const bio = rows.find((row) => row.subjectId === "s-bio");
    const chem = rows.find((row) => row.subjectId === "s-chem");
    expect(bio).toMatchObject({ testCount: 35, exerciseCount: 5 });
    expect(chem).toMatchObject({ testCount: 0, exerciseCount: 10 });
  });

  it("counts routine cells only when routineMode is test", () => {
    const grid: PerformanceGridJson = [
      [routineCell("s-bio", 12, "test"), routineCell("s-chem", 8, "study")],
    ];

    const rows = summarizeSubjectActivity([grid]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subjectId: "s-bio", testCount: 12, exerciseCount: 0 });
  });

  it("skips zero counts and empty grids", () => {
    const grid: PerformanceGridJson = [
      [testCell("s-bio", 0), { kind: "empty" }, { kind: "rest" }],
    ];

    expect(summarizeSubjectActivity([grid, null, undefined])).toEqual([]);
  });

  it("maps subject titles and falls back for unknown subjects", () => {
    const grid: PerformanceGridJson = [[testCell("s-bio", 10)]];
    const titles = new Map([["s-bio", "زیست‌شناسی"]]);

    const rows = summarizeSubjectActivity([grid], titles);
    expect(rows[0]?.subjectTitle).toBe("زیست‌شناسی");

    const unknown = summarizeSubjectActivity([[[testCell(null, 3)]]]);
    expect(unknown[0]?.subjectTitle).toBe("—");
  });

  it("counts legacy practice kind as tests", () => {
    const grid: PerformanceGridJson = [[testCell("s-bio", 7, "practice")]];

    const rows = summarizeSubjectActivity([grid]);

    expect(rows[0]?.testCount).toBe(7);
  });
});
