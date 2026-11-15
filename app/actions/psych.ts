"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  psychAnswers,
  psychAttempts,
  psychDimensions,
  psychOptions,
  psychQuestions,
  psychTests,
  students,
  type PsychResultRule,
} from "@/db/schema";
import { getSessionUser, requireCounselor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  getPsychTestContent,
  findInProgressAttempt,
} from "@/lib/psych-server";
import {
  normalizePsychCode,
  scorePsychAttempt,
  type PsychEditorPayload,
  type PsychScoringDimension,
} from "@/lib/psych";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function parsePayload(form: FormData): PsychEditorPayload {
  const raw = field(form, "payload");
  if (!raw) throw new Error("empty payload");
  const parsed = JSON.parse(raw) as PsychEditorPayload;
  if (!parsed || typeof parsed !== "object") throw new Error("invalid payload");
  return parsed;
}

function validatePayload(payload: PsychEditorPayload): string | null {
  const title = payload.title?.trim() ?? "";
  if (title.length < 2) return "عنوان آزمون را کامل وارد کنید.";
  if (title.length > 160) return "عنوان آزمون بیش از حد طولانی است.";

  const dimensions = Array.isArray(payload.dimensions) ? payload.dimensions : [];
  if (dimensions.length === 0) return "حداقل یک بُعد یا مؤلفه برای آزمون تعریف کنید.";
  if (dimensions.length > 12) return "حداکثر ۱۲ بُعد برای هر آزمون مجاز است.";

  for (const [dimensionIndex, dimension] of dimensions.entries()) {
    if (!dimension.title?.trim()) return `عنوان بُعد ${dimensionIndex + 1} را وارد کنید.`;
    const bands = Array.isArray(dimension.bands) ? dimension.bands : [];
    if (bands.length === 0) return `برای بُعد ${dimensionIndex + 1} حداقل یک بازه تعریف کنید.`;
    if (bands.length > 12) {
      return `بُعد ${dimensionIndex + 1} حداکثر ۱۲ بازه می‌تواند داشته باشد.`;
    }

    const sorted = [...bands].sort((first, second) => Number(first.min) - Number(second.min));
    let expectedMin = 0;
    for (const [bandIndex, band] of sorted.entries()) {
      const min = Math.floor(Number(band.min));
      const max =
        band.max === null || band.max === undefined || String(band.max) === ""
          ? null
          : Math.floor(Number(band.max));
      if (!Number.isFinite(min) || min < 0) {
        return `حداقل امتیاز بازه ${bandIndex + 1} بُعد ${dimensionIndex + 1} نامعتبر است.`;
      }
      if (max !== null && (!Number.isFinite(max) || max < min)) {
        return `حداکثر امتیاز بازه ${bandIndex + 1} بُعد ${dimensionIndex + 1} نامعتبر است.`;
      }
      if (min !== expectedMin) {
        return `بازه‌های بُعد ${dimensionIndex + 1} باید از صفر پیوسته باشند (بازه ${bandIndex + 1}).`;
      }
      if (max === null && bandIndex !== sorted.length - 1) {
        return `فقط آخرین بازه بُعد ${dimensionIndex + 1} می‌تواند بدون سقف باشد.`;
      }
      if (!band.label?.trim()) {
        return `برچسب بازه ${bandIndex + 1} بُعد ${dimensionIndex + 1} را وارد کنید.`;
      }
      if (normalizePsychCode(band.code ?? "").length > 8) {
        return `کد بازه ${bandIndex + 1} بُعد ${dimensionIndex + 1} حداکثر ۸ نویسه باشد.`;
      }
      if (!band.analysis?.trim()) {
        return `تحلیل بازه ${bandIndex + 1} بُعد ${dimensionIndex + 1} را وارد کنید.`;
      }
      if (max !== null) expectedMin = max + 1;
    }
    if (sorted[sorted.length - 1]?.max !== null) {
      return `آخرین بازه بُعد ${dimensionIndex + 1} باید بدون سقف باشد.`;
    }
  }

  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  if (questions.length === 0) return "حداقل یک سوال اضافه کنید.";
  if (questions.length > 300) return "حداکثر ۳۰۰ سوال برای هر آزمون مجاز است.";

  for (const [index, question] of questions.entries()) {
    if (!question.body?.trim()) return `متن سوال ${index + 1} خالی است.`;
    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length < 2) return `سوال ${index + 1} باید حداقل دو گزینه داشته باشد.`;
    if (options.length > 10) return `سوال ${index + 1} حداکثر ۱۰ گزینه می‌تواند داشته باشد.`;
    for (const option of options) {
      if (!option.body?.trim()) return `متن یکی از گزینه‌های سوال ${index + 1} خالی است.`;
      for (const [dimensionId, value] of Object.entries(option.scores ?? {})) {
        if (!dimensionId) continue;
        const score = Number(value ?? 0);
        if (!Number.isFinite(score) || score < 0) {
          return `امتیازهای گزینه‌های سوال ${index + 1} باید عدد صفر یا مثبت باشند.`;
        }
        if (score > 100) {
          return `امتیاز هر گزینه حداکثر ۱۰۰ است (سوال ${index + 1}).`;
        }
      }
    }
  }

  const rules = Array.isArray(payload.rules) ? payload.rules : [];
  const codes = new Set<string>();
  for (const rule of rules) {
    const code = normalizePsychCode(rule.code ?? "");
    if (!code) return "کد نتیجه در همه قواعد تحلیل لازم است.";
    if (code.length > 12) return "کد نتیجه حداکثر ۱۲ نویسه باشد.";
    if (codes.has(code)) return `کد نتیجه تکراری است: ${code}`;
    codes.add(code);
    if (!rule.title?.trim()) return `عنوان تحلیل برای کد ${code} خالی است.`;
    if (!rule.body?.trim()) return `متن تحلیل برای کد ${code} خالی است.`;
  }

  return null;
}

