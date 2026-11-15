import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { questionBanks, questions, subjects } from "@/db/schema";
import { jsonResponse, optionsResponse } from "@/lib/cors";
import { getBank, getUserByImportToken } from "@/lib/questions";
import {
  DIFFICULTIES,
  SOURCE_TYPES,
  normalizeMcqOptions,
  type Difficulty,
  type SourceType,
} from "@/lib/exam";
import {
  inferGradeFromText,
  normalizeGrade,
} from "@/lib/question-taxonomy";

type IncomingQuestion = {
  body?: string;
  text?: string;
  options?: unknown;
  correct?: unknown;
  explanation?: string;
  difficulty?: string;
  subject?: string;
  subjectTitle?: string;
  subjectId?: string;
  grade?: string;
  bookGrade?: string;
  topic?: string;
  score?: number;
  tags?: string;
  externalKey?: string;
  sourceType?: string;
  sourceTitle?: string;
  sourceYear?: string;
  sourceDate?: string;
  sourceRef?: string;
};

type IncomingSource = {
  type?: string;
  title?: string;
  year?: string;
  date?: string;
  ref?: string;
};

function normalizeDifficulty(value: unknown): Difficulty {
  const text = String(value ?? "").trim().toLowerCase();
  const map: Record<string, Difficulty> = {
    easy: "easy",
    آسان: "easy",
    medium: "medium",
    متوسط: "medium",
    hard: "hard",
    سخت: "hard",
    very_hard: "very_hard",
    veryhard: "very_hard",
    "very hard": "very_hard",
    "خیلی سخت": "very_hard",
    خیلیسخت: "very_hard",
  };
  return map[text] ?? (DIFFICULTIES.includes(text as Difficulty) ? (text as Difficulty) : "medium");
}

function normalizeSourceType(value: unknown): SourceType {
  const text = String(value ?? "").trim().toLowerCase();
  const map: Record<string, SourceType> = {
    konkur: "konkur",
    کنکور: "konkur",
    "کنکور سراسری": "konkur",
    mock: "mock",
    آزمون: "mock",
    "آزمون آزمایشی": "mock",
    قلمچی: "mock",
    authored: "authored",
    تالیف: "authored",
    "تألیف": "authored",
    other: "other",
    سایر: "other",
  };
  return map[text] ?? (SOURCE_TYPES.includes(text as SourceType) ? (text as SourceType) : "authored");
}

