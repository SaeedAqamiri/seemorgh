import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { resources, subjects, type PerformanceGridJson } from "@/db/schema";

export type ResourceProgressInput = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  title: string;
  unitType: "test" | "page" | "chapter";
  totalUnits: number;
  completedUnits: number;
};

export type ResourceProgressRow = ResourceProgressInput & {
  remainingUnits: number;
  percent: number;
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
    return {
      ...input,
      totalUnits: total,
      completedUnits: completed,
      remainingUnits: total - completed,
      percent: percentOf(completed, total),
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

export function practiceCountsByResource(
  grid: PerformanceGridJson | null | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!Array.isArray(grid)) return counts;

  for (const row of grid) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (cell?.kind !== "practice" || !cell.resourceId) continue;
      const count = Number.isFinite(cell.count) ? Math.max(0, Math.round(cell.count)) : 0;
      if (count === 0) continue;
      counts.set(cell.resourceId, (counts.get(cell.resourceId) ?? 0) + count);
    }
  }

  return counts;
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

  return summarizeResourceProgress(
    rows.map((row) => ({
      ...row,
      unitType: row.unitType as ResourceProgressInput["unitType"],
    })),
  );
}
