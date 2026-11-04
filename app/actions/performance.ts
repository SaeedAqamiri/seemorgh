"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { performancePanels, students, subjects } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { isISODate, startOfWeekSaturday } from "@/lib/dates";
import {
  generatePerformanceNarrative,
} from "@/lib/ai-performance";
import {
  getPerformanceAnalysis,
  getPerformanceRangeData,
  getPerformanceView,
  PerformanceValidationError,
  savePerformancePanel,
} from "@/lib/performance";
import { saveReport } from "@/lib/reports";
import { getWeeklyPanelView } from "@/lib/panel";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function perfPath(
  role: "counselor" | "student",
  studentId: string,
  week: string,
  suffix = "",
): string {
  return role === "counselor"
    ? `/counselor/students/${studentId}/performance?week=${week}${suffix}`
    : `/student/performance?week=${week}${suffix}`;
}

async function resolveStudentForWrite(): Promise<
  { role: "counselor" | "student"; studentId: string } | never
> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = await getDb();

  if (user.role === "student") {
    const [own] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, user.id), eq(students.workspaceId, user.workspaceId)))
      .limit(1);
    if (!own) redirect("/login?error=حساب دانش‌آموزی پیدا نشد.");
    return { role: "student", studentId: own.id };
  }

  return { role: "counselor", studentId: "" };
}

export async function savePerformancePanelAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ctx = await resolveStudentForWrite();
  let studentId = ctx.studentId;
  if (ctx.role === "counselor") {
    const db = await getDb();
    const [owned] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.workspaceId, user.workspaceId), eq(students.id, field(formData, "studentId"))))
      .limit(1);
    if (!owned) redirect("/counselor");
    studentId = owned.id;
  }

  const weekStart = startOfWeekSaturday(
    field(formData, "weekStart") || new Date().toISOString().slice(0, 10),
  );

  let grid: unknown;
  try {
    grid = JSON.parse(field(formData, "cellsJson") || "null");
  } catch {
    redirect(perfPath(ctx.role, studentId, weekStart, "&error=" + encodeURIComponent("داده جدول عملکرد نامعتبر است.")));
  }

  try {
    await savePerformancePanel({ studentId, weekStart, grid, actorId: user.id });
  } catch (error) {
    if (error instanceof PerformanceValidationError) {
      redirect(perfPath(ctx.role, studentId, weekStart, "&error=" + encodeURIComponent(error.message)));
    }
    throw error;
  }

  revalidatePath("/student");
  revalidatePath("/student/performance");
  revalidatePath("/student/report");
  revalidatePath(`/counselor/students/${studentId}`);
  if (ctx.role === "counselor") revalidatePath("/counselor/performance");
  redirect(perfPath(ctx.role, studentId, weekStart, "&success=saved"));
}

function rangeReportPath(
  role: "counselor" | "student",
  studentId: string,
  from: string,
  to: string,
  extra?: Record<string, string>,
): string {
  const base =
    role === "counselor"
      ? `/counselor/students/${studentId}/report`
      : "/student/report";
  const params = new URLSearchParams({ from, to, ...(extra ?? {}) });
  return `${base}?${params.toString()}`;
}

async function resolveStudentForReport(formData: FormData): Promise<{
  role: "counselor" | "student";
  studentId: string;
  workspaceId: string;
}> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = await getDb();

  if (user.role === "student") {
    const [own] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, user.id), eq(students.workspaceId, user.workspaceId)))
      .limit(1);
    if (!own) redirect("/login?error=حساب دانش‌آموزی پیدا نشد.");
    return { role: "student", studentId: own.id, workspaceId: user.workspaceId };
  }

  const [owned] = await db
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.workspaceId, user.workspaceId),
        eq(students.id, field(formData, "studentId")),
      ),
    )
    .limit(1);
  if (!owned) redirect("/counselor");
  return { role: "counselor", studentId: owned.id, workspaceId: user.workspaceId };
}

