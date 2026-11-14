import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { resourceChapters, resources, subjects, type PerformanceGridJson } from "@/db/schema";
import type { ActionDelta } from "./resource-chapters";

export type ChapterProgressInput = {
  id: string;
  title: string;
  pages: number;
  completedPages: number;
  testCount: number;
  completedTests: number;
  exerciseCount: number;
  completedExercises: number;
};

export type ResourceProgressInput = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  title: string;
  unitType: "test" | "page" | "chapter";
  totalUnits: number;
  completedUnits: number;
  chapters?: ChapterProgressInput[];
};

export type ResourceProgressRow = ResourceProgressInput & {
  remainingUnits: number;
  percent: number;
  remainingTests: number;
  remainingExercises: number;
};

export type SubjectProgressRow = {
  subjectId: string;
  subjectTitle: string;
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  percent: number;
  resources: ResourceProgressRow[];
};

export type ResourceProgressSummary = {
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  percent: number;
  rows: ResourceProgressRow[];
  bySubject: SubjectProgressRow[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentOf(completed: number, total: number): number {
  return total <= 0 ? 0 : Math.round((completed / total) * 100);
}

export function summarizeResourceProgress(
  inputs: ResourceProgressInput[],
): ResourceProgressSummary {
  const rows = inputs.map((input) => {
    const total = Math.max(0, input.totalUnits);
    const completed = clamp(input.completedUnits, 0, total);
    const chapters = (input.chapters ?? []).map((chapter) => ({
      ...chapter,
      remainingTests: Math.max(0, chapter.testCount - chapter.completedTests),
      remainingExercises: Math.max(0, chapter.exerciseCount - chapter.completedExercises),
    }));
    return {
      ...input,
      chapters,
      totalUnits: total,
      completedUnits: completed,
      remainingUnits: total - completed,
      percent: percentOf(completed, total),
      remainingTests: chapters.reduce((sum, chapter) => sum + chapter.remainingTests, 0),
      remainingExercises: chapters.reduce((sum, chapter) => sum + chapter.remainingExercises, 0),
    };
  });

  const bySubjectMap = new Map<string, SubjectProgressRow>();
  for (const row of rows) {
    const subject = bySubjectMap.get(row.subjectId) ?? {
      subjectId: row.subjectId,
      subjectTitle: row.subjectTitle,
      totalUnits: 0,
      completedUnits: 0,
      remainingUnits: 0,
      percent: 0,
      resources: [],
    };
    subject.totalUnits += row.totalUnits;
    subject.completedUnits += row.completedUnits;
    subject.remainingUnits += row.remainingUnits;
    subject.resources.push(row);
    bySubjectMap.set(row.subjectId, subject);
  }

  const bySubject = [...bySubjectMap.values()].map((subject) => ({
    ...subject,
    percent: percentOf(subject.completedUnits, subject.totalUnits),
  }));

  const totalUnits = rows.reduce((sum, row) => sum + row.totalUnits, 0);
  const completedUnits = rows.reduce((sum, row) => sum + row.completedUnits, 0);

  return {
    totalUnits,
    completedUnits,
    remainingUnits: Math.max(0, totalUnits - completedUnits),
    percent: percentOf(completedUnits, totalUnits),
    rows,
    bySubject,
  };
}

function testLikeKind(kind: string): "test" | "exercise" | null {
  if (kind === "test" || kind === "timedTest" || kind === "practice") return "test";
  if (kind === "exercise") return "exercise";
  return null;
}

export function practiceCountsByResource(
  grid: PerformanceGridJson | null | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!Array.isArray(grid)) return counts;

  for (const row of grid) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (!("resourceId" in cell) || !cell.resourceId) continue;
      const kind = cell.kind === "routine" ? (cell.routineMode === "test" ? "test" : null) : testLikeKind(cell.kind);
      if (!kind) continue;
      const count = Number.isFinite(cell.count) ? Math.max(0, Math.round(cell.count)) : 0;
      if (count === 0) continue;
      counts.set(cell.resourceId, (counts.get(cell.resourceId) ?? 0) + count);
    }
  }

  return counts;
}

