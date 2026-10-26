import "server-only";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  examAnswers,
  examAssignments,
  examAttempts,
  exams,
  questionBanks,
  questions,
  students,
  subjects,
} from "@/db/schema";
import {
  buildSnapshot,
  parseSnapshot,
  sanitizeBlueprint,
  selectExamQuestions,
  type SelectableQuestion,
} from "./exam";

export type ExamListItem = {
  id: string;
  title: string;
  status: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  totalScore: number;
  publishedAt: Date | null;
  assigned: number;
  submitted: number;
  graded: number;
};

export async function listExams(workspaceId: string): Promise<ExamListItem[]> {
  const db = await getDb();
  const examRows = await db
    .select()
    .from(exams)
    .where(eq(exams.workspaceId, workspaceId))
    .orderBy(sql`${exams.startAt} desc`);

  if (examRows.length === 0) return [];

  const assignmentRows = await db
    .select({
      examId: examAssignments.examId,
      assigned: sql<number>`count(*)::int`,
      submitted: sql<number>`count(*) filter (where ${examAssignments.status} = 'submitted')::int`,
    })
    .from(examAssignments)
    .where(
      inArray(
        examAssignments.examId,
        examRows.map((exam) => exam.id),
      ),
    )
    .groupBy(examAssignments.examId);

  const attemptRows = await db
    .select({
      examId: examAttempts.examId,
      graded: sql<number>`count(*) filter (where ${examAttempts.status} = 'graded')::int`,
    })
    .from(examAttempts)
    .where(
      inArray(
        examAttempts.examId,
        examRows.map((exam) => exam.id),
      ),
    )
    .groupBy(examAttempts.examId);

  const assignmentByExam = new Map(assignmentRows.map((row) => [row.examId, row]));
  const attemptByExam = new Map(attemptRows.map((row) => [row.examId, row]));

  return examRows.map((exam) => ({
    id: exam.id,
    title: exam.title,
    status: exam.status,
    startAt: exam.startAt,
    endAt: exam.endAt,
    durationMinutes: exam.durationMinutes,
    totalScore: exam.totalScore,
    publishedAt: exam.publishedAt,
    assigned: assignmentByExam.get(exam.id)?.assigned ?? 0,
    submitted: assignmentByExam.get(exam.id)?.submitted ?? 0,
    graded: attemptByExam.get(exam.id)?.graded ?? 0,
  }));
}

export async function getExamDetail(workspaceId: string, examId: string) {
  const db = await getDb();
  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.workspaceId, workspaceId), eq(exams.id, examId)))
    .limit(1);

  if (!exam) return null;

  const assignments = await db
    .select({
      assignment: examAssignments,
      student: students,
      attempt: examAttempts,
    })
    .from(examAssignments)
    .innerJoin(students, eq(examAssignments.studentId, students.id))
    .leftJoin(
      examAttempts,
      and(
        eq(examAttempts.examId, examAssignments.examId),
        eq(examAttempts.studentId, examAssignments.studentId),
      ),
    )
    .where(eq(examAssignments.examId, examId))
    .orderBy(asc(students.name));

  const answersByAttempt = new Map<string, (typeof examAnswers.$inferSelect)[]>();
  const attemptIds = assignments
    .map((row) => row.attempt?.id)
    .filter((value): value is string => Boolean(value));

  if (attemptIds.length > 0) {
    const answerRows = await db
      .select()
      .from(examAnswers)
      .where(inArray(examAnswers.attemptId, attemptIds));
    for (const answer of answerRows) {
      const list = answersByAttempt.get(answer.attemptId) ?? [];
      list.push(answer);
      answersByAttempt.set(answer.attemptId, list);
    }
  }

  return { exam, assignments, answersByAttempt };
}

