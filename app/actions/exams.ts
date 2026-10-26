"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  examAnswers,
  examAssignments,
  examAttempts,
  exams,
  students,
} from "@/db/schema";
import { requireCounselor, requireStudent } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyStudentUser, notifyUser } from "@/lib/notifications";
import {
  buildSnapshot,
  parseSnapshot,
  sanitizeBlueprint,
  selectExamQuestions,
  shuffleExamSnapshot,
  type BlueprintItem,
} from "@/lib/exam";
import { aiSelectionConfigured, generateAiSelection } from "@/lib/ai-exam";
import {
  finalizeAttempt,
  loadSelectableQuestions,
  previewExamQuestions,
  recomputeAttempt,
} from "@/lib/exams-server";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function numberField(form: FormData, name: string): number {
  return Number(field(form, name));
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parseTehranLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+03:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createExamAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const title = field(formData, "title");
  const startsAt = parseTehranLocal(field(formData, "startAt"));
  const endsAt = parseTehranLocal(field(formData, "endAt"));
  const durationMinutes = Math.floor(numberField(formData, "durationMinutes"));
  const studentIds = formData.getAll("studentIds").map((value) => String(value));
  const shuffleQuestions = field(formData, "shuffleQuestions") === "on";
  const shuffleOptions = field(formData, "shuffleOptions") === "on";
  const aiSelection = field(formData, "aiSelection") === "on";

  if (title.length < 2) fail("/counselor/exams/new", "عنوان آزمون را کامل وارد کنید.");
  if (!startsAt || !endsAt) fail("/counselor/exams/new", "زمان شروع و پایان را وارد کنید.");
  if (startsAt >= endsAt) fail("/counselor/exams/new", "زمان پایان باید بعد از شروع باشد.");
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 300) {
    fail("/counselor/exams/new", "مدت آزمون باید بین ۵ تا ۳۰۰ دقیقه باشد.");
  }
  if (endsAt.getTime() - startsAt.getTime() < durationMinutes * 60_000) {
    fail("/counselor/exams/new", "بازه آزمون از مدت آزمون کوتاه‌تر است.");
  }
  if (studentIds.length === 0) fail("/counselor/exams/new", "حداقل یک دانش‌آموز انتخاب کنید.");

  const subjects = formData.getAll("blueprintSubject").map((value) => String(value));
  const topics = formData.getAll("blueprintTopic").map((value) => String(value));
  const difficulties = formData.getAll("blueprintDifficulty").map((value) => String(value));
  const counts = formData.getAll("blueprintCount").map((value) => Number(value));

  const items: BlueprintItem[] = [];
  for (let index = 0; index < subjects.length; index += 1) {
    const count = Math.max(0, Math.floor(counts[index] ?? 0));
    if (!subjects[index] || count === 0) continue;
    const difficulty = String(difficulties[index] ?? "");
    items.push({
      subjectId: subjects[index],
      topic: String(topics[index] ?? "").trim(),
      difficulty: (["easy", "medium", "hard"].includes(difficulty)
        ? difficulty
        : "") as BlueprintItem["difficulty"],
      count,
    });
  }

  if (items.length === 0) fail("/counselor/exams/new", "حداقل یک ردیف blueprint با تعداد سوال اضافه کنید.");
  const totalRequested = items.reduce((sum, item) => sum + item.count, 0);
  if (totalRequested > 200) fail("/counselor/exams/new", "حداکثر ۲۰۰ سوال در هر آزمون مجاز است.");

  const db = await getDb();
  const validStudents = await db
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.workspaceId, counselor.workspaceId),
        eq(students.status, "active"),
        inArray(students.id, studentIds),
      ),
    );

  if (validStudents.length !== studentIds.length) {
    fail("/counselor/exams/new", "برخی دانش‌آموزان انتخاب‌شده معتبر نیستند.");
  }

  const [exam] = await db
    .insert(exams)
    .values({
      workspaceId: counselor.workspaceId,
      title,
      createdBy: counselor.id,
      status: "draft",
      startAt: startsAt,
      endAt: endsAt,
      durationMinutes,
      blueprintJson: { items },
      shuffleQuestions,
      shuffleOptions,
      aiSelection,
      maxAttempts: 1,
    })
    .returning();

  await db.insert(examAssignments).values(
    studentIds.map((studentId) => ({ examId: exam.id, studentId })),
  );

  revalidatePath("/counselor/exams");
  redirect(`/counselor/exams/${exam.id}`);
}

