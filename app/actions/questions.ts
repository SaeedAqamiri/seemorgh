"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { questionBanks, questions, subjects, users } from "@/db/schema";
import { areaPath, requireUser } from "@/lib/auth";
import {
  getOrCreateImportToken,
  ensureImportToken,
} from "@/lib/questions";
import {
  DIFFICULTIES,
  SOURCE_TYPES,
  normalizeCorrect,
  normalizeMcqOptions,
  type Difficulty,
  type SourceType,
} from "@/lib/exam";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function numberField(form: FormData, name: string): number {
  return Number(field(form, name));
}

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function bankPath(role: "counselor" | "student", bankId?: string): string {
  const base = role === "counselor" ? "/counselor/questions" : "/student/questions";
  return bankId ? `${base}?bank=${bankId}` : base;
}

export async function createBankAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const title = field(formData, "title");
  const subjectId = field(formData, "subjectId") || null;

  if (title.length < 2) fail(bankPath(user.role), "نام بانک را کامل وارد کنید.");

  if (subjectId) {
    const db = await getDb();
    const [subject] = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.workspaceId, user.workspaceId)))
      .limit(1);
    if (!subject) fail(bankPath(user.role), "درس پیدا نشد.");
  }

  const db = await getDb();
  const [bank] = await db
    .insert(questionBanks)
    .values({
      workspaceId: user.workspaceId,
      title,
      subjectId,
      createdBy: user.id,
      ownerId: user.id,
    })
    .returning();

  revalidatePath(bankPath(user.role));
  redirect(`${bankPath(user.role, bank.id)}&success=bank`);
}

function validateQuestionForm(formData: FormData, path: string) {
  const type = (field(formData, "type") || "mcq") as "mcq" | "short";
  const difficulty = field(formData, "difficulty") || "medium";
  const body = field(formData, "body");
  const score = Math.max(1, Math.min(100, Math.floor(numberField(formData, "score") || 1)));
  const topic = field(formData, "topic");
  const explanation = field(formData, "explanation");
  const tags = field(formData, "tags");
  const externalKey = field(formData, "externalKey") || null;
  const subjectId = field(formData, "subjectId") || null;
  const sourceType = (field(formData, "sourceType") || "authored") as SourceType;
  const sourceTitle = field(formData, "sourceTitle");
  const sourceYear = field(formData, "sourceYear");
  const sourceDate = field(formData, "sourceDate");
  const sourceRef = field(formData, "sourceRef");
  const grade = field(formData, "grade");

  if (!body) fail(path, "متن سوال لازم است.");
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) {
    fail(path, "سطح سختی نامعتبر است.");
  }
  if (!SOURCE_TYPES.includes(sourceType)) {
    fail(path, "نوع منبع نامعتبر است.");
  }

  const rawOptions = [1, 2, 3, 4].map((index) => field(formData, `option${index}`));
  const options = rawOptions.filter(Boolean);
  const correctRaw = field(formData, "correct");
  let correct: string | number | null;

  if (type === "mcq") {
    const normalizedOptions = normalizeMcqOptions(options);
    if (!normalizedOptions) fail(path, "حداقل دو گزینه لازم است.");
    correct = normalizeCorrect(correctRaw);
    if (typeof correct !== "number" || correct < 1 || correct > normalizedOptions.length) {
      fail(path, "پاسخ صحیح باید شماره گزینه باشد.");
    }
    return {
      type,
      difficulty: difficulty as Difficulty,
      body,
      score,
      topic,
      explanation,
      tags,
      externalKey,
      subjectId,
      sourceType,
      sourceTitle,
      sourceYear,
      sourceDate,
      sourceRef,
      grade,
      options: normalizedOptions,
      correct,
    };
  }

  if (!correctRaw) fail(path, "پاسخ کوتاه را وارد کنید.");
  return {
    type,
    difficulty: difficulty as Difficulty,
    body,
    score,
    topic,
    explanation,
    tags,
    externalKey,
    subjectId,
    sourceType,
    sourceTitle,
    sourceYear,
    sourceDate,
    sourceRef,
    grade,
    options: null,
    correct: correctRaw,
  };
}

async function assertSubject(subjectId: string | null, workspaceId: string, role: "counselor" | "student") {
  if (!subjectId) return;
  const db = await getDb();
  const [subject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.workspaceId, workspaceId)))
    .limit(1);
  if (!subject) fail(bankPath(role), "درس پیدا نشد.");
}