export async function loadSelectableQuestions(workspaceId: string): Promise<SelectableQuestion[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: questions.id,
      subjectId: questions.subjectId,
      subjectTitle: subjects.title,
      topic: questions.topic,
      difficulty: questions.difficulty,
      type: questions.type,
      body: questions.body,
      optionsJson: questions.optionsJson,
      correctJson: questions.correctJson,
      score: questions.score,
      explanation: questions.explanation,
      externalKey: questions.externalKey,
    })
    .from(questions)
    .leftJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(and(eq(questions.workspaceId, workspaceId), eq(questions.status, "active")));

  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId,
    subjectTitle: row.subjectTitle ?? "",
    topic: row.topic,
    difficulty: row.difficulty,
    type: row.type,
    body: row.body,
    options: row.optionsJson,
    correct: row.correctJson ?? "",
    score: row.score,
    explanation: row.explanation,
    externalKey: row.externalKey,
  }));
}

export async function previewExamQuestions(workspaceId: string, examId: string) {
  const db = await getDb();
  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.workspaceId, workspaceId), eq(exams.id, examId)))
    .limit(1);
  if (!exam) return null;

  const blueprint = sanitizeBlueprint(exam.blueprintJson);
  const pool = await loadSelectableQuestions(workspaceId);
  const selection = selectExamQuestions(blueprint, pool, exam.id);
  return { exam, blueprint, ...selection };
}

export async function recomputeAttempt(attemptId: string): Promise<void> {
  const db = await getDb();
  const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
  if (!attempt) return;

  const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
  if (!exam) return;

  const snapshot = parseSnapshot(exam.questionSnapshotJson);
  const answers = await db.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));

  let score = 0;
  let ungradedShort = 0;

  for (const item of snapshot.items) {
    const answer = answerByQuestion.get(item.id);
    if (!answer) {
      if (item.type === "short") ungradedShort += 1;
      continue;
    }
    if (item.type === "short" && !answer.gradedAt) {
      ungradedShort += 1;
    }
    score += answer.score;
  }

  await db
    .update(examAttempts)
    .set({
      score,
      maxScore: snapshot.totalScore,
      status: ungradedShort > 0 ? "submitted" : "graded",
    })
    .where(eq(examAttempts.id, attemptId));
}

export async function gradeAttempt(finalAttemptId: string): Promise<void> {
  const db = await getDb();
  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.id, finalAttemptId))
    .limit(1);
  if (!attempt) return;

  const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
  if (!exam) return;

  const snapshot = parseSnapshot(exam.questionSnapshotJson);
  const existing = await db
    .select()
    .from(examAnswers)
    .where(eq(examAnswers.attemptId, attempt.id));

  for (const item of snapshot.items) {
    const answer = existing.find((row) => row.questionId === item.id);
    if (item.type === "mcq") {
      const given = answer?.answerJson;
      const isCorrect =
        given !== null &&
        given !== undefined &&
        (typeof given === "number"
          ? given === item.correct
          : String(given).trim() === String(item.correct).trim());
      if (answer) {
        await db
          .update(examAnswers)
          .set({ isCorrect, score: isCorrect ? item.score : 0, gradedAt: new Date(), gradedBy: "auto" })
          .where(eq(examAnswers.id, answer.id));
      } else {
        await db.insert(examAnswers).values({
          attemptId: attempt.id,
          questionId: item.id,
          answerJson: null,
          isCorrect: false,
          score: 0,
          gradedAt: new Date(),
          gradedBy: "auto",
        });
      }
    } else if (!answer) {
      await db.insert(examAnswers).values({
        attemptId: attempt.id,
        questionId: item.id,
        answerJson: null,
        isCorrect: null,
        score: 0,
      });
    }
  }

  await recomputeAttempt(attempt.id);
}

export async function finalizeAttempt(
  attemptId: string,
  options: { auto?: boolean; now?: Date } = {},
): Promise<void> {
  const db = await getDb();
  const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
  if (!attempt || attempt.status !== "in_progress") return;

  const now = options.now ?? new Date();
  const stoppedAt = now > attempt.deadlineAt ? attempt.deadlineAt : now;
  const elapsed = Math.max(0, Math.round((stoppedAt.getTime() - attempt.startedAt.getTime()) / 1000));

  await db
    .update(examAttempts)
    .set({ submittedAt: now, timeSpentSec: elapsed })
    .where(eq(examAttempts.id, attemptId));

  await gradeAttempt(attemptId);

  await db
    .update(examAssignments)
    .set({ status: "submitted" })
    .where(
      and(
        eq(examAssignments.examId, attempt.examId),
        eq(examAssignments.studentId, attempt.studentId),
      ),
    );
}

