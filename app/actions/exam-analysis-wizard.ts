"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  examAnalyses,
  students,
  type ExamAnalysisCauseRow,
  type ExamAnalysisGoalRow,
  type ExamAnalysisPreparationRow,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { generateExamActions, generateExamAdvice, generateExamGoals } from "@/lib/ai-exam-analysis";
import {
  getExamResult,
  listStudentExamResults,
  type ExamResultView,
} from "@/lib/exam-analysis";
import {
  buildPreparationData,
  buildPreviousAverages,
  getExamAnalysisRow,
  isLowPercent,
} from "@/lib/exam-analysis-wizard";

type WizardContext = {
  role: "counselor" | "student";
  studentId: string;
  workspaceId: string;
  actorId: string;
  basePath: string;
  examSource: "internal" | "external";
  examRefId: string;
  exam: ExamResultView;
};

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function intField(form: FormData, name: string): number | null {
  const raw = field(form, name);
  if (raw === "") return null;
  const value = Number(raw.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))));
  return Number.isFinite(value) ? Math.round(value) : null;
}

function fail(context: WizardContext, message: string): never {
  redirect(`${wizardPath(context)}&error=${encodeURIComponent(message)}`);
}

function wizardPath(context: WizardContext, success?: string): string {
  const path =
    context.role === "student"
      ? "/student/exam-analysis"
      : `/counselor/students/${context.studentId}/exam-analysis`;
  const params = new URLSearchParams({
    exam: `${context.examSource}:${context.examRefId}`,
  });
  if (success) params.set("success", success);
  return `${path}?${params.toString()}`;
}

async function resolveWizardContext(formData: FormData): Promise<WizardContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = await getDb();

  const examSourceRaw = field(formData, "examSource");
  const examRefId = field(formData, "examRefId");
  if (examSourceRaw !== "internal" && examSourceRaw !== "external") {
    redirect(user.role === "student" ? "/student/exam-analysis" : "/counselor");
  }
  const examSource = examSourceRaw as "internal" | "external";

  if (user.role === "student") {
    const [own] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, user.id), eq(students.workspaceId, user.workspaceId)))
      .limit(1);
    if (!own) redirect("/login?error=حساب دانش‌آموزی پیدا نشد.");
    const exam = await getExamResult(own.id, examSource, examRefId);
    if (!exam) redirect("/student/exam-analysis?error=آزمون پیدا نشد.");
    return {
      role: "student",
      studentId: own.id,
      workspaceId: user.workspaceId,
      actorId: user.id,
      basePath: "/student/exam-analysis",
      examSource,
      examRefId,
      exam,
    };
  }

  const studentId = field(formData, "studentId");
  const [owned] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.workspaceId, user.workspaceId), eq(students.id, studentId)))
    .limit(1);
  if (!owned) redirect("/counselor");
  const exam = await getExamResult(owned.id, examSource, examRefId);
  if (!exam) redirect(`/counselor/students/${owned.id}/exam-analysis?error=آزمون پیدا نشد.`);
  return {
    role: "counselor",
    studentId: owned.id,
    workspaceId: user.workspaceId,
    actorId: user.id,
    basePath: `/counselor/students/${owned.id}/exam-analysis`,
    examSource,
    examRefId,
    exam,
  };
}

