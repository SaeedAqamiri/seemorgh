import { describe, expect, it } from "vitest";
import type { PerformanceCellJson, PerformanceGridJson } from "@/db/schema";
import {
  aggregateGroupStats,
  buildGroupLeaderboard,
  subjectInScope,
  type GroupMemberRow,
  type PerformancePanelRow,
  type SubjectMeta,
} from "./group-performance";

function emptyRow(): PerformanceCellJson[] {
  return [{ kind: "empty" }];
}

function gridWith(cells: Record<number, PerformanceCellJson>): PerformanceGridJson {
  return Array.from({ length: 7 }, (_, day) => [cells[day] ?? { kind: "empty" }]);
}

const members: GroupMemberRow[] = [
  { id: "ali", name: "علی", grade: "دوازدهم", field: "تجربی" },
  { id: "maryam", name: "مریم", grade: "دوازدهم", field: "تجربی" },
];

const subjects: SubjectMeta[] = [
  { id: "phys", title: "فیزیک", kind: "specialized", color: "#1d4ed8" },
  { id: "chem", title: "شیمی", kind: "specialized", color: "#15803d" },
  { id: "eng", title: "زبان انگلیسی", kind: "general", color: "#2563eb" },
];

const panels: PerformancePanelRow[] = [
  {
    studentId: "ali",
    weekStart: "2026-11-07",
    grid: gridWith({
      0: {
        kind: "test",
        subjectId: "phys",
        resourceId: null,
        chapterId: null,
        count: 10,
        minutes: 40,
        note: "",
      },
      1: {
        kind: "exercise",
        subjectId: "eng",
        resourceId: null,
        chapterId: null,
        count: 5,
        minutes: 25,
        note: "",
      },
      2: { kind: "study", subjectId: "phys", resourceText: "", minutes: 30, note: "" },
    }),
  },
  {
    studentId: "maryam",
    weekStart: "2026-11-07",
    grid: gridWith({
      0: {
        kind: "timedTest",
        subjectId: "phys",
        resourceId: null,
        chapterId: null,
        count: 15,
        minutes: 50,
        note: "",
      },
      3: {
        kind: "exercise",
        subjectId: "eng",
        resourceId: null,
        chapterId: null,
        count: 8,
        minutes: 30,
        note: "",
      },
    }),
  },
  {
    studentId: "ali",
    weekStart: "2026-10-31",
    grid: gridWith({
      6: {
        kind: "test",
        subjectId: "chem",
        resourceId: null,
        chapterId: null,
        count: 99,
        minutes: 60,
        note: "",
      },
    }),
  },
];

const from = "2026-11-07";
const to = "2026-11-13";

describe("group performance aggregation", () => {
  it("aggregates tests, exercises and study minutes inside the range only", () => {
    const stats = aggregateGroupStats(panels, from, to);
    expect(stats.get("ali")?.get("phys")?.tests).toBe(10);
    expect(stats.get("ali")?.get("phys")?.studyMinutes).toBe(30);
    expect(stats.get("ali")?.get("eng")?.exercises).toBe(5);
    expect(stats.get("ali")?.get("chem")).toBeUndefined();
    expect(stats.get("maryam")?.get("phys")?.tests).toBe(15);
  });

  it("uses tests for specialized and exercises for general scopes", () => {
    const stats = aggregateGroupStats(panels, from, to);
    const specialized = buildGroupLeaderboard({
      scope: "specialized",
      members,
      subjects,
      stats,
      viewerId: "ali",
    });
    const general = buildGroupLeaderboard({
      scope: "general",
      members,
      subjects,
      stats,
      viewerId: "ali",
    });

    const physics = specialized.subjects.find((subject) => subject.subjectId === "phys");
    expect(physics?.champion?.name).toBe("مریم");
    expect(physics?.champion?.count).toBe(15);
    expect(physics?.viewer?.rank).toBe(2);
    expect(physics?.viewer?.average).toBe(12.5);

    const english = general.subjects.find((subject) => subject.subjectId === "eng");
    expect(english?.champion?.name).toBe("مریم");
    expect(english?.champion?.count).toBe(8);
    expect(english?.viewer?.count).toBe(5);

    const chemistry = specialized.subjects.find((subject) => subject.subjectId === "chem");
    expect(chemistry?.champion).toBeNull();
  });

  it("builds champion of champions as the sum across scoped subjects", () => {
    const stats = aggregateGroupStats(panels, from, to);
    const specialized = buildGroupLeaderboard({ scope: "specialized", members, subjects, stats });
    expect(specialized.overall.champion?.name).toBe("مریم");
    expect(specialized.overall.champion?.count).toBe(15);
    expect(specialized.overall.top.map((entry) => entry.studentId)).toEqual(["maryam", "ali"]);
  });

  it("scopes subjects by kind, keeping both-kind subjects in every scope", () => {
    expect(subjectInScope("general", "general")).toBe(true);
    expect(subjectInScope("specialized", "general")).toBe(false);
    expect(subjectInScope("both", "general")).toBe(true);
    expect(subjectInScope("both", "specialized")).toBe(true);
  });
});