export async function finalizeExpiredAttempts(workspaceId?: string): Promise<void> {
  const db = await getDb();
  const now = new Date();

  const conditions = [
    eq(examAttempts.status, "in_progress"),
    lt(examAttempts.deadlineAt, now),
  ];

  if (workspaceId) conditions.push(eq(exams.workspaceId, workspaceId));

  const rows = await db
    .select({ id: examAttempts.id })
    .from(examAttempts)
    .innerJoin(exams, eq(examAttempts.examId, exams.id))
    .where(and(...conditions))
    .limit(200);

  for (const row of rows) {
    await finalizeAttempt(row.id, { auto: true, now });
  }
}

export async function getStudentExamList(studentId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      exam: exams,
      assignment: examAssignments,
      attempt: examAttempts,
    })
    .from(examAssignments)
    .innerJoin(exams, eq(examAssignments.examId, exams.id))
    .leftJoin(
      examAttempts,
      and(
        eq(examAttempts.examId, examAssignments.examId),
        eq(examAttempts.studentId, examAssignments.studentId),
      ),
    )
    .where(eq(examAssignments.studentId, studentId))
    .orderBy(asc(exams.startAt));

  return rows.filter((row) => row.exam.publishedAt !== null);
}

export async function getStudentExamContext(studentId: string, examId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ exam: exams, assignment: examAssignments })
    .from(examAssignments)
    .innerJoin(exams, eq(examAssignments.examId, exams.id))
    .where(and(eq(examAssignments.examId, examId), eq(examAssignments.studentId, studentId)))
    .limit(1);

  if (!row || row.exam.publishedAt === null) return null;

  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, studentId)))
    .orderBy(sql`${examAttempts.attemptNo} desc`)
    .limit(1);

  return { ...row, attempt: attempt ?? null };
}

export async function getExamResults(workspaceId: string, examId: string) {
  const detail = await getExamDetail(workspaceId, examId);
  if (!detail) return null;

  const snapshot = parseSnapshot(detail.exam.questionSnapshotJson);

  const attempts = detail.assignments
    .filter((row) => row.attempt)
    .map((row) => ({
      student: row.student,
      attempt: row.attempt!,
      answers: detail.answersByAttempt.get(row.attempt!.id) ?? [],
    }));

  const questionsStats = snapshot.items.map((item) => {
    let answered = 0;
    let correct = 0;
    let totalScore = 0;
    for (const attempt of attempts) {
      const answer = attempt.answers.find((entry) => entry.questionId === item.id);
      if (answer?.answerJson !== null && answer?.answerJson !== undefined) answered += 1;
      if (answer?.isCorrect) correct += 1;
      totalScore += answer?.score ?? 0;
    }
    return {
      item,
      answered,
      correct,
      pValue: answered === 0 ? null : Math.round((correct / answered) * 100),
      averageScore: attempts.length === 0 ? 0 : totalScore / attempts.length,
    };
  });

  const topicTotals = new Map<string, { answered: number; correct: number }>();
  for (const stat of questionsStats) {
    const key = stat.item.topic || "بدون مبحث";
    const current = topicTotals.get(key) ?? { answered: 0, correct: 0 };
    current.answered += stat.answered;
    current.correct += stat.correct;
    topicTotals.set(key, current);
  }

  return {
    exam: detail.exam,
    snapshot,
    assignments: detail.assignments,
    attempts,
    answersByAttempt: detail.answersByAttempt,
    questionsStats,
    topics: [...topicTotals.entries()].map(([topic, stats]) => ({
      topic,
      answered: stats.answered,
      correct: stats.correct,
      accuracy: stats.answered === 0 ? null : Math.round((stats.correct / stats.answered) * 100),
    })),
  };
}

export async function getBankQuestionCount(workspaceId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions)
    .innerJoin(questionBanks, eq(questions.bankId, questionBanks.id))
    .where(and(eq(questions.workspaceId, workspaceId), eq(questions.status, "active")));
  return row?.count ?? 0;
}