function actionCounts(
  grid: PerformanceGridJson | null | undefined,
): Map<string, { resourceId: string; chapterId: string | null; kind: "test" | "exercise"; count: number }> {
  const counts = new Map<string, { resourceId: string; chapterId: string | null; kind: "test" | "exercise"; count: number }>();
  if (!Array.isArray(grid)) return counts;
  for (const row of grid) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (!("resourceId" in cell) || !cell.resourceId) continue;
      const kind =
        cell.kind === "routine"
          ? cell.routineMode === "test"
            ? "test"
            : null
          : testLikeKind(cell.kind);
      if (!kind) continue;
      const count = Number.isFinite(cell.count) ? Math.max(0, Math.round(cell.count)) : 0;
      if (count === 0) continue;
      const chapterId = "chapterId" in cell ? cell.chapterId ?? null : null;
      const key = `${cell.resourceId}|${chapterId ?? ""}|${kind}`;
      const current = counts.get(key);
      counts.set(key, {
        resourceId: cell.resourceId,
        chapterId,
        kind,
        count: (current?.count ?? 0) + count,
      });
    }
  }
  return counts;
}

export function diffResourceActionCounts(
  previous: PerformanceGridJson | null | undefined,
  next: PerformanceGridJson | null | undefined,
): ActionDelta[] {
  const before = actionCounts(previous);
  const after = actionCounts(next);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const deltas: ActionDelta[] = [];
  for (const key of keys) {
    const base = after.get(key) ?? before.get(key);
    if (!base) continue;
    const delta = (after.get(key)?.count ?? 0) - (before.get(key)?.count ?? 0);
    if (delta !== 0) {
      deltas.push({ resourceId: base.resourceId, chapterId: base.chapterId, kind: base.kind, delta });
    }
  }
  return deltas;
}

export function diffResourcePracticeCounts(
  previous: PerformanceGridJson | null | undefined,
  next: PerformanceGridJson | null | undefined,
): Map<string, number> {
  const before = practiceCountsByResource(previous);
  const after = practiceCountsByResource(next);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const deltas = new Map<string, number>();

  for (const id of ids) {
    const delta = (after.get(id) ?? 0) - (before.get(id) ?? 0);
    if (delta !== 0) deltas.set(id, delta);
  }

  return deltas;
}

export async function getStudentResourceProgress(
  studentId: string,
  workspaceId?: string,
): Promise<ResourceProgressSummary> {
  const db = await getDb();
  const conditions = [eq(resources.studentId, studentId)];
  if (workspaceId) conditions.push(eq(resources.workspaceId, workspaceId));

  const rows = await db
    .select({
      id: resources.id,
      subjectId: resources.subjectId,
      subjectTitle: subjects.title,
      title: resources.title,
      unitType: resources.unitType,
      totalUnits: resources.totalUnits,
      completedUnits: resources.completedUnits,
    })
    .from(resources)
    .innerJoin(subjects, eq(resources.subjectId, subjects.id))
    .where(and(...conditions))
    .orderBy(asc(subjects.title), asc(resources.title));

  const ids = rows.map((row) => row.id);
  const chapterRows = ids.length
    ? await db
        .select()
        .from(resourceChapters)
        .where(inArray(resourceChapters.resourceId, ids))
        .orderBy(asc(resourceChapters.resourceId), asc(resourceChapters.sortIndex))
    : [];
  const chaptersByResource = new Map<string, typeof chapterRows>();
  for (const chapter of chapterRows) {
    const list = chaptersByResource.get(chapter.resourceId) ?? [];
    list.push(chapter);
    chaptersByResource.set(chapter.resourceId, list);
  }

  return summarizeResourceProgress(
    rows.map((row) => ({
      ...row,
      unitType: row.unitType as ResourceProgressInput["unitType"],
      chapters: (chaptersByResource.get(row.id) ?? []).map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        pages: chapter.pages,
        completedPages: chapter.completedPages,
        testCount: chapter.testCount,
        completedTests: chapter.completedTests,
        exerciseCount: chapter.exerciseCount,
        completedExercises: chapter.completedExercises,
      })),
    })),
  );
}
