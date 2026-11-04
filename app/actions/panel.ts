"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { students } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { startOfWeekSaturday } from "@/lib/dates";
import { PanelValidationError, saveWeeklyPanel } from "@/lib/panel";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function panelPath(role: "counselor" | "student", studentId: string, week: string, suffix = ""): string {
  return role === "counselor"
    ? `/counselor/students/${studentId}/panel?week=${week}${suffix}`
    : `/student/panel?week=${week}${suffix}`;
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
  try {
    grid = JSON.parse(field(formData, "gridJson") || "null");
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
    });
  } catch (error) {
    if (error instanceof PanelValidationError) {
      redirect(panelPath(user.role, studentId, weekStart, "&error=" + encodeURIComponent(error.message)));
    }
    throw error;
  }

  if (user.role === "counselor") {
    revalidatePath(`/counselor/students/${studentId}`);
  }
  revalidatePath("/student");
  redirect(panelPath(user.role, studentId, weekStart, "&success=saved"));
}
