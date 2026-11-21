"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { students } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { startOfWeekSaturday } from "@/lib/dates";
import { PanelValidationError, saveWeeklyPanel } from "@/lib/panel";
import { saveBellSlots, ScheduleValidationError } from "@/lib/schedule";
import { saveSchoolLessons, SchoolScheduleValidationError } from "@/lib/school-schedule";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function panelPath(role: "counselor" | "student", studentId: string, week: string, suffix = ""): string {
  const base =
    role === "counselor" ? `/counselor/students/${studentId}/panel` : "/student/panel";
  return `${base}${week ? `?week=${week}` : ""}${suffix}`;
}

export async function saveWeeklyPanelAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studentId = field(formData, "studentId");

  if (user.role === "student") {
    const db = await getDb();
    const [own] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, user.id), eq(students.workspaceId, user.workspaceId)))
      .limit(1);
    if (!own) redirect("/login?error=حساب دانش‌آموزی پیدا نشد.");
    studentId = own.id;
  } else {
    const db = await getDb();
    const [owned] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.workspaceId, user.workspaceId), eq(students.id, studentId)))
      .limit(1);
    if (!owned) redirect("/counselor");
  }

  const weekStart = startOfWeekSaturday(field(formData, "weekStart") || new Date().toISOString().slice(0, 10));

  let grid: unknown;
  let weekSlots: unknown;
  try {
    grid = JSON.parse(field(formData, "gridJson") || "null");
    weekSlots = JSON.parse(field(formData, "slotsJson") || "null");
  } catch {
    redirect(panelPath(user.role, studentId, weekStart, "&error=" + encodeURIComponent("داده جدول نامعتبر است.")));
  }

  try {
    await saveWeeklyPanel({
      studentId,
      weekStart,
      grid,
      dailyRoutine: field(formData, "dailyRoutine"),
      nextWeekHomework: field(formData, "nextWeekHomework"),
      actorId: user.id,
      slots: weekSlots ?? undefined,
    });
  } catch (error) {
    if (error instanceof PanelValidationError) {
      redirect(panelPath(user.role, studentId, weekStart, "&error=" + encodeURIComponent(error.message)));
    }
    throw error;
  }

  if (user.role === "counselor") {
    revalidatePath(`/counselor/students/${studentId}`);
    revalidatePath(`/counselor/students/${studentId}/performance`);
  }
  revalidatePath("/student");
  revalidatePath("/student/performance");
  redirect(panelPath(user.role, studentId, weekStart, "&success=saved"));
}

export async function saveSchoolScheduleAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studentId = field(formData, "studentId");
  if (user.role === "student") {
    const db = await getDb();
    const [own] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, user.id), eq(students.workspaceId, user.workspaceId)))
      .limit(1);
    if (!own) redirect("/login?error=حساب دانش‌آموزی پیدا نشد.");
    studentId = own.id;
  } else {
    const db = await getDb();
    const [owned] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.workspaceId, user.workspaceId), eq(students.id, studentId)))
      .limit(1);
    if (!owned) redirect("/counselor");
  }

  const weekStart = startOfWeekSaturday(
    field(formData, "weekStart") || new Date().toISOString().slice(0, 10),
  );
  let lessons: unknown;
  try {
    lessons = JSON.parse(field(formData, "schoolJson") || "[]");
  } catch {
    redirect(panelPath(user.role, studentId, weekStart, "&error=" + encodeURIComponent("داده برنامه مدرسه نامعتبر است.")));
  }
  try {
    await saveSchoolLessons(studentId, lessons);
  } catch (error) {
    if (error instanceof SchoolScheduleValidationError) {
      redirect(panelPath(user.role, studentId, weekStart, "&error=" + encodeURIComponent(error.message)));
    }
    throw error;
  }
  revalidatePath(`/counselor/students/${studentId}/panel`);
  revalidatePath(`/counselor/students/${studentId}/auto-plan`);
  revalidatePath("/student/panel");
  revalidatePath("/student");
  redirect(panelPath(user.role, studentId, weekStart, "&success=saved"));
}

export async function saveBellSlotsAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studentId = field(formData, "studentId");

  if (user.role === "student") {
    const db = await getDb();
    const [own] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, user.id), eq(students.workspaceId, user.workspaceId)))
      .limit(1);
    if (!own) redirect("/login?error=حساب دانش‌آموزی پیدا نشد.");
    studentId = own.id;
  } else {
    const db = await getDb();
    const [owned] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.workspaceId, user.workspaceId), eq(students.id, studentId)))
      .limit(1);
    if (!owned) redirect("/counselor");
  }

  const weekStart = startOfWeekSaturday(
    field(formData, "weekStart") || new Date().toISOString().slice(0, 10),
  );

  let slots: unknown;
  try {
    slots = JSON.parse(field(formData, "slotsJson") || "null");
  } catch {
    redirect(panelPath(user.role, studentId, weekStart, "&error=" + encodeURIComponent("داده زنگ‌ها نامعتبر است.")));
  }

  try {
    await saveBellSlots(studentId, slots);
  } catch (error) {
    if (error instanceof ScheduleValidationError) {
      redirect(panelPath(user.role, studentId, weekStart, "&error=" + encodeURIComponent(error.message)));
    }
    throw error;
  }

  revalidatePath(`/counselor/students/${studentId}/panel`);
  revalidatePath(`/counselor/students/${studentId}/performance`);
  revalidatePath("/student/panel");
  revalidatePath("/student/performance");
  redirect(panelPath(user.role, studentId, weekStart, "&success=saved"));
}
