import { and, asc, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/db/client";
import { questionBanks, questions, subjects, users } from "@/db/schema";
import type { Difficulty, SourceType } from "./exam";

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

export async function listBanks(
  workspaceId: string,
  ownerId: string,
): Promise<BankSummary[]> {
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
    .where(
      and(
        eq(questionBanks.workspaceId, workspaceId),
        eq(questionBanks.ownerId, ownerId),
      ),
    )
    .groupBy(
      questionBanks.id,
      questionBanks.title,
      questionBanks.subjectId,
      subjects.title,
      questionBanks.createdAt,
    )
    .orderBy(asc(questionBanks.title));

  return rows;
}

export type QuestionFilters = {
  bankId?: string;
  subjectId?: string;
  difficulty?: Difficulty | "";
  sourceType?: SourceType | "";
  year?: string;
  query?: string;
  includeArchived?: boolean;
};

export type QuestionItem = {
  id: string;
  bankId: string;
  bankTitle: string;
  subjectId: string | null;
  subjectTitle: string | null;
  topic: string;
  type: "mcq" | "short";
  difficulty: Difficulty;
  body: string;
  optionsJson: string[] | null;
  correctJson: string | number | null;
  score: number;
  explanation: string;
  tags: string;
  sourceType: SourceType;
  sourceTitle: string;
  sourceYear: string;
  sourceDate: string;
  sourceRef: string;
  externalKey: string | null;
  status: "active" | "archived";
};

export async function listQuestions(
  workspaceId: string,
  ownerId: string,
  options: QuestionFilters = {},
): Promise<QuestionItem[]> {
  const db = await getDb();
  const conditions = [
    eq(questions.workspaceId, workspaceId),
    eq(questionBanks.ownerId, ownerId),
  ];
  if (options.bankId) conditions.push(eq(questions.bankId, options.bankId));
  if (options.subjectId) conditions.push(eq(questions.subjectId, options.subjectId));
  if (options.difficulty) conditions.push(eq(questions.difficulty, options.difficulty));
  if (options.sourceType) conditions.push(eq(questions.sourceType, options.sourceType));
  if (options.year) conditions.push(eq(questions.sourceYear, options.year));
  if (options.query) {
    const needle = `%${options.query}%`;
    conditions.push(
      or(
        ilike(questions.body, needle),
        ilike(questions.topic, needle),
        ilike(questions.tags, needle),
        ilike(questions.sourceTitle, needle),
      )!,
    );
  }
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
      sourceType: questions.sourceType,
      sourceTitle: questions.sourceTitle,
      sourceYear: questions.sourceYear,
      sourceDate: questions.sourceDate,
      sourceRef: questions.sourceRef,
      externalKey: questions.externalKey,
      status: questions.status,
    })
    .from(questions)
    .innerJoin(questionBanks, eq(questions.bankId, questionBanks.id))
    .leftJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(and(...conditions))
    .orderBy(desc(questions.createdAt))
    .limit(1000);

  return rows as QuestionItem[];
}

export async function getQuestion(
  workspaceId: string,
  ownerId: string,
  id: string,
) {
  const db = await getDb();
  const [row] = await db
    .select({ question: questions })
    .from(questions)
    .innerJoin(questionBanks, eq(questions.bankId, questionBanks.id))
    .where(
      and(
        eq(questions.workspaceId, workspaceId),
        eq(questionBanks.ownerId, ownerId),
        eq(questions.id, id),
      ),
    )
    .limit(1);
  return row?.question ?? null;
}

export async function getBank(workspaceId: string, ownerId: string, bankId: string) {
  const db = await getDb();
  const [bank] = await db
    .select()
    .from(questionBanks)
    .where(
      and(
        eq(questionBanks.id, bankId),
        eq(questionBanks.workspaceId, workspaceId),
        eq(questionBanks.ownerId, ownerId),
      ),
    )
    .limit(1);
  return bank ?? null;
}

export async function listSelectableQuestions(
  workspaceId: string,
  ownerId?: string,
) {
  const db = await getDb();
  const conditions = [
    eq(questions.workspaceId, workspaceId),
    eq(questions.status, "active"),
    isNotNull(questions.correctJson),
  ];
  if (ownerId) conditions.push(eq(questionBanks.ownerId, ownerId));

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
    .innerJoin(questionBanks, eq(questions.bankId, questionBanks.id))
    .leftJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(and(...conditions));
}

export function ensureImportToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function getOrCreateImportToken(userId: string): Promise<string> {
  const db = await getDb();
  const [user] = await db
    .select({ importToken: users.importToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user?.importToken) return user.importToken;

  const token = ensureImportToken();
  await db.update(users).set({ importToken: token }).where(eq(users.id, userId));
  return token;
}

export async function getUserByImportToken(token: string) {
  if (!token || token.length < 16) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      id: users.id,
      workspaceId: users.workspaceId,
      role: users.role,
      name: users.name,
    })
    .from(users)
    .where(and(eq(users.importToken, token), eq(users.status, "active")))
    .limit(1);
  return row ?? null;
}

export type QuestionDraft = {
  bankId: string;
  subjectId: string | null;
  topic: string;
  type: "mcq" | "short";
  difficulty: Difficulty;
  body: string;
  options: string[] | null;
  correct: string | number | null;
  score: number;
  explanation: string;
  tags: string;
  sourceType: SourceType;
  sourceTitle: string;
  sourceYear: string;
  sourceDate: string;
  sourceRef: string;
  externalKey: string | null;
};

export function sourceLabel(question: {
  sourceType: string;
  sourceTitle: string;
  sourceYear: string;
  sourceDate: string;
}): string {
  if (question.sourceTitle) {
    if (question.sourceYear && !question.sourceTitle.includes(question.sourceYear)) {
      return `${question.sourceTitle} — ${question.sourceYear}`;
    }
    return question.sourceTitle;
  }
  if (question.sourceType === "authored") return "تالیف";
  if (question.sourceType === "konkur") {
    return question.sourceYear ? `کنکور سراسری ${question.sourceYear}` : "کنکور سراسری";
  }
  if (question.sourceType === "mock") {
    return question.sourceDate ? `آزمون آزمایشی ${question.sourceDate}` : "آزمون آزمایشی";
  }
  return "سایر";
}

export async function listSourceYears(
  workspaceId: string,
  ownerId: string,
): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ year: questions.sourceYear })
    .from(questions)
    .innerJoin(questionBanks, eq(questions.bankId, questionBanks.id))
    .where(
      and(
        eq(questions.workspaceId, workspaceId),
        eq(questionBanks.ownerId, ownerId),
        sql`${questions.sourceYear} <> ''`,
      ),
    )
    .orderBy(desc(questions.sourceYear));
  return rows.map((row) => row.year);
}