async function requireOwnedBank(
  bankId: string,
  userId: string,
  workspaceId: string,
  role: "counselor" | "student",
) {
  const db = await getDb();
  const [bank] = await db
    .select()
    .from(questionBanks)
    .where(
      and(
        eq(questionBanks.id, bankId),
        eq(questionBanks.workspaceId, workspaceId),
        eq(questionBanks.ownerId, userId),
      ),
    )
    .limit(1);
  if (!bank) fail(bankPath(role), "بانک سوال پیدا نشد.");
  return bank;
}

export async function createQuestionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bankId = field(formData, "bankId");
  if (!bankId) fail(bankPath(user.role), "بانک سوال را انتخاب کنید.");

  const bank = await requireOwnedBank(bankId, user.id, user.workspaceId, user.role);
  const path = bankPath(user.role, bankId);
  if (!bank) fail(path, "بانک سوال پیدا نشد.");

  const data = validateQuestionForm(formData, path);
  await assertSubject(data.subjectId, user.workspaceId, user.role);

  const db = await getDb();
  await db.insert(questions).values({
    bankId,
    workspaceId: user.workspaceId,
    subjectId: data.subjectId,
    grade: data.grade,
    topic: data.topic,
    type: data.type,
    difficulty: data.difficulty,
    body: data.body,
    optionsJson: data.options,
    correctJson: data.correct,
    score: data.score,
    explanation: data.explanation,
    tags: data.tags,
    sourceType: data.sourceType,
    sourceTitle: data.sourceTitle,
    sourceYear: data.sourceYear,
    sourceDate: data.sourceDate,
    sourceRef: data.sourceRef,
    externalKey: data.externalKey,
  });

  revalidatePath(bankPath(user.role));
  redirect(`${path}&success=question`);
}

export async function updateQuestionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const questionId = field(formData, "questionId");
  const bankId = field(formData, "bankId");

  await requireOwnedBank(bankId, user.id, user.workspaceId, user.role);
  const path = bankPath(user.role, bankId);
  const data = validateQuestionForm(formData, path);
  await assertSubject(data.subjectId, user.workspaceId, user.role);

  const db = await getDb();
  await db
    .update(questions)
    .set({
      subjectId: data.subjectId,
      grade: data.grade,
      topic: data.topic,
      type: data.type,
      difficulty: data.difficulty,
      body: data.body,
      optionsJson: data.options,
      correctJson: data.correct,
      score: data.score,
      explanation: data.explanation,
      tags: data.tags,
      sourceType: data.sourceType,
      sourceTitle: data.sourceTitle,
      sourceYear: data.sourceYear,
      sourceDate: data.sourceDate,
      sourceRef: data.sourceRef,
      externalKey: data.externalKey,
    })
    .where(
      and(
        eq(questions.id, questionId),
        eq(questions.bankId, bankId),
        eq(questions.workspaceId, user.workspaceId),
      ),
    );

  revalidatePath(bankPath(user.role));
  redirect(`${bankPath(user.role, bankId)}&success=question-updated`);
}

async function setQuestionStatus(
  formData: FormData,
  status: "active" | "archived",
  success: string,
): Promise<void> {
  const user = await requireUser();
  const questionId = field(formData, "questionId");
  const bankId = field(formData, "bankId");
  await requireOwnedBank(bankId, user.id, user.workspaceId, user.role);

  const db = await getDb();
  await db
    .update(questions)
    .set({ status })
    .where(
      and(
        eq(questions.id, questionId),
        eq(questions.bankId, bankId),
        eq(questions.workspaceId, user.workspaceId),
      ),
    );

  revalidatePath(bankPath(user.role));
  redirect(`${bankPath(user.role, bankId)}&success=${success}`);
}

export async function archiveQuestionAction(formData: FormData): Promise<void> {
  await setQuestionStatus(formData, "archived", "question-archived");
}

export async function restoreQuestionAction(formData: FormData): Promise<void> {
  await setQuestionStatus(formData, "active", "question-restored");
}

export async function deleteBankAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bankId = field(formData, "bankId");
  await requireOwnedBank(bankId, user.id, user.workspaceId, user.role);

  const db = await getDb();
  await db
    .delete(questionBanks)
    .where(
      and(
        eq(questionBanks.id, bankId),
        eq(questionBanks.workspaceId, user.workspaceId),
        eq(questionBanks.ownerId, user.id),
      ),
    );

  revalidatePath(bankPath(user.role));
  redirect(`${bankPath(user.role)}?success=bank-deleted`);
}

export async function regenerateImportTokenAction(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await db.update(users).set({ importToken: ensureImportToken() }).where(eq(users.id, user.id));
  revalidatePath(bankPath(user.role));
  redirect(`${bankPath(user.role)}?success=token`);
}

export async function ensureImportTokenAction(): Promise<void> {
  const user = await requireUser();
  await getOrCreateImportToken(user.id);
  revalidatePath(bankPath(user.role));
}
