import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { questionBanks, questions, subjects } from "@/db/schema";

export type BankSummary = {
  id: string;
  title: string;
  subjectId: string | null;
  subjectTitle: string | null;
  total: number;
  mcq: number;
  short: number;
  createdAt: Date;
};

export async function listBanks(workspaceId: string): Promise<BankSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: questionBanks.id,
      title: questionBanks.title,
      subjectId: questionBanks.subjectId,
      subjectTitle: subjects.title,
      createdAt: questionBanks.createdAt,
      total: sql<number>`count(${questions.id})::int`,
      mcq: sql<number>`count(${questions.id}) filter (where ${questions.type} = 'mcq' and ${questions.status} = 'active')::int`,
      short: sql<number>`count(${questions.id}) filter (where ${questions.type} = 'short' and ${questions.status} = 'active')::int`,
    })
    .from(questionBanks)
    .leftJoin(subjects, eq(questionBanks.subjectId, subjects.id))
    .leftJoin(questions, eq(questions.bankId, questionBanks.id))
    .where(eq(questionBanks.workspaceId, workspaceId))
    .groupBy(questionBanks.id, questionBanks.title, questionBanks.subjectId, subjects.title, questionBanks.createdAt)
    .orderBy(asc(questionBanks.title));

  return rows;
}

export type QuestionItem = {
  id: string;
  bankId: string;
  bankTitle: string;
  subjectId: string | null;
  subjectTitle: string | null;
  topic: string;
  type: "mcq" | "short";
  difficulty: "easy" | "medium" | "hard";
  body: string;
  optionsJson: string[] | null;
  correctJson: string | number | null;
  score: number;
  explanation: string;
  tags: string;
  externalKey: string | null;
  status: "active" | "archived";
};

export async function listQuestions(
  workspaceId: string,
  options: { bankId?: string; includeArchived?: boolean } = {},
): Promise<QuestionItem[]> {
  const db = await getDb();
  const conditions = [eq(questions.workspaceId, workspaceId)];
  if (options.bankId) conditions.push(eq(questions.bankId, options.bankId));
  if (!options.includeArchived) conditions.push(eq(questions.status, "active"));

  const rows = await db
    .select({
      id: questions.id,
      bankId: questions.bankId,
      bankTitle: questionBanks.title,
      subjectId: questions.subjectId,
      subjectTitle: subjects.title,
      topic: questions.topic,
      type: questions.type,
      difficulty: questions.difficulty,
      body: questions.body,
      optionsJson: questions.optionsJson,
      correctJson: questions.correctJson,
      score: questions.score,
      explanation: questions.explanation,
      tags: questions.tags,
      externalKey: questions.externalKey,
      status: questions.status,
    })
    .from(questions)
    .innerJoin(questionBanks, eq(questions.bankId, questionBanks.id))
    .leftJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(and(...conditions))
    .orderBy(desc(questions.createdAt))
    .limit(500);

  return rows;
}

export async function getQuestion(workspaceId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.workspaceId, workspaceId), eq(questions.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listSelectableQuestions(workspaceId: string) {
  const db = await getDb();
  return db
    .select({
      id: questions.id,
      subjectId: questions.subjectId,
      subjectTitle: sql<string>`coalesce(${subjects.title}, '')`,
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
    .where(
      and(
        eq(questions.workspaceId, workspaceId),
        eq(questions.status, "active"),
      ),
    );
}
