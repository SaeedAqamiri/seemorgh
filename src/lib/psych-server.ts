import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  psychAttempts,
  psychDimensions,
  psychOptions,
  psychQuestions,
  psychTests,
  students,
  users,
  type PsychAttempt,
  type PsychDimension,
  type PsychOption,
  type PsychQuestion,
  type PsychResultRule,
  type PsychTest,
} from "@/db/schema";
import { scorePsychAttempt, findPsychBand, type PsychScoreResult, type PsychScoringDimension } from "./psych";
import { levelFromBands } from "./psych-ai";

export type PsychTestListItem = PsychTest & {
  questionCount: number;
  dimensionCount: number;
  attemptCount: number;
};

export async function listPsychTests(workspaceId: string): Promise<PsychTestListItem[]> {
  const db = await getDb();
  const tests = await db
    .select()
    .from(psychTests)
    .where(eq(psychTests.workspaceId, workspaceId))
    .orderBy(desc(psychTests.createdAt));

  if (tests.length === 0) return [];
  const ids = tests.map((test) => test.id);

  const [questionCounts, dimensionCounts, attemptCounts] = await Promise.all([
    db
      .select({ testId: psychQuestions.testId, count: sql<number>`count(*)::int` })
      .from(psychQuestions)
      .where(inArray(psychQuestions.testId, ids))
      .groupBy(psychQuestions.testId),
    db
      .select({ testId: psychDimensions.testId, count: sql<number>`count(*)::int` })
      .from(psychDimensions)
      .where(inArray(psychDimensions.testId, ids))
      .groupBy(psychDimensions.testId),
    db
      .select({ testId: psychAttempts.testId, count: sql<number>`count(*)::int` })
      .from(psychAttempts)
      .where(and(inArray(psychAttempts.testId, ids), eq(psychAttempts.status, "submitted")))
      .groupBy(psychAttempts.testId),
  ]);

  const questions = new Map(questionCounts.map((row) => [row.testId, row.count]));
  const dimensions = new Map(dimensionCounts.map((row) => [row.testId, row.count]));
  const attempts = new Map(attemptCounts.map((row) => [row.testId, row.count]));

  return tests.map((test) => ({
    ...test,
    questionCount: questions.get(test.id) ?? 0,
    dimensionCount: dimensions.get(test.id) ?? 0,
    attemptCount: attempts.get(test.id) ?? 0,
  }));
}

export type PsychTestQuestion = PsychQuestion & { options: PsychOption[] };

export type PsychTestContent = {
  test: PsychTest;
  dimensions: PsychDimension[];
  questions: PsychTestQuestion[];
  rules: PsychResultRule[];
};

export async function getPsychTestContent(
  workspaceId: string,
  testId: string,
): Promise<PsychTestContent | null> {
  const db = await getDb();
  const [test] = await db
    .select()
    .from(psychTests)
    .where(and(eq(psychTests.id, testId), eq(psychTests.workspaceId, workspaceId)))
    .limit(1);
  if (!test) return null;

  const [dimensions, questionRows, optionRows] = await Promise.all([
    db
      .select()
      .from(psychDimensions)
      .where(eq(psychDimensions.testId, testId))
      .orderBy(asc(psychDimensions.sortOrder)),
    db
      .select()
      .from(psychQuestions)
      .where(eq(psychQuestions.testId, testId))
      .orderBy(asc(psychQuestions.sortOrder)),
    db
      .select({ option: psychOptions })
      .from(psychOptions)
      .innerJoin(psychQuestions, eq(psychOptions.questionId, psychQuestions.id))
      .where(eq(psychQuestions.testId, testId))
      .orderBy(asc(psychOptions.sortOrder)),
  ]);

  const optionsByQuestion = new Map<string, PsychOption[]>();
  for (const row of optionRows) {
    const list = optionsByQuestion.get(row.option.questionId) ?? [];
    list.push(row.option);
    optionsByQuestion.set(row.option.questionId, list);
  }

  return {
    test,
    dimensions,
    questions: questionRows.map((question) => ({
      ...question,
      options: optionsByQuestion.get(question.id) ?? [],
    })),
    rules: test.resultRulesJson ?? [],
  };
}

