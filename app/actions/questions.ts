"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { questionBanks, questions, subjects } from "@/db/schema";
import { requireCounselor } from "@/lib/auth";
import { normalizeCorrect, normalizeMcqOptions } from "@/lib/exam";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function numberField(form: FormData, name: string): number {
  return Number(field(form, name));
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createBankAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const title = field(formData, "title");
  const subjectId = field(formData, "subjectId") || null;

  if (title.length < 2) fail("/counselor/questions", "نام بانک را کامل وارد کنید.");

  if (subjectId) {
    const db = await getDb();
    const [subject] = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.workspaceId, counselor.workspaceId)))
      .limit(1);
    if (!subject) fail("/counselor/questions", "درس پیدا نشد.");
  }

  const db = await getDb();
  const [bank] = await db
    .insert(questionBanks)
    .values({
      workspaceId: counselor.workspaceId,
      title,
      subjectId,
      createdBy: counselor.id,
    })
    .returning();

  revalidatePath("/counselor/questions");
  redirect(`/counselor/questions?bank=${bank.id}&success=bank`);
}

function validateQuestionForm(formData: FormData, workspaceId: string) {
  const type = (field(formData, "type") || "mcq") as "mcq" | "short";
  const difficulty = field(formData, "difficulty") || "medium";
  const body = field(formData, "body");
  const score = Math.max(1, Math.min(100, Math.floor(numberField(formData, "score") || 1)));
  const topic = field(formData, "topic");
  const explanation = field(formData, "explanation");
  const tags = field(formData, "tags");
  const externalKey = field(formData, "externalKey") || null;
  const subjectId = field(formData, "subjectId") || null;

  if (!body) fail("/counselor/questions", "متن سوال لازم است.");
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    fail("/counselor/questions", "سطح سختی نامعتبر است.");
  }

  const rawOptions = [1, 2, 3, 4].map((index) => field(formData, `option${index}`));
  const options = rawOptions.filter(Boolean);
  const correctRaw = field(formData, "correct");
  let correct: string | number | null;

  if (type === "mcq") {
    const normalizedOptions = normalizeMcqOptions(options);
    if (!normalizedOptions) fail("/counselor/questions", "حداقل دو گزینه لازم است.");
    correct = normalizeCorrect(correctRaw);
    if (typeof correct !== "number" || correct < 1 || correct > normalizedOptions.length) {
      fail("/counselor/questions", "پاسخ صحیح باید شماره گزینه (۱ تا ۴) باشد.");
    }
    return {
      type,
      difficulty: difficulty as "easy" | "medium" | "hard",
      body,
      score,
      topic,
      explanation,
      tags,
      externalKey,
      subjectId,
      options: normalizedOptions,
      correct,
    };
  }

  if (!correctRaw) fail("/counselor/questions", "پاسخ کوتاه را وارد کنید.");
  return {
    type,
    difficulty: difficulty as "easy" | "medium" | "hard",
    body,
    score,
    topic,
    explanation,
    tags,
    externalKey,
    subjectId,
    options: null,
    correct: correctRaw,
  };
}

async function assertSubject(subjectId: string | null, workspaceId: string) {
  if (!subjectId) return;
  const db = await getDb();
  const [subject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.workspaceId, workspaceId)))
    .limit(1);
  if (!subject) fail("/counselor/questions", "درس پیدا نشد.");
}

export async function createQuestionAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const bankId = field(formData, "bankId");
  if (!bankId) fail("/counselor/questions", "بانک سوال را انتخاب کنید.");

  const db = await getDb();
  const [bank] = await db
    .select()
    .from(questionBanks)
    .where(and(eq(questionBanks.id, bankId), eq(questionBanks.workspaceId, counselor.workspaceId)))
    .limit(1);
  if (!bank) fail("/counselor/questions", "بانک سوال پیدا نشد.");

  const data = validateQuestionForm(formData, counselor.workspaceId);
  await assertSubject(data.subjectId, counselor.workspaceId);

  await db.insert(questions).values({
    bankId,
    workspaceId: counselor.workspaceId,
    subjectId: data.subjectId,
    topic: data.topic,
    type: data.type,
    difficulty: data.difficulty,
    body: data.body,
    optionsJson: data.options,
    correctJson: data.correct,
    score: data.score,
    explanation: data.explanation,
    tags: data.tags,
    externalKey: data.externalKey,
  });

  revalidatePath("/counselor/questions");
  redirect(`/counselor/questions?bank=${bankId}&success=question`);
}

export async function updateQuestionAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const questionId = field(formData, "questionId");
  const bankId = field(formData, "bankId");

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.workspaceId, counselor.workspaceId)))
    .limit(1);
  if (!existing) fail("/counselor/questions", "سوال پیدا نشد.");

  const data = validateQuestionForm(formData, counselor.workspaceId);
  await assertSubject(data.subjectId, counselor.workspaceId);

  await db
    .update(questions)
    .set({
      subjectId: data.subjectId,
      topic: data.topic,
      type: data.type,
      difficulty: data.difficulty,
      body: data.body,
      optionsJson: data.options,
      correctJson: data.correct,
      score: data.score,
      explanation: data.explanation,
      tags: data.tags,
      externalKey: data.externalKey,
    })
    .where(eq(questions.id, questionId));

  revalidatePath("/counselor/questions");
  redirect(`/counselor/questions?bank=${bankId}&success=question-updated`);
}

export async function archiveQuestionAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const questionId = field(formData, "questionId");
  const bankId = field(formData, "bankId");

  const db = await getDb();
  await db
    .update(questions)
    .set({ status: "archived" })
    .where(and(eq(questions.id, questionId), eq(questions.workspaceId, counselor.workspaceId)));

  revalidatePath("/counselor/questions");
  redirect(`/counselor/questions?bank=${bankId}&success=question-archived`);
}

export async function restoreQuestionAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const questionId = field(formData, "questionId");
  const bankId = field(formData, "bankId");

  const db = await getDb();
  await db
    .update(questions)
    .set({ status: "active" })
    .where(and(eq(questions.id, questionId), eq(questions.workspaceId, counselor.workspaceId)));

  revalidatePath("/counselor/questions");
  redirect(`/counselor/questions?bank=${bankId}&success=question-restored`);
}

export async function deleteBankAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const bankId = field(formData, "bankId");

  const db = await getDb();
  await db
    .delete(questionBanks)
    .where(
      and(eq(questionBanks.id, bankId), eq(questionBanks.workspaceId, counselor.workspaceId)),
    );

  revalidatePath("/counselor/questions");
  redirect("/counselor/questions?success=bank-deleted");
}