export async function publishExamAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const examId = field(formData, "examId");

  const db = await getDb();
  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.workspaceId, counselor.workspaceId), eq(exams.id, examId)))
    .limit(1);

  if (!exam) fail("/counselor/exams", "آزمون پیدا نشد.");
  if (exam.status !== "draft") fail(`/counselor/exams/${examId}`, "این آزمون قبلاً منتشر شده است.");
  if (exam.endAt.getTime() <= Date.now()) {
    fail(`/counselor/exams/${examId}`, "زمان پایان آزمون گذشته است؛ زمان‌بندی را اصلاح کنید.");
  }

  const [assignmentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(examAssignments)
    .where(eq(examAssignments.examId, examId));

  if ((assignmentCount?.count ?? 0) === 0) {
    fail(`/counselor/exams/${examId}`, "آزمون به هیچ دانش‌آموزی تخصیص داده نشده است.");
  }

  const blueprint = sanitizeBlueprint(exam.blueprintJson);
  const pool = await loadSelectableQuestions(counselor.workspaceId);
  const selection = selectExamQuestions(blueprint, pool, exam.id);

  if (selection.shortages.length > 0) {
    fail(
      `/counselor/exams/${examId}`,
      `انتشار بلاک شد: ${selection.shortages.join(" ")}`,
    );
  }
  if (selection.selected.length === 0) {
    fail(`/counselor/exams/${examId}`, "سوالی برای این blueprint پیدا نشد.");
  }

  let selectedQuestions = selection.selected;
  let aiNote: "ai" | "fallback" | null = null;

  if (exam.aiSelection && aiSelectionConfigured()) {
    const aiResult = await generateAiSelection({
      workspaceId: counselor.workspaceId,
      examId: exam.id,
      blueprint: blueprint.items,
      pool,
    });
    if (aiResult.ok) {
      selectedQuestions = aiResult.selected;
      aiNote = "ai";
    } else {
      aiNote = "fallback";
    }
  }

  const snapshot = shuffleExamSnapshot(
    buildSnapshot(selectedQuestions),
    exam.id,
    exam.shuffleQuestions,
    exam.shuffleOptions,
  );

  await db
    .update(exams)
    .set({
      status: "scheduled",
      questionSnapshotJson: snapshot,
      totalScore: snapshot.totalScore,
      publishedAt: new Date(),
    })
    .where(eq(exams.id, examId));

  const assignedStudents = await db
    .select({ userId: students.userId, name: students.name })
    .from(examAssignments)
    .innerJoin(students, eq(examAssignments.studentId, students.id))
    .where(eq(examAssignments.examId, examId));

  for (const student of assignedStudents) {
    if (!student.userId) continue;
    await notifyUser(student.userId, "exam_published", {
      title: "آزمون جدید زمان‌بندی شد",
      body: `${exam.title} — ${snapshot.items.length} سوال، ${exam.durationMinutes} دقیقه`,
      examId,
      startAt: exam.startAt.toISOString(),
    });
  }

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "exam.publish",
    entity: "exam",
    entityId: examId,
    diff: { questions: snapshot.items.length, totalScore: snapshot.totalScore },
  });

  revalidatePath("/counselor/exams");
  revalidatePath(`/counselor/exams/${examId}`);
  const query = new URLSearchParams({ success: "published" });
  if (aiNote) query.set("ai", aiNote);
  redirect(`/counselor/exams/${examId}?${query.toString()}`);
}