export type PsychAttemptListItem = {
  attempt: PsychAttempt;
  participantName: string;
  participantRole: "counselor" | "student";
  studentName: string | null;
  testTitle: string;
};

export async function listPsychAttempts(
  workspaceId: string,
  testId: string,
): Promise<PsychAttemptListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      attempt: psychAttempts,
      participantName: users.name,
      studentName: students.name,
      testTitle: psychTests.title,
    })
    .from(psychAttempts)
    .innerJoin(users, eq(psychAttempts.userId, users.id))
    .leftJoin(students, eq(psychAttempts.studentId, students.id))
    .innerJoin(psychTests, eq(psychAttempts.testId, psychTests.id))
    .where(and(eq(psychAttempts.workspaceId, workspaceId), eq(psychAttempts.testId, testId)))
    .orderBy(desc(psychAttempts.createdAt));

  return rows.map((row) => ({
    attempt: row.attempt,
    participantName: row.participantName,
    participantRole: row.attempt.participantRole,
    studentName: row.studentName,
    testTitle: row.testTitle,
  }));
}

export async function listUserPsychAttempts(
  userId: string,
): Promise<PsychAttemptListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      attempt: psychAttempts,
      participantName: users.name,
      studentName: students.name,
      testTitle: psychTests.title,
    })
    .from(psychAttempts)
    .innerJoin(users, eq(psychAttempts.userId, users.id))
    .leftJoin(students, eq(psychAttempts.studentId, students.id))
    .innerJoin(psychTests, eq(psychAttempts.testId, psychTests.id))
    .where(eq(psychAttempts.userId, userId))
    .orderBy(desc(psychAttempts.createdAt));

  return rows.map((row) => ({
    attempt: row.attempt,
    participantName: row.participantName,
    participantRole: row.attempt.participantRole,
    studentName: row.studentName,
    testTitle: row.testTitle,
  }));
}

export type PsychAttemptView = {
  attempt: PsychAttempt;
  test: PsychTest;
  participantName: string;
  studentName: string | null;
  dimensions: PsychDimension[];
  rules: PsychResultRule[];
  result: PsychScoreResult;
};

