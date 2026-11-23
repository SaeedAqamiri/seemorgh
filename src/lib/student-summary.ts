import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  performancePanels,
  subjects,
  type PerformanceGridJson,
} from "@/db/schema";
import { listStudentExamResults } from "@/lib/exam-analysis";

export type SummaryExamPercent = {
  id: string;
  title: string;
  examDate: string;
  source: "internal" | "external";
  overallPercent: number;
};

export type SubjectActivityRow = {
  subjectId: string | null;
  subjectTitle: string;
  testCount: number;
  exerciseCount: number;
};

export type StudentSummary = {
  lastExams: SummaryExamPercent[];
  subjectActivity: SubjectActivityRow[];
  totalTests: number;
  totalExercises: number;
};

export const LAST_EXAMS_LIMIT = 3;

function countKind(cellKind: string, routineMode?: string): "test" | "exercise" | null {
  if (cellKind === "routine") return routineMode === "test" ? "test" : null;
  if (cellKind === "test" || cellKind === "timedTest" || cellKind === "practice") return "test";
  if (cellKind === "exercise") return "exercise";
  return null;
}

/**
 * Aggregates test/exercise counts per subject across any number of weekly
 * performance-panel grids. Pure so it stays unit-testable.
 */
export function summarizeSubjectActivity(
  grids: (PerformanceGridJson | null | undefined)[],
  subjectTitles: Map<string, string> = new Map(),
): SubjectActivityRow[] {
  type Aggregate = { subjectId: string | null; subjectTitle: string; testCount: number; exerciseCount: number };
  const bySubject = new Map<string, Aggregate>();

  for (const grid of grids) {
    if (!Array.isArray(grid)) continue;
    for (const row of grid) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (!("count" in cell) || !("subjectId" in cell)) continue;
        const kind = countKind(cell.kind, "routineMode" in cell ? cell.routineMode : undefined);
        if (!kind) continue;
        const count = Number.isFinite(cell.count) ? Math.max(0, Math.round(cell.count)) : 0;
        if (count === 0) continue;
        const subjectId = cell.subjectId ?? null;
        const key = subjectId ?? "__unknown__";
        const current = bySubject.get(key) ?? {
          subjectId,
          subjectTitle: subjectTitles.get(subjectId ?? "") ?? "—",
          testCount: 0,
          exerciseCount: 0,
        };
        if (kind === "test") current.testCount += count;
        else current.exerciseCount += count;
        bySubject.set(key, current);
      }
    }
  }

  return [...bySubject.values()].sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle, "fa"));
}

/**
 * Compact profile summary for a student: percentages of the last exams they
 * took (in-system + external workbooks merged, newest first) and the all-time
 * test/exercise totals per subject from their performance panels.
 */
export async function getStudentSummary(studentId: string): Promise<StudentSummary> {
  const db = await getDb();

  const [results, panels] = await Promise.all([
    listStudentExamResults(studentId),
    db
      .select({ cellsJson: performancePanels.cellsJson })
      .from(performancePanels)
      .where(eq(performancePanels.studentId, studentId)),
  ]);

  const subjectIds = new Set<string>();
  for (const panel of panels) {
    const grid = panel.cellsJson;
    if (!Array.isArray(grid)) continue;
    for (const row of grid) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if ("subjectId" in cell && cell.subjectId) subjectIds.add(cell.subjectId);
      }
    }
  }

  const subjectTitles = new Map<string, string>();
  if (subjectIds.size > 0) {
    const subjectRows = await db
      .select({ id: subjects.id, title: subjects.title })
      .from(subjects)
      .where(inArray(subjects.id, [...subjectIds]));
    for (const row of subjectRows) subjectTitles.set(row.id, row.title);
  }

  const subjectActivity = summarizeSubjectActivity(
    panels.map((panel) => panel.cellsJson),
    subjectTitles,
  );

  return {
    lastExams: results.slice(0, LAST_EXAMS_LIMIT).map((result) => ({
      id: result.id,
      title: result.title,
      examDate: result.examDate,
      source: result.source,
      overallPercent: result.overallPercent,
    })),
    subjectActivity,
    totalTests: subjectActivity.reduce((sum, row) => sum + row.testCount, 0),
    totalExercises: subjectActivity.reduce((sum, row) => sum + row.exerciseCount, 0),
  };
}