export async function generatePerformanceRangeNarrativeAction(formData: FormData): Promise<void> {
  const ctx = await resolveStudentForReport(formData);
  const from = field(formData, "from");
  const to = field(formData, "to");

  if (!isISODate(from) || !isISODate(to) || from > to) {
    redirect(
      rangeReportPath(ctx.role, ctx.studentId, from, to, {
        error: "بازه انتخاب‌شده معتبر نیست.",
      }),
    );
  }

  const range = await getPerformanceRangeData(ctx.studentId, from, to);
  if (!range.analysis.hasAnyData) {
    redirect(
      rangeReportPath(ctx.role, ctx.studentId, from, to, {
        error: "در این بازه عملکردی ثبت نشده است.",
      }),
    );
  }

  const result = await generatePerformanceNarrative({
    workspaceId: ctx.workspaceId,
    studentId: ctx.studentId,
    analysis: range.analysis,
    plannedSubjectsByDay: range.plannedSubjectsByDay,
    notes: range.notes,
    dailyRoutine: range.dailyRoutine,
  });

  await saveReport({
    studentId: ctx.studentId,
    periodType: "performance",
    periodStart: from,
    periodEnd: to,
    metrics: {
      activeDays: range.analysis.activeDays,
      onplanDays: range.analysis.onplanDays,
      offplanDays: range.analysis.offplanDays,
      totalMinutes: range.analysis.totalMinutes,
      totalPractice: range.analysis.totalPractice,
    },
    narrative: result.narrative,
  });

  revalidatePath("/student/report");
  revalidatePath(`/counselor/students/${ctx.studentId}/report`);
  redirect(rangeReportPath(ctx.role, ctx.studentId, from, to, { success: "narrative" }));
}

export async function generatePerformanceNarrativeAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ctx = await resolveStudentForWrite();
  let studentId = ctx.studentId;
  if (ctx.role === "counselor") {
    const db = await getDb();
    const [owned] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.workspaceId, user.workspaceId), eq(students.id, field(formData, "studentId"))))
      .limit(1);
    if (!owned) redirect("/counselor");
    studentId = owned.id;
  }

  const weekStart = startOfWeekSaturday(
    field(formData, "weekStart") || new Date().toISOString().slice(0, 10),
  );

  const db = await getDb();
  const [studentRow] = await db
    .select({ workspaceId: students.workspaceId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!studentRow) redirect("/counselor");

  const [analysis, perf, plan] = await Promise.all([
    getPerformanceAnalysis(studentId, weekStart),
    getPerformanceView(studentId, weekStart),
    getWeeklyPanelView(studentId, weekStart),
  ]);

  const subjectRows = await db
    .select({ id: subjects.id, title: subjects.title })
    .from(subjects)
    .where(eq(subjects.workspaceId, studentRow.workspaceId));
  const subjectTitles = new Map(subjectRows.map((row) => [row.id, row.title]));

  const plannedSubjectsByDay = plan.grid.map((row) => [
    ...new Set(
      row
        .filter((cell) => cell.kind === "review" || cell.kind === "test")
        .map((cell) => subjectTitles.get(cell.subjectId) ?? "درس"),
    ),
  ]);

  const notes = perf.grid.flatMap((row, day) =>
    row.flatMap((cell, slot) => {
      const note = cell.kind === "review" || cell.kind === "practice" ? cell.note.trim() : "";
      return note
        ? [{ weekday: day, slot, text: note.slice(0, 300) }]
        : [];
    }),
  );

  if (!analysis.hasAnyData) {
    redirect(
      perfPath(ctx.role, studentId, weekStart, "&error=" + encodeURIComponent("اول عملکرد هفته را ثبت کنید.")),
    );
  }

  const result = await generatePerformanceNarrative({
    workspaceId: studentRow.workspaceId,
    studentId,
    analysis,
    plannedSubjectsByDay,
    notes,
    dailyRoutine: plan.dailyRoutine,
  });

  await db
    .insert(performancePanels)
    .values({
      studentId,
      weekStart,
      narrative: result.narrative,
      narrativeAt: new Date(),
      updatedBy: user.id,
    })
    .onConflictDoUpdate({
      target: [performancePanels.studentId, performancePanels.weekStart],
      set: { narrative: result.narrative, narrativeAt: new Date(), updatedBy: user.id },
    });

  revalidatePath("/student/performance");
  if (ctx.role === "counselor") revalidatePath("/counselor/performance");
  redirect(perfPath(ctx.role, studentId, weekStart, "&success=narrative"));
}