export async function deleteExamAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const examId = field(formData, "examId");

  const db = await getDb();
  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.workspaceId, counselor.workspaceId), eq(exams.id, examId)))
    .limit(1);

  if (!exam) fail("/counselor/exams", "آزمون پیدا نشد.");
  if (exam.status !== "draft") fail(`/counselor/exams/${examId}`, "فقط آزمون پیش‌نویس قابل حذف است.");

  await db.delete(exams).where(eq(exams.id, examId));

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "exam.delete",
    entity: "exam",
    entityId: examId,
    diff: { title: exam.title },
  });

  revalidatePath("/counselor/exams");
  redirect("/counselor/exams?success=deleted");
}

export async function startExamAction(formData: FormData): Promise<void> {
  const { user, student } = await requireStudent();
  const examId = field(formData, "examId");

  const db = await getDb();
  const [row] = await db
    .select({ exam: exams, assignment: examAssignments })
    .from(examAssignments)
    .innerJoin(exams, eq(examAssignments.examId, exams.id))
    .where(and(eq(examAssignments.examId, examId), eq(examAssignments.studentId, student.id)))
    .limit(1);

  if (!row || row.exam.publishedAt === null) fail("/student/exams", "آزمون برای شما فعال نیست.");

  const now = new Date();
  if (now < row.exam.startAt) fail("/student/exams", "زمان شروع آزمون نرسیده است.");
  if (now >= row.exam.endAt) fail("/student/exams", "زمان آزمون تمام شده است.");

  const [existing] = await db
    .select()
    .from(examAttempts)
    .where(
      and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, student.id)),
    )
    .limit(1);

  if (existing) {
    if (existing.status === "in_progress") redirect(`/student/exams/${examId}/take`);
    redirect(`/student/exams/${examId}/result`);
  }

  const deadlineAt = new Date(
    Math.min(row.exam.startAt.getTime() + row.exam.durationMinutes * 60_000, row.exam.endAt.getTime()),
  );

  if (now >= deadlineAt) fail("/student/exams", "مهلت شروع آزمون گذشته است.");

  const snapshot = parseSnapshot(row.exam.questionSnapshotJson);

  const [attempt] = await db
    .insert(examAttempts)
    .values({
      examId,
      studentId: student.id,
      attemptNo: 1,
      startedAt: now,
      deadlineAt,
      status: "in_progress",
      maxScore: snapshot.totalScore,
    })
    .returning();

  await db
    .update(examAssignments)
    .set({ status: "started" })
    .where(
      and(eq(examAssignments.examId, examId), eq(examAssignments.studentId, student.id)),
    );

  await db.update(exams).set({ status: "open" }).where(eq(exams.id, examId));

  await logAudit({
    workspaceId: student.workspaceId,
    actorId: user.id,
    action: "exam.start",
    entity: "exam_attempt",
    entityId: attempt.id,
    diff: { examId, deadlineAt: attempt.deadlineAt.toISOString() },
  });

  revalidatePath("/student/exams");
  redirect(`/student/exams/${examId}/take?attempt=${attempt.id}`);
}

export async function saveAnswerAction(
  examId: string,
  questionId: string,
  answer: string | number | null,
): Promise<{ ok: boolean; expired?: boolean; error?: string }> {
  const { student } = await requireStudent();
  const db = await getDb();

  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(
      and(
        eq(examAttempts.examId, examId),
        eq(examAttempts.studentId, student.id),
        eq(examAttempts.status, "in_progress"),
      ),
    )
    .limit(1);

  if (!attempt) return { ok: false, error: "آزمون در حال اجرا نیست." };
  if (new Date() > attempt.deadlineAt) {
    await finalizeAttempt(attempt.id, { auto: true });
    return { ok: false, expired: true, error: "زمان آزمون تمام شد." };
  }

  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) return { ok: false, error: "آزمون پیدا نشد." };

  const snapshot = parseSnapshot(exam.questionSnapshotJson);
  const item = snapshot.items.find((entry) => entry.id === questionId);
  if (!item) return { ok: false, error: "سوال پیدا نشد." };

  let normalized: string | number | null = answer;
  if (item.type === "mcq") {
    const numeric = Number(answer);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > (item.options?.length ?? 0)) {
      return { ok: false, error: "پاسخ نامعتبر است." };
    }
    normalized = numeric;
  } else {
    normalized = answer === null ? null : String(answer).slice(0, 5000);
  }

  await db
    .insert(examAnswers)
    .values({
      attemptId: attempt.id,
      questionId,
      answerJson: normalized,
    })
    .onConflictDoUpdate({
      target: [examAnswers.attemptId, examAnswers.questionId],
      set: { answerJson: normalized },
    });

  return { ok: true };
}

