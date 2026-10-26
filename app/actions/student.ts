"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { dailyLogs, plans, resources, tasks } from "@/db/schema";
import { requireStudent } from "@/lib/auth";
import { todayISO } from "@/lib/dates";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function num(form: FormData, name: string): number {
  return Number(field(form, name));
}

async function ownedTask(studentId: string, taskId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ task: tasks, plan: plans })
    .from(tasks)
    .innerJoin(plans, eq(tasks.planId, plans.id))
    .where(and(eq(tasks.id, taskId), eq(plans.studentId, studentId)))
    .limit(1);
  return row ?? null;
}

export async function startTaskAction(formData: FormData): Promise<void> {
  const { student } = await requireStudent();
  const taskId = field(formData, "taskId");
  const row = await ownedTask(student.id, taskId);

  if (!row) redirect("/student?error=تسک پیدا نشد.");
  if (row.task.actualStartedAt) redirect("/student");

  const db = await getDb();
  const now = new Date();

  await db
    .update(tasks)
    .set({ actualStartedAt: now })
    .where(eq(tasks.id, taskId));

  const date = row.task.planDate;
  await db
    .insert(dailyLogs)
    .values({ studentId: student.id, logDate: date, firstStartedAt: now })
    .onConflictDoUpdate({
      target: [dailyLogs.studentId, dailyLogs.logDate],
      set: {
        firstStartedAt: sql`coalesce(${dailyLogs.firstStartedAt}, ${now})`,
      },
    });

  revalidatePath("/student");
  redirect("/student?success=started");
}

export async function finishTaskAction(formData: FormData): Promise<void> {
  const { student } = await requireStudent();
  const taskId = field(formData, "taskId");
  const actualUnits = Math.max(0, num(formData, "actualUnits"));
  const note = field(formData, "note");
  const row = await ownedTask(student.id, taskId);

  if (!row) redirect("/student?error=تسک پیدا نشد.");
  if (row.task.status === "done") redirect("/student");

  const db = await getDb();
  await db
    .update(tasks)
    .set({
      status: "done",
      actualEndedAt: new Date(),
      actualUnits,
      note: note || row.task.note,
      actualStartedAt: row.task.actualStartedAt ?? new Date(),
    })
    .where(eq(tasks.id, taskId));

  if (row.task.resourceId && actualUnits > 0) {
    await db
      .update(resources)
      .set({
        completedUnits: sql`least(${resources.totalUnits}, ${resources.completedUnits} + ${actualUnits})`,
      })
      .where(eq(resources.id, row.task.resourceId));
  }

  revalidatePath("/student");
  revalidatePath("/counselor");
  redirect("/student?success=done");
}

export async function skipTaskAction(formData: FormData): Promise<void> {
  const { student } = await requireStudent();
  const taskId = field(formData, "taskId");
  const row = await ownedTask(student.id, taskId);
  if (!row) redirect("/student?error=تسک پیدا نشد.");

  const db = await getDb();
  await db.update(tasks).set({ status: "skipped" }).where(eq(tasks.id, taskId));

  revalidatePath("/student");
  redirect("/student?success=skipped");
}

export async function saveDailyLogAction(formData: FormData): Promise<void> {
  const { student } = await requireStudent();
  const mood = Math.max(1, Math.min(5, num(formData, "mood") || 3));
  const energy = Math.max(1, Math.min(5, num(formData, "energy") || 3));
  const note = field(formData, "note");
  const date = todayISO();

  const db = await getDb();
  await db
    .insert(dailyLogs)
    .values({ studentId: student.id, logDate: date, mood, energy, note })
    .onConflictDoUpdate({
      target: [dailyLogs.studentId, dailyLogs.logDate],
      set: { mood, energy, note },
    });

  revalidatePath("/student");
  redirect("/student?success=log");
}