export async function savePsychTestAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const testId = field(formData, "testId");
  let payload: PsychEditorPayload;
  try {
    payload = parsePayload(formData);
  } catch {
    fail(
      testId ? `/counselor/psych-tests/${testId}/edit` : "/counselor/psych-tests/new",
      "داده‌های آزمون قابل خواندن نیست.",
    );
  }

  const validation = validatePayload(payload);
  if (validation) {
    fail(
      testId ? `/counselor/psych-tests/${testId}/edit` : "/counselor/psych-tests/new",
      validation,
    );
  }

  const db = await getDb();
  if (testId) {
    const [existing] = await db
      .select()
      .from(psychTests)
      .where(
        and(eq(psychTests.id, testId), eq(psychTests.workspaceId, counselor.workspaceId)),
      )
      .limit(1);
    if (!existing) fail("/counselor/psych-tests", "آزمون پیدا نشد.");
    if (existing.status !== "draft") {
      fail(`/counselor/psych-tests/${testId}`, "فقط آزمون پیش‌نویس قابل ویرایش است.");
    }
  }

  const rules: PsychResultRule[] = (payload.rules ?? []).map((rule) => ({
    code: normalizePsychCode(rule.code),
    title: rule.title.trim(),
    body: rule.body.trim(),
  }));

  let savedId = testId;
  if (!savedId) {
    const [test] = await db
      .insert(psychTests)
      .values({
        workspaceId: counselor.workspaceId,
        title: payload.title.trim(),
        description: payload.description?.trim() ?? "",
        status: "draft",
        resultRulesJson: rules,
        createdBy: counselor.id,
      })
      .returning();
    savedId = test.id;
  } else {
    await db
      .update(psychTests)
      .set({
        title: payload.title.trim(),
        description: payload.description?.trim() ?? "",
        resultRulesJson: rules,
        updatedAt: new Date(),
      })
      .where(eq(psychTests.id, savedId));
    await db.delete(psychQuestions).where(eq(psychQuestions.testId, savedId));
    await db.delete(psychDimensions).where(eq(psychDimensions.testId, savedId));
  }

  const dimensionIds = new Map<string, string>();
  for (const [index, dimension] of payload.dimensions.entries()) {
    const [row] = await db
      .insert(psychDimensions)
      .values({
        testId: savedId,
        sortOrder: index,
        title: dimension.title.trim(),
        description: dimension.description?.trim() ?? "",
        bandsJson: [...dimension.bands]
          .sort((first, second) => Number(first.min) - Number(second.min))
          .map((band) => ({
            min: Math.max(0, Math.floor(Number(band.min))),
            max:
              band.max === null || band.max === undefined || String(band.max) === ""
                ? null
                : Math.floor(Number(band.max)),
            label: band.label.trim(),
            code: normalizePsychCode(band.code ?? ""),
            analysis: band.analysis.trim(),
          })),
      })
      .returning({ id: psychDimensions.id });
    dimensionIds.set(dimension.clientId, row.id);
  }

  for (const [index, question] of payload.questions.entries()) {
    const [questionRow] = await db
      .insert(psychQuestions)
      .values({
        testId: savedId,
        sortOrder: index,
        body: question.body.trim(),
      })
      .returning({ id: psychQuestions.id });

    for (const [optionIndex, option] of question.options.entries()) {
      const scores: Record<string, number> = {};
      for (const [clientDimensionId, value] of Object.entries(option.scores ?? {})) {
        const dimensionId = dimensionIds.get(clientDimensionId);
        if (!dimensionId) continue;
        const score = Math.max(0, Math.floor(Number(value ?? 0)));
        if (score === 0) continue;
        scores[dimensionId] = score;
      }
      await db.insert(psychOptions).values({
        questionId: questionRow.id,
        sortOrder: optionIndex,
        body: option.body.trim(),
        scoresJson: scores,
      });
    }
  }

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: testId ? "psych_test.update" : "psych_test.create",
    entity: "psych_test",
    entityId: savedId,
    diff: {
      title: payload.title,
      dimensions: payload.dimensions.length,
      questions: payload.questions.length,
      rules: rules.length,
    },
  });

  revalidatePath("/counselor/psych-tests");
  revalidatePath(`/counselor/psych-tests/${savedId}`);
  redirect(`/counselor/psych-tests/${savedId}?success=${testId ? "updated" : "created"}`);
}