export async function getPsychAttemptView(
  workspaceId: string,
  attemptId: string,
): Promise<PsychAttemptView | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      attempt: psychAttempts,
      test: psychTests,
      participantName: users.name,
      studentName: students.name,
    })
    .from(psychAttempts)
    .innerJoin(psychTests, eq(psychAttempts.testId, psychTests.id))
    .innerJoin(users, eq(psychAttempts.userId, users.id))
    .leftJoin(students, eq(psychAttempts.studentId, students.id))
    .where(and(eq(psychAttempts.id, attemptId), eq(psychAttempts.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;

  const dimensions = await db
    .select()
    .from(psychDimensions)
    .where(eq(psychDimensions.testId, row.test.id))
    .orderBy(asc(psychDimensions.sortOrder));

  const rules = row.test.resultRulesJson ?? [];
  const scoringDimensions: PsychScoringDimension[] = dimensions.map((dimension) => ({
    id: dimension.id,
    title: dimension.title,
    description: dimension.description,
    bands: dimension.bandsJson ?? [],
  }));
  const result = scorePsychAttempt(scoringDimensions, [row.attempt.scoresJson ?? {}], rules);

  return {
    attempt: row.attempt,
    test: row.test,
    participantName: row.participantName,
    studentName: row.studentName,
    dimensions,
    rules,
    result,
  };
}

export async function findInProgressAttempt(
  testId: string,
  userId: string,
): Promise<PsychAttempt | null> {
  const db = await getDb();
  const [attempt] = await db
    .select()
    .from(psychAttempts)
    .where(
      and(
        eq(psychAttempts.testId, testId),
        eq(psychAttempts.userId, userId),
        eq(psychAttempts.status, "in_progress"),
      ),
    )
    .orderBy(desc(psychAttempts.createdAt))
    .limit(1);
  return attempt ?? null;
}

export async function getAttemptForTaking(
  workspaceId: string,
  testId: string,
  attemptId: string,
  userId: string,
): Promise<{ attempt: PsychAttempt; content: PsychTestContent } | null> {
  const db = await getDb();
  const [attempt] = await db
    .select()
    .from(psychAttempts)
    .where(
      and(
        eq(psychAttempts.id, attemptId),
        eq(psychAttempts.testId, testId),
        eq(psychAttempts.workspaceId, workspaceId),
        eq(psychAttempts.userId, userId),
      ),
    )
    .limit(1);
  if (!attempt) return null;
  const content = await getPsychTestContent(workspaceId, testId);
  if (!content) return null;
  return { attempt, content };
}

export type PsychProfileDimensionRow = {
  title: string;
  description: string;
  score: number;
  bandLabel: string;
  bandAnalysis: string;
  level: "low" | "mid" | "high";
};

export type PsychProfileAttemptRow = {
  attempt: PsychAttempt;
  testTitle: string;
  testCategory: string;
  testDescription: string;
  dimensions: PsychProfileDimensionRow[];
};

const CATEGORY_ORDER: Record<string, number> = {
  academic: 0,
  career: 1,
  personal: 2,
  wellbeing: 3,
  general: 4,
};

export async function listStudentPsychAttemptViews(
  workspaceId: string,
  studentId: string,
): Promise<PsychProfileAttemptRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ attempt: psychAttempts, test: psychTests })
    .from(psychAttempts)
    .innerJoin(psychTests, eq(psychAttempts.testId, psychTests.id))
    .where(
      and(
        eq(psychAttempts.workspaceId, workspaceId),
        eq(psychAttempts.studentId, studentId),
        eq(psychAttempts.status, "submitted"),
      ),
    )
    .orderBy(desc(psychAttempts.submittedAt), desc(psychAttempts.createdAt));

  const latestByTest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByTest.has(row.test.id)) latestByTest.set(row.test.id, row);
  }
  const latest = [...latestByTest.values()];
  if (latest.length === 0) return [];

  const testIds = latest.map((row) => row.test.id);
  const dimensionRows = await db
    .select()
    .from(psychDimensions)
    .where(inArray(psychDimensions.testId, testIds))
    .orderBy(asc(psychDimensions.sortOrder));
  const dimsByTest = new Map<string, typeof dimensionRows>();
  for (const dimension of dimensionRows) {
    const list = dimsByTest.get(dimension.testId) ?? [];
    list.push(dimension);
    dimsByTest.set(dimension.testId, list);
  }

  const views: PsychProfileAttemptRow[] = latest.map((row) => {
    const dimensions = (dimsByTest.get(row.test.id) ?? []).map((dimension) => {
      const score = row.attempt.scoresJson?.[dimension.id] ?? 0;
      const bands = dimension.bandsJson ?? [];
      const band = findPsychBand(bands, score);
      return {
        title: dimension.title,
        description: dimension.description,
        score,
        bandLabel: band?.label ?? "",
        bandAnalysis: band?.analysis ?? "",
        level: levelFromBands(band, bands),
      };
    });
    return {
      attempt: row.attempt,
      testTitle: row.test.title,
      testCategory: row.test.category,
      testDescription: row.test.description,
      dimensions,
    };
  });

  return views.sort((first, second) => {
    const categoryGap =
      (CATEGORY_ORDER[first.testCategory] ?? 9) - (CATEGORY_ORDER[second.testCategory] ?? 9);
    if (categoryGap !== 0) return categoryGap;
    return first.testTitle.localeCompare(second.testTitle, "fa");
  });
}