export async function submitExamAction(formData: FormData): Promise<void> {
  const { user, student } = await requireStudent();
  const examId = field(formData, "examId");

  const db = await getDb();
  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, student.id)))
    .limit(1);

  if (!attempt) fail("/student/exams", "آزمون پیدا نشد.");

  if (attempt.status === "in_progress") {
    await finalizeAttempt(attempt.id);
  }

  await logAudit({
    workspaceId: student.workspaceId,
    actorId: user.id,
    action: "exam.submit",
    entity: "exam_attempt",
    entityId: attempt.id,
    diff: { examId, auto: false },
  });

  revalidatePath("/student/exams");
  redirect(`/student/exams/${examId}/result`);
}

export async function gradeShortAnswerAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const answerId = field(formData, "answerId");
  const attemptId = field(formData, "attemptId");
  const examId = field(formData, "examId");
  const score = Math.max(0, Math.floor(numberField(formData, "score")));
  const feedback = field(formData, "feedback");

  const db = await getDb();
  const [row] = await db
    .select({ answer: examAnswers, attempt: examAttempts, exam: exams })
    .from(examAnswers)
    .innerJoin(examAttempts, eq(examAnswers.attemptId, examAttempts.id))
    .innerJoin(exams, eq(examAttempts.examId, exams.id))
    .where(
      and(
        eq(examAnswers.id, answerId),
        eq(examAttempts.id, attemptId),
        eq(exams.id, examId),
        eq(exams.workspaceId, counselor.workspaceId),
      ),
    )
    .limit(1);

  if (!row) fail(`/counselor/exams/${examId}`, "پاسخ پیدا نشد.");

  const snapshot = parseSnapshot(row.exam.questionSnapshotJson);
  const item = snapshot.items.find((entry) => entry.id === row.answer.questionId);
  if (!item || item.type !== "short") fail(`/counselor/exams/${examId}`, "این پاسخ کوتاه‌پاسخ نیست.");

  const bounded = Math.min(score, item.score);

  await db
    .update(examAnswers)
    .set({
      score: bounded,
      isCorrect: bounded === item.score,
      feedback,
      gradedBy: counselor.id,
      gradedAt: new Date(),
    })
    .where(eq(examAnswers.id, answerId));

  await recomputeAttempt(attemptId);

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "exam.grade",
    entity: "exam_answer",
    entityId: answerId,
    diff: { score: bounded, max: item.score, feedback },
  });

  const [updatedAttempt] = await db
    .select({ status: examAttempts.status, studentId: examAttempts.studentId })
    .from(examAttempts)
    .where(eq(examAttempts.id, attemptId))
    .limit(1);

  if (updatedAttempt?.status === "graded") {
    await notifyStudentUser(updatedAttempt.studentId, "exam_graded", {
      title: "کارنامه آزمون به‌روز شد",
      body: "تصحیح پاسخ‌های کوتاه انجام شد؛ نمره نهایی را ببین.",
      examId,
    });
  }

  revalidatePath(`/counselor/exams/${examId}`);
  redirect(`/counselor/exams/${examId}/grade/${attemptId}?success=graded`);
}

export async function previewSelectionAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const examId = field(formData, "examId");
  const preview = await previewExamQuestions(counselor.workspaceId, examId);
  if (!preview) fail("/counselor/exams", "آزمون پیدا نشد.");
  redirect(`/counselor/exams/${examId}`);
}
