import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  examAnalyses,
  performancePanels,
  subjects,
  type ExamAnalysisCauseRow,
  type ExamAnalysisGoalRow,
  type ExamAnalysisPreparationRow,
} from "@/db/schema";
import { startOfWeekSaturday } from "./dates";
import { konkurBudgetFor, listStudentExamResults, type ExamResultView } from "./exam-analysis";
import { normalizePerfGrid } from "./performance";

export const LOW_PERCENT_THRESHOLD = 30;
export const PREPARATION_WINDOW_DAYS = 45;

export type SkipStats = { consecutive: number; nonConsecutive: number; currentSkipped: boolean };

function titleKey(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

export function isLowPercent(percent: number): boolean {
  return percent < LOW_PERCENT_THRESHOLD;
}

/**
 * Count how many times the student dropped (حذف کرد) each subject up to and
 * including this exam: an exam counts as dropped when the subject is missing
 * or percent is 0. `consecutive` is the trailing streak of drops ending at
 * this exam; `nonConsecutive` is the rest.
 */
export function computeSkipStats(
  previous: ExamResultView[],
  current: ExamResultView,
): Map<string, SkipStats> {
  const ordered = [...previous]
    .filter((exam) => exam.examDate < current.examDate)
    .sort((a, b) => a.examDate.localeCompare(b.examDate));
  const sequence = [...ordered, current];

  const titles = new Set<string>();
  for (const subject of current.subjects) titles.add(titleKey(subject.subjectTitle));
  for (const exam of ordered) {
    for (const subject of exam.subjects) titles.add(titleKey(subject.subjectTitle));
  }

  const stats = new Map<string, SkipStats>();
  for (const title of titles) {
    const dropped = sequence.map(
      (exam) =>
        !exam.subjects.find((entry) => titleKey(entry.subjectTitle) === title) ||
        exam.subjects.find((entry) => titleKey(entry.subjectTitle) === title)!.percent === 0,
    );
    const total = dropped.filter(Boolean).length;
    let consecutive = 0;
    for (let index = dropped.length - 1; index >= 0 && dropped[index]; index -= 1) {
      consecutive += 1;
    }
    stats.set(title, {
      consecutive,
      nonConsecutive: total - consecutive,
      currentSkipped: dropped[dropped.length - 1],
    });
  }
  return stats;
}

export type PreparationSubjectData = {
  subjectId: string | null;
  subjectTitle: string;
  topicTests: number;
  timedTests: number;
  avgPercent: number | null;
  approxPercent: number | null;
};

/** Deterministic step-2 data: study volumes before the exam + past averages. */
export async function buildPreparationData(input: {
  studentId: string;
  workspaceId: string;
  exam: ExamResultView;
}): Promise<PreparationSubjectData[]> {
  const db = await getDb();
  const examDate = input.exam.examDate;
  const windowStart = new Date(
    new Date(`${examDate.slice(0, 10)}T00:00:00Z`).getTime() -
      PREPARATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  const subjectRows = await db
    .select({ id: subjects.id, title: subjects.title })
    .from(subjects)
    .where(eq(subjects.workspaceId, input.workspaceId));
  const titleById = new Map(subjectRows.map((row) => [row.id, row.title]));

  const panelRows = await db
    .select({ weekStart: performancePanels.weekStart, cellsJson: performancePanels.cellsJson })
    .from(performancePanels)
    .where(
      and(
        eq(performancePanels.studentId, input.studentId),
        sql`${performancePanels.weekStart} >= ${startOfWeekSaturday(windowStart)}`,
        sql`${performancePanels.weekStart} <= ${examDate.slice(0, 10)}`,
      ),
    );

  type Volume = { topicTests: number; timedTests: number };
  const volumeByTitle = new Map<string, Volume>();
  for (const panel of panelRows) {
    const grid = normalizePerfGrid(panel.cellsJson);
    for (const day of grid) {
      for (const cell of day) {
        if (cell.kind === "empty" || cell.kind === "rest") continue;
        if (!("subjectId" in cell) || !cell.subjectId) continue;
        const title = titleById.get(cell.subjectId);
        if (!title) continue;
        const key = titleKey(title);
        const current = volumeByTitle.get(key) ?? { topicTests: 0, timedTests: 0 };
        if (cell.kind === "test") current.topicTests += Math.max(0, cell.count);
        if (cell.kind === "timedTest") current.timedTests += Math.max(0, cell.count);
        volumeByTitle.set(key, current);
      }
    }
  }

  return input.exam.subjects.map((subject) => {
    const key = titleKey(subject.subjectTitle);
    const volume = volumeByTitle.get(key) ?? { topicTests: 0, timedTests: 0 };
    return {
      subjectId: subject.subjectId,
      subjectTitle: subject.subjectTitle,
      topicTests: volume.topicTests,
      timedTests: volume.timedTests,
      avgPercent: null,
      approxPercent: subject.percent,
    } satisfies PreparationSubjectData;
  });
}

function previousAverage(previous: ExamResultView[], key: string): number | null {
  const values: number[] = [];
  for (const exam of previous) {
    for (const subject of exam.subjects) {
      if (titleKey(subject.subjectTitle) === key) values.push(subject.percent);
    }
  }
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Average percent of a subject across all exams before this one. */
export function buildPreviousAverages(
  allResults: ExamResultView[],
  exam: ExamResultView,
): Map<string, number> {
  const previous = allResults.filter((result) => result.examDate < exam.examDate);
  const averages = new Map<string, number>();
  for (const subject of exam.subjects) {
    const key = titleKey(subject.subjectTitle);
    const value = previousAverage(previous, key);
    if (value !== null) averages.set(key, value);
  }
  return averages;
}

/** Merge saved causes/actions over the exam's fresh score rows. */
export function hydrateStep1Rows(
  exam: ExamResultView,
  saved: ExamAnalysisCauseRow[] | null | undefined,
): ExamAnalysisCauseRow[] {
  const savedByTitle = new Map(
    (saved ?? []).map((row) => [titleKey(row.subjectTitle), row] as const),
  );
  return exam.subjects.map((subject) => {
    const prior = savedByTitle.get(titleKey(subject.subjectTitle));
    return {
      subjectId: subject.subjectId,
      subjectTitle: subject.subjectTitle,
      percent: subject.percent,
      wrong: subject.wrong,
      blank: subject.blank,
      total: subject.total,
      questionNote: prior?.questionNote ?? "",
      cause: prior?.cause ?? "",
      action: prior?.action ?? "",
      actionSource: prior?.actionSource ?? "",
    } satisfies ExamAnalysisCauseRow;
  });
}

export function hydrateStep2Rows(
  exam: ExamResultView,
  data: PreparationSubjectData[],
  averages: Map<string, number>,
  saved: ExamAnalysisPreparationRow[] | null | undefined,
): ExamAnalysisPreparationRow[] {
  const savedByTitle = new Map(
    (saved ?? []).map((row) => [titleKey(row.subjectTitle), row] as const),
  );
  return exam.subjects.map((subject) => {
    const key = titleKey(subject.subjectTitle);
    const prior = savedByTitle.get(key);
    const computed = data.find((entry) => titleKey(entry.subjectTitle) === key);
    return {
      subjectId: subject.subjectId,
      subjectTitle: subject.subjectTitle,
      topicTests: prior?.topicTests ?? computed?.topicTests ?? 0,
      timedTests: prior?.timedTests ?? computed?.timedTests ?? 0,
      avgPercent: prior?.avgPercent ?? averages.get(key) ?? null,
      approxPercent: prior?.approxPercent ?? subject.percent,
    } satisfies ExamAnalysisPreparationRow;
  });
}

/** Deterministic target suggestion when AI is unavailable or not requested. */
export function buildGoalBaseline(exam: ExamResultView): ExamAnalysisGoalRow[] {
  return exam.subjects.map((subject) => {
    const boost = subject.percent < LOW_PERCENT_THRESHOLD ? 15 : subject.percent < 50 ? 12 : subject.percent < 70 ? 8 : 5;
    return {
      subjectTitle: subject.subjectTitle,
      currentPercent: subject.percent,
      targetPercent: Math.min(100, subject.percent + boost),
      note: "",
    } satisfies ExamAnalysisGoalRow;
  });
}

export function hydrateStep3Rows(
  exam: ExamResultView,
  saved: ExamAnalysisGoalRow[] | null | undefined,
): ExamAnalysisGoalRow[] {
  const savedByTitle = new Map(
    (saved ?? []).map((row) => [titleKey(row.subjectTitle), row] as const),
  );
  return exam.subjects.map((subject) => {
    const prior = savedByTitle.get(titleKey(subject.subjectTitle));
    return {
      subjectTitle: subject.subjectTitle,
      currentPercent: subject.percent,
      targetPercent: prior?.targetPercent ?? null,
      note: prior?.note ?? "",
    } satisfies ExamAnalysisGoalRow;
  });
}

export function weightedTargetPercent(rows: ExamAnalysisGoalRow[]): number | null {
  const withTargets = rows.filter((row) => row.targetPercent !== null);
  if (withTargets.length === 0) return null;
  const weighted = withTargets.map((row) => ({
    percent: row.targetPercent as number,
    weight: konkurBudgetFor(row.subjectTitle)?.weight ?? 1,
  }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return null;
  return Math.round(
    weighted.reduce((sum, entry) => sum + entry.percent * entry.weight, 0) / totalWeight,
  );
}

export async function getExamAnalysisRow(studentId: string, examSource: string, examRefId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(examAnalyses)
    .where(
      and(
        eq(examAnalyses.studentId, studentId),
        eq(examAnalyses.examSource, examSource),
        eq(examAnalyses.examRefId, examRefId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Everything the 3-step wizard needs, loaded once per page render. */
export type ExamWizardData = {
  role: "student" | "counselor";
  studentId: string;
  examSource: string;
  examRefId: string;
  examTitle: string;
  weightedPercent: number;
  step1Rows: ExamAnalysisCauseRow[];
  counselorNoteHigh: string;
  counselorNoteLow: string;
  step2Rows: ExamAnalysisPreparationRow[];
  advice: string;
  adviceApproved: boolean;
  step3Rows: ExamAnalysisGoalRow[];
  finalGoal: string;
  goalsSource: string;
  skipStats: { subjectTitle: string; consecutive: number; nonConsecutive: number }[];
  version: string;
};

export async function loadExamWizardData(input: {
  studentId: string;
  workspaceId: string;
  role: "student" | "counselor";
  exam: ExamResultView;
}): Promise<ExamWizardData> {
  const row = await getExamAnalysisRow(input.studentId, input.exam.source, input.exam.id);
  const [preparation, all] = await Promise.all([
    buildPreparationData({
      studentId: input.studentId,
      workspaceId: input.workspaceId,
      exam: input.exam,
    }),
    listStudentExamResults(input.studentId),
  ]);
  const averages = buildPreviousAverages(all, input.exam);
  const skipRaw = computeSkipStats(all, input.exam);
  const skipStats = input.exam.subjects
    .filter((subject) => isLowPercent(subject.percent))
    .map((subject) => {
      const stat = skipRaw.get(subject.subjectTitle.replace(/\s+/g, " ").trim());
      return {
        subjectTitle: subject.subjectTitle,
        consecutive: stat?.consecutive ?? 0,
        nonConsecutive: stat?.nonConsecutive ?? 0,
      };
    });

  return {
    role: input.role,
    studentId: input.studentId,
    examSource: input.exam.source,
    examRefId: input.exam.id,
    examTitle: input.exam.title,
    weightedPercent: input.exam.overallPercent,
    step1Rows: hydrateStep1Rows(input.exam, row?.step1Json),
    counselorNoteHigh: row?.counselorNoteHigh ?? "",
    counselorNoteLow: row?.counselorNoteLow ?? "",
    step2Rows: hydrateStep2Rows(input.exam, preparation, averages, row?.step2Json),
    advice: row?.counselorAdvice ?? "",
    adviceApproved: row?.adviceApproved ?? false,
    step3Rows: hydrateStep3Rows(input.exam, row?.step3Json),
    finalGoal: row?.finalGoal ?? "",
    goalsSource: row?.goalsSource ?? "",
    skipStats,
    version: row?.updatedAt?.toISOString() ?? "new",
  };
}
