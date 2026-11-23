import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  questionBanks,
  questionCollectionItems,
  questionCollections,
  questions,
  subjects,
} from "@/db/schema";
import type { QuestionItem } from "./questions";

export type CollectionSummary = {
  id: string;
  title: string;
  description: string;
  total: number;
  active: number;
  createdAt: Date;
};

export type CollectionQuestion = QuestionItem & { addedAt: Date };

export async function filterSelectableQuestionIds(
  workspaceId: string,
  ownerId: string,
  questionIds: string[],
): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(questionBanks, eq(questions.bankId, questionBanks.id))
    .where(
      and(
        eq(questions.workspaceId, workspaceId),
        eq(questionBanks.ownerId, ownerId),
        eq(questions.status, "active"),
        isNotNull(questions.correctJson),
        inArray(questions.id, questionIds),
      ),
    );
  const found = new Set(rows.map((row) => row.id));
  return questionIds.filter((id) => found.has(id));
}

export async function listCollections(
  workspaceId: string,
  userId: string,
): Promise<CollectionSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: questionCollections.id,
      title: questionCollections.title,
      description: questionCollections.description,
      createdAt: questionCollections.createdAt,
      total: sql<number>`count(${questionCollectionItems.id})::int`,
      active: sql<number>`count(${questions.id}) filter (where ${questions.status} = 'active')::int`,
    })
    .from(questionCollections)
    .leftJoin(
      questionCollectionItems,
      eq(questionCollectionItems.collectionId, questionCollections.id),
    )
    .leftJoin(questions, eq(questions.id, questionCollectionItems.questionId))
    .where(
      and(
        eq(questionCollections.workspaceId, workspaceId),
        eq(questionCollections.userId, userId),
      ),
    )
    .groupBy(questionCollections.id)
    .orderBy(desc(questionCollections.createdAt));

  return rows;
}

export async function getCollection(
  workspaceId: string,
  userId: string,
  collectionId: string,
) {
  if (!collectionId) return null;
  const db = await getDb();
  const [collection] = await db
    .select()
    .from(questionCollections)
    .where(
      and(
        eq(questionCollections.id, collectionId),
        eq(questionCollections.workspaceId, workspaceId),
        eq(questionCollections.userId, userId),
      ),
    )
    .limit(1);
  return collection ?? null;
}

export async function listCollectionQuestions(
  workspaceId: string,
  userId: string,
  collectionId: string,
): Promise<CollectionQuestion[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: questions.id,
      bankId: questions.bankId,
      bankTitle: questionBanks.title,
      subjectId: questions.subjectId,
      subjectTitle: subjects.title,
      grade: questions.grade,
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
      addedAt: questionCollectionItems.addedAt,
    })
    .from(questionCollectionItems)
    .innerJoin(
      questionCollections,
      eq(questionCollectionItems.collectionId, questionCollections.id),
    )
    .innerJoin(questions, eq(questionCollectionItems.questionId, questions.id))
    .innerJoin(questionBanks, eq(questions.bankId, questionBanks.id))
    .leftJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(
      and(
        eq(questionCollectionItems.collectionId, collectionId),
        eq(questionCollections.workspaceId, workspaceId),
        eq(questionCollections.userId, userId),
      ),
    )
    .orderBy(asc(questionCollectionItems.addedAt), asc(questions.id));

  return rows as CollectionQuestion[];
}