async function upsertRow(
  context: WizardContext,
  values: Partial<{
    step1Json: ExamAnalysisCauseRow[];
    counselorNoteHigh: string;
    counselorNoteLow: string;
    step2Json: ExamAnalysisPreparationRow[];
    counselorAdvice: string;
    adviceApproved: boolean;
    step3Json: ExamAnalysisGoalRow[];
    finalGoal: string;
    goalsSource: string;
  }>,
): Promise<void> {
  const db = await getDb();
  const [existing] = await db
    .select({ id: examAnalyses.id })
    .from(examAnalyses)
    .where(
      and(
        eq(examAnalyses.studentId, context.studentId),
        eq(examAnalyses.examSource, context.examSource),
        eq(examAnalyses.examRefId, context.examRefId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(examAnalyses)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(examAnalyses.id, existing.id));
    return;
  }

  await db.insert(examAnalyses).values({
    workspaceId: context.workspaceId,
    studentId: context.studentId,
    examSource: context.examSource,
    examRefId: context.examRefId,
    title: context.exam.title,
    examDate: context.exam.examDate,
    createdBy: context.actorId,
    ...values,
  });
}

function readStep1Rows(formData: FormData, context: WizardContext): ExamAnalysisCauseRow[] {
  return context.exam.subjects.map((subject, index) => ({
    subjectId: subject.subjectId,
    subjectTitle: subject.subjectTitle,
    percent: subject.percent,
    wrong: subject.wrong,
    blank: subject.blank,
    total: subject.total,
    questionNote: field(formData, `question_${index}`),
    cause: field(formData, `cause_${index}`),
    action: field(formData, `action_${index}`),
    actionSource: field(formData, `action_${index}`) ? "user" : "",
  }));
}

function revalidateBoth(context: WizardContext): void {
  revalidatePath("/student/exam-analysis");
  revalidatePath(`/counselor/students/${context.studentId}/exam-analysis`);
}

export async function saveWizardStep1Action(formData: FormData): Promise<void> {
  const context = await resolveWizardContext(formData);
  const rows = readStep1Rows(formData, context);
  await upsertRow(context, {
    step1Json: rows,
    ...(context.role === "counselor"
      ? {
          counselorNoteHigh: field(formData, "counselorNoteHigh"),
          counselorNoteLow: field(formData, "counselorNoteLow"),
        }
      : {}),
  });
  revalidateBoth(context);
  redirect(wizardPath(context, "step1"));
}

export async function generateWizardAiActionAction(formData: FormData): Promise<void> {
  const context = await resolveWizardContext(formData);
  const rows = readStep1Rows(formData, context);
  const missing = rows.filter((row) => !isLowPercent(row.percent) && !row.cause);
  if (missing.length > 0) {
    fail(context, `ابتدا علتِ تست‌های غلط/نزده‌ی درس «${missing[0].subjectTitle}» را بنویسید.`);
  }

  const { actions } = await generateExamActions({
    workspaceId: context.workspaceId,
    studentId: context.studentId,
    exam: context.exam,
    causes: rows,
  });

  const actionsByTitle = new Map(
    actions.map((entry) => [entry.subjectTitle.replace(/\s+/g, " ").trim(), entry.action] as const),
  );
  const merged = rows.map((row) => {
    const suggestion = actionsByTitle.get(row.subjectTitle.replace(/\s+/g, " ").trim());
    return suggestion ? { ...row, action: suggestion, actionSource: "ai" as const } : row;
  });

  await upsertRow(context, { step1Json: merged });
  revalidateBoth(context);
  redirect(wizardPath(context, "ai-actions"));
}

export async function saveWizardStep2Action(formData: FormData): Promise<void> {
  const context = await resolveWizardContext(formData);
  const rows: ExamAnalysisPreparationRow[] = context.exam.subjects.map((subject, index) => ({
    subjectId: subject.subjectId,
    subjectTitle: subject.subjectTitle,
    topicTests: Math.max(0, intField(formData, `topic_${index}`) ?? 0),
    timedTests: Math.max(0, intField(formData, `timed_${index}`) ?? 0),
    avgPercent: intField(formData, `avg_${index}`),
    approxPercent: intField(formData, `approx_${index}`),
  }));
  await upsertRow(context, {
    step2Json: rows,
    ...(context.role === "counselor" ? { counselorAdvice: field(formData, "counselorAdvice") } : {}),
  });
  revalidateBoth(context);
  redirect(wizardPath(context, "step2"));
}

export async function generateWizardAdviceAction(formData: FormData): Promise<void> {
  const context = await resolveWizardContext(formData);
  if (context.role !== "counselor") fail(context, "توصیه مشاور فقط توسط مشاور قابل تولید است.");

  const row = await getExamAnalysisRow(context.studentId, context.examSource, context.examRefId);
  const all = await listStudentExamResults(context.studentId);
  const averages = buildPreviousAverages(all, context.exam);
  const savedPreparation = row?.step2Json ?? [];
  const preparationRows =
    savedPreparation.length > 0
      ? savedPreparation
      : await buildPreparationData({
          studentId: context.studentId,
          workspaceId: context.workspaceId,
          exam: context.exam,
        }).then((data) =>
          data.map((entry) => ({
            subjectId: entry.subjectId,
            subjectTitle: entry.subjectTitle,
            topicTests: entry.topicTests,
            timedTests: entry.timedTests,
            avgPercent: averages.get(entry.subjectTitle.replace(/\s+/g, " ").trim()) ?? entry.avgPercent,
            approxPercent: entry.approxPercent,
          })),
        );
  const preparation = preparationRows.map((entry) => ({
    subject: entry.subjectTitle,
    topicTests: entry.topicTests,
    timedTests: entry.timedTests,
    avgPercent: entry.avgPercent,
    percent: entry.approxPercent ?? 0,
  }));

  const { advice } = await generateExamAdvice({
    workspaceId: context.workspaceId,
    studentId: context.studentId,
    exam: context.exam,
    preparation,
    previousAverage:
      averages.size > 0
        ? Math.round(
            [...averages.values()].reduce((sum, value) => sum + value, 0) / averages.size,
          )
        : null,
  });

  await upsertRow(context, { counselorAdvice: advice, adviceApproved: false });
  revalidateBoth(context);
  redirect(wizardPath(context, "ai-advice"));
}

export async function approveWizardAdviceAction(formData: FormData): Promise<void> {
  const context = await resolveWizardContext(formData);
  if (context.role !== "counselor") fail(context, "تایید توصیه فقط توسط مشاور انجام می‌شود.");
  if (!field(formData, "counselorAdvice")) fail(context, "متن توصیه خالی است.");
  await upsertRow(context, {
    counselorAdvice: field(formData, "counselorAdvice"),
    adviceApproved: true,
  });
  revalidateBoth(context);
  redirect(wizardPath(context, "advice-approved"));
}

export async function saveWizardStep3Action(formData: FormData): Promise<void> {
  const context = await resolveWizardContext(formData);
  const rows: ExamAnalysisGoalRow[] = context.exam.subjects.map((subject, index) => {
    const target = intField(formData, `target_${index}`);
    return {
      subjectTitle: subject.subjectTitle,
      currentPercent: subject.percent,
      targetPercent: target === null ? null : Math.max(0, Math.min(100, target)),
      note: field(formData, `goalNote_${index}`),
    };
  });
  await upsertRow(context, {
    step3Json: rows,
    goalsSource: rows.some((row) => row.targetPercent !== null) ? "user" : "",
    ...(context.role === "student" ? { finalGoal: field(formData, "finalGoal") } : {}),
  });
  revalidateBoth(context);
  redirect(wizardPath(context, "step3"));
}

export async function generateWizardGoalsAction(formData: FormData): Promise<void> {
  const context = await resolveWizardContext(formData);
  const all = await listStudentExamResults(context.studentId);
  const averages = buildPreviousAverages(all, context.exam);
  const { goals } = await generateExamGoals({
    workspaceId: context.workspaceId,
    studentId: context.studentId,
    exam: context.exam,
    previousAverages: context.exam.subjects.map((subject) => ({
      subject: subject.subjectTitle,
      average: averages.get(subject.subjectTitle.replace(/\s+/g, " ").trim()) ?? null,
    })),
  });

  const goalsByTitle = new Map(
    goals.map((entry) => [entry.subjectTitle.replace(/\s+/g, " ").trim(), entry] as const),
  );
  const rows: ExamAnalysisGoalRow[] = context.exam.subjects.map((subject) => {
    const suggestion = goalsByTitle.get(subject.subjectTitle.replace(/\s+/g, " ").trim());
    return {
      subjectTitle: subject.subjectTitle,
      currentPercent: subject.percent,
      targetPercent: suggestion?.targetPercent ?? null,
      note: suggestion?.note ?? "",
    };
  });

  await upsertRow(context, { step3Json: rows, goalsSource: "ai" });
  revalidateBoth(context);
  redirect(wizardPath(context, "ai-goals"));
}

export async function resetWizardAdviceAction(formData: FormData): Promise<void> {
  const context = await resolveWizardContext(formData);
  if (context.role !== "counselor") fail(context, "فقط مشاور می‌تواند توصیه را بازنشانی کند.");
  await upsertRow(context, { adviceApproved: false });
  revalidateBoth(context);
  redirect(wizardPath(context));
}