export async function publishPsychTestAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const testId = field(formData, "testId");
  const content = await getPsychTestContent(counselor.workspaceId, testId);
  if (!content) fail("/counselor/psych-tests", "آزمون پیدا نشد.");
  if (content.dimensions.length === 0) fail(`/counselor/psych-tests/${testId}`, "آزمون بُعد ندارد.");
  if (content.questions.length === 0) fail(`/counselor/psych-tests/${testId}`, "آزمون سوال ندارد.");
  if (content.questions.some((question) => question.options.length < 2)) {
    fail(`/counselor/psych-tests/${testId}`, "همه سوال‌ها باید حداقل دو گزینه داشته باشند.");
  }

  const db = await getDb();
  await db
    .update(psychTests)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(psychTests.id, testId), eq(psychTests.workspaceId, counselor.workspaceId)),
    );

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "psych_test.publish",
    entity: "psych_test",
    entityId: testId,
    diff: { questions: content.questions.length },
  });

  revalidatePath("/counselor/psych-tests");
  revalidatePath(`/counselor/psych-tests/${testId}`);
  revalidatePath("/student/psych-tests");
  redirect(`/counselor/psych-tests/${testId}?success=published`);
}

export async function archivePsychTestAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const testId = field(formData, "testId");

  const db = await getDb();
  await db
    .update(psychTests)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(eq(psychTests.id, testId), eq(psychTests.workspaceId, counselor.workspaceId)),
    );

  revalidatePath("/counselor/psych-tests");
  revalidatePath(`/counselor/psych-tests/${testId}`);
  revalidatePath("/student/psych-tests");
  redirect(`/counselor/psych-tests/${testId}?success=archived`);
}

export async function deletePsychTestAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const testId = field(formData, "testId");

  const db = await getDb();
  const [test] = await db
    .select()
    .from(psychTests)
    .where(
      and(eq(psychTests.id, testId), eq(psychTests.workspaceId, counselor.workspaceId)),
    )
    .limit(1);
  if (!test) fail("/counselor/psych-tests", "آزمون پیدا نشد.");
  if (test.status !== "draft") {
    fail(`/counselor/psych-tests/${testId}`, "فقط آزمون پیش‌نویس قابل حذف است.");
  }

  await db.delete(psychTests).where(eq(psychTests.id, testId));

  revalidatePath("/counselor/psych-tests");
  redirect("/counselor/psych-tests?success=deleted");
}

function takePath(role: "counselor" | "student", testId: string, attemptId: string): string {
  return role === "counselor"
    ? `/counselor/psych-tests/${testId}/take?attempt=${attemptId}`
    : `/student/psych-tests/${testId}/take?attempt=${attemptId}`;
}

function resultPath(role: "counselor" | "student", testId: string, attemptId: string): string {
  return role === "counselor"
    ? `/counselor/psych-tests/${testId}/result/${attemptId}`
    : `/student/psych-tests/${testId}/result/${attemptId}`;
}

