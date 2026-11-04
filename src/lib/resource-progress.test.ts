import { describe, expect, it } from "vitest";
import type { PerformanceGridJson } from "@/db/schema";
import {
  diffResourcePracticeCounts,
  practiceCountsByResource,
  summarizeResourceProgress,
} from "./resource-progress";

const resources = [
  {
    id: "bio",
    subjectId: "s-bio",
    subjectTitle: "زیست",
    title: "زیست دوازدهم",
    unitType: "test" as const,
    totalUnits: 1000,
    completedUnits: 400,
  },
  {
    id: "chem",
    subjectId: "s-chem",
    subjectTitle: "شیمی",
    title: "شیمی دوازدهم",
    unitType: "test" as const,
    totalUnits: 800,
    completedUnits: 900,
  },
];

function gridWith(count: number, resourceId: string | null): PerformanceGridJson {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 5 }, () => ({ kind: "empty" }) as const),
  ).map((row, day) => {
    if (day !== 0) return [...row];
    return row.map((cell, slot) => {
      if (slot !== 0) return cell;
      return {
        kind: "practice" as const,
        subjectId: "s-bio",
        resourceId,
        count,
        startMin: 480,
        endMin: 600,
        note: "",
      };
    });
  });
}

describe("resource progress", () => {
  it("summarizes overall and per-subject progress with clamped totals", () => {
    const summary = summarizeResourceProgress(resources);

    expect(summary.totalUnits).toBe(1800);
    expect(summary.completedUnits).toBe(1200);
    expect(summary.remainingUnits).toBe(600);
    expect(summary.percent).toBe(67);
    expect(summary.rows.find((row) => row.id === "chem")).toMatchObject({
      completedUnits: 800,
      remainingUnits: 0,
      percent: 100,
    });
    expect(summary.bySubject.map((subject) => subject.subjectId)).toEqual(["s-bio", "s-chem"]);
  });

  it("returns zero progress for an empty resource list", () => {
    expect(summarizeResourceProgress([])).toEqual({
      totalUnits: 0,
      completedUnits: 0,
      remainingUnits: 0,
      percent: 0,
      rows: [],
      bySubject: [],
    });
  });

  it("counts only practice cells that point to a resource", () => {
    const first = gridWith(25, "bio");
    first[0][1] = {
      kind: "practice",
      subjectId: "s-bio",
      resourceId: null,
      count: 10,
      startMin: 480,
      endMin: 600,
      note: "",
    };
    first[0][2] = {
      kind: "review",
      subjectId: "s-bio",
      startMin: 480,
      endMin: 600,
      note: "",
    };

    const counts = practiceCountsByResource(first);
    expect(counts.get("bio")).toBe(25);
    expect(counts.size).toBe(1);
  });

  it("computes the delta between performance grids", () => {
    const before = gridWith(20, "bio");
    const after = gridWith(35, "bio");
    after[0][1] = {
      kind: "practice",
      subjectId: "s-chem",
      resourceId: "chem",
      count: 10,
      startMin: 480,
      endMin: 600,
      note: "",
    };

    const deltas = diffResourcePracticeCounts(before, after);
    expect(deltas.get("bio")).toBe(15);
    expect(deltas.get("chem")).toBe(10);
  });
});