function normalizeCorrect(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isInteger(numeric)) return numeric;
  return String(value).trim() || null;
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "بدنه JSON نامعتبر است." }, { status: 400 });
  }

  const token = String(payload.token ?? "");
  const user = await getUserByImportToken(token);
  if (!user) {
    return jsonResponse({ ok: false, error: "کد اتصال نامعتبر است." }, { status: 401 });
  }

  const bankId = String(payload.bankId ?? "");
  const bank = bankId
    ? await getBank(user.workspaceId, user.id, bankId)
    : (
        await getDb().then((db) =>
          db
            .select()
            .from(questionBanks)
            .where(
              and(
                eq(questionBanks.workspaceId, user.workspaceId),
                eq(questionBanks.ownerId, user.id),
              ),
            )
            .limit(1),
        )
      )[0];
  if (!bank) {
    return jsonResponse(
      { ok: false, error: "بانک سوال پیدا نشد؛ اول در سیمرغ یک بانک بسازید." },
      { status: 404 },
    );
  }

  const incoming = Array.isArray(payload.questions)
    ? (payload.questions as IncomingQuestion[])
    : [];
  if (incoming.length === 0) {
    return jsonResponse({ ok: false, error: "سوالی برای افزودن انتخاب نشده است." }, { status: 400 });
  }
  if (incoming.length > 500) {
    return jsonResponse({ ok: false, error: "حداکثر ۵۰۰ سوال در هر بار مجاز است." }, { status: 400 });
  }

  const db = await getDb();
  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, user.workspaceId));
  const subjectByTitle = new Map(subjectRows.map((subject) => [subject.title.trim(), subject.id]));
  const subjectById = new Set(subjectRows.map((subject) => subject.id));

  const source = (payload.source ?? {}) as IncomingSource;
  const externalKeys = incoming
    .map((question) => String(question.externalKey ?? "").trim())
    .filter(Boolean);
  const existing = externalKeys.length
    ? await db
        .select({ externalKey: questions.externalKey })
        .from(questions)
        .where(
          and(
            eq(questions.workspaceId, user.workspaceId),
            inArray(questions.externalKey, externalKeys),
          ),
        )
    : [];
  const existingKeys = new Set(existing.map((row) => row.externalKey));

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const createdSubjects: string[] = [];

  for (const [index, raw] of incoming.entries()) {
    const body = String(raw.body ?? raw.text ?? "").trim();
    if (!body) {
      errors.push(`ردیف ${index + 1}: متن سوال خالی است.`);
      continue;
    }

    const externalKey = String(raw.externalKey ?? "").trim() || null;
    if (externalKey && existingKeys.has(externalKey)) {
      skipped += 1;
      continue;
    }

    const subjectTitle = String(raw.subjectTitle ?? raw.subject ?? "").trim();
    let subjectId: string | null = null;
    if (raw.subjectId && subjectById.has(String(raw.subjectId))) {
      subjectId = String(raw.subjectId);
    } else if (subjectTitle) {
      subjectId = subjectByTitle.get(subjectTitle) ?? null;
      if (!subjectId) {
        const [created] = await db
          .insert(subjects)
          .values({ workspaceId: user.workspaceId, title: subjectTitle })
          .onConflictDoNothing()
          .returning();
        if (created) {
          subjectId = created.id;
          subjectByTitle.set(subjectTitle, created.id);
          subjectById.add(created.id);
          createdSubjects.push(subjectTitle);
        } else {
          const [found] = await db
            .select({ id: subjects.id })
            .from(subjects)
            .where(
              and(
                eq(subjects.workspaceId, user.workspaceId),
                eq(subjects.title, subjectTitle),
              ),
            )
            .limit(1);
          subjectId = found?.id ?? null;
        }
      }
    }

    const options = normalizeMcqOptions(raw.options);
    const correct = normalizeCorrect(raw.correct);
    const type: "mcq" | "short" = options ? "mcq" : "short";
    const validCorrect =
      type === "mcq" && typeof correct === "number" && correct >= 1 && correct <= options!.length
        ? correct
        : type === "short" && correct !== null
          ? correct
          : null;

    const sourceType = normalizeSourceType(raw.sourceType ?? source.type);
    const sourceTitle = String(raw.sourceTitle ?? source.title ?? "").trim();
    const sourceYear = String(raw.sourceYear ?? source.year ?? "").trim();
    const sourceDate = String(raw.sourceDate ?? source.date ?? "").trim();
    const sourceRef = String(raw.sourceRef ?? source.ref ?? "").trim();
    const subjectTitleForGrade =
      (subjectId
        ? subjectRows.find((subject) => subject.id === subjectId)?.title
        : undefined) ||
      subjectTitle ||
      null;
    const grade =
      normalizeGrade(raw.grade ?? raw.bookGrade) ||
      inferGradeFromText(
        `${bank.title} ${sourceTitle} ${sourceYear}`,
        subjectTitleForGrade,
      );

    await db.insert(questions).values({
      bankId: bank.id,
      workspaceId: user.workspaceId,
      subjectId,
      grade,
      topic: String(raw.topic ?? "").trim(),
      type,
      difficulty: normalizeDifficulty(raw.difficulty),
      body,
      optionsJson: options,
      correctJson: validCorrect,
      score: Math.max(1, Math.min(100, Math.floor(Number(raw.score) || 1))),
      explanation: String(raw.explanation ?? "").trim(),
      tags: String(raw.tags ?? "").trim(),
      sourceType,
      sourceTitle,
      sourceYear,
      sourceDate,
      sourceRef,
      externalKey,
    });

    if (externalKey) existingKeys.add(externalKey);
    imported += 1;
  }

  revalidatePath("/counselor/questions");
  revalidatePath("/student/questions");

  return jsonResponse({
    ok: true,
    imported,
    skipped,
    errors,
    createdSubjects,
    bank: { id: bank.id, title: bank.title },
  });
}

export async function OPTIONS() {
  return optionsResponse();
}