export async function startPsychAttemptAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const testId = field(formData, "testId");

  const db = await getDb();
  const [test] = await db
    .select()
    .from(psychTests)
    .where(
      and(
        eq(psychTests.id, testId),
        eq(psychTests.workspaceId, user.workspaceId),
        eq(psychTests.status, "published"),
      ),
    )
    .limit(1);
  if (!test) {
    const message = encodeURIComponent("آزمون منتشرشده پیدا نشد.");
    redirect(
      user.role === "counselor"
        ? `/counselor/psych-tests?error=${message}`
        : `/student/psych-tests?error=${message}`,
    );
  }

  let studentId: string | null = null;
  if (user.role === "student") {
    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, user.id))
      .limit(1);
    if (!student) {
      redirect(
        `/student/psych-tests?error=${encodeURIComponent("حساب دانش‌آموزی پیدا نشد.")}`,
      );
    }
    studentId = student.id;
  }

  const existing = await findInProgressAttempt(testId, user.id);
  if (existing) redirect(takePath(user.role, testId, existing.id));

  const [attempt] = await db
    .insert(psychAttempts)
    .values({
      workspaceId: user.workspaceId,
      testId,
      userId: user.id,
      studentId,
      participantRole: user.role,
      status: "in_progress",
      startedAt: new Date(),
    })
    .returning();

  await logAudit({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "psych_attempt.start",
    entity: "psych_attempt",
    entityId: attempt.id,
    diff: { testId },
  });

  revalidatePath("/counselor/psych-tests");
  revalidatePath("/student/psych-tests");
  redirect(takePath(user.role, testId, attempt.id));
}

export async function submitPsychAttemptAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const testId = field(formData, "testId");
  const attemptId = field(formData, "attemptId");
  const backPath = takePath(user.role, testId, attemptId);

  const db = await getDb();
  const [attempt] = await db
    .select()
    .from(psychAttempts)
    .where(
      and(
        eq(psychAttempts.id, attemptId),
        eq(psychAttempts.testId, testId),
        eq(psychAttempts.workspaceId, user.workspaceId),
        eq(psychAttempts.userId, user.id),
      ),
    )
    .limit(1);
  if (!attempt) fail(user.role === "counselor" ? "/counselor/psych-tests" : "/student/psych-tests", "تلاش آزمون پیدا نشد.");
  if (attempt.status !== "in_progress") redirect(resultPath(user.role, testId, attemptId));

  const content = await getPsychTestContent(user.workspaceId, testId);
  if (!content) fail(user.role === "counselor" ? "/counselor/psych-tests" : "/student/psych-tests", "آزمون پیدا نشد.");

  const selectedScores: Record<string, number>[] = [];
  const answers: { questionId: string; optionId: string }[] = [];

  for (const question of content.questions) {
    const optionId = String(formData.get(`q-${question.id}`) ?? "");
    const option = question.options.find((entry) => entry.id === optionId);
    if (!option) {
      fail(backPath, `پاسخ سوال «${question.body.slice(0, 30)}» را انتخاب کنید.`);
    }
    selectedScores.push(option.scoresJson ?? {});
    answers.push({ questionId: question.id, optionId: option.id });
  }

  const scoringDimensions: PsychScoringDimension[] = content.dimensions.map((dimension) => ({
    id: dimension.id,
    title: dimension.title,
    description: dimension.description,
    bands: dimension.bandsJson ?? [],
  }));
  const result = scorePsychAttempt(scoringDimensions, selectedScores, content.rules);

  await db.delete(psychAnswers).where(eq(psychAnswers.attemptId, attemptId));
  await db.insert(psychAnswers).values(
    answers.map((answer) => ({
      attemptId,
      questionId: answer.questionId,
      optionId: answer.optionId,
    })),
  );

  await db
    .update(psychAttempts)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      scoresJson: result.scores,
      resultCode: result.code,
      resultTitle: result.title,
      resultBody: result.body,
    })
    .where(eq(psychAttempts.id, attemptId));

  await logAudit({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "psych_attempt.submit",
    entity: "psych_attempt",
    entityId: attemptId,
    diff: { testId, code: result.code },
  });

  revalidatePath("/counselor/psych-tests");
  revalidatePath("/student/psych-tests");
  revalidatePath(`/counselor/psych-tests/${testId}`);
  redirect(resultPath(user.role, testId, attemptId));
}
