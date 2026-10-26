"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  availability,
  examTargets,
  plans,
  resources,
  studentConstraints,
  students,
  subjects,
  tasks,
} from "@/db/schema";
import { requireCounselor } from "@/lib/auth";
import { formatJalali, parseISODate, parseTime, startOfWeekSaturday, todayISO } from "@/lib/dates";
import { logAudit } from "@/lib/audit";
import { notifyStudentUser } from "@/lib/notifications";
import { normalizePhone } from "@/lib/password";
import { aiPlanningConfigured, generateAiPlan } from "@/lib/ai-plan";
import { parseChapters } from "@/lib/resources";
import { generatePlan } from "@/lib/planner";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function numberField(form: FormData, name: string): number {
  return Number(field(form, name));
}

function studentPath(studentId: string, suffix = ""): string {
  return `/counselor/students/${studentId}${suffix}`;
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function assertStudent(workspaceId: string, studentId: string) {
  const db = await getDb();
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.workspaceId, workspaceId), eq(students.id, studentId)))
    .limit(1);
  if (!student) fail("/counselor", "دانش‌آموز پیدا نشد.");
  return student;
}

export async function createStudentAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const name = field(formData, "name");
  const phone = normalizePhone(field(formData, "phone"));
  const grade = field(formData, "grade") || "دوازدهم";
  const studentField = field(formData, "field") || "تجربی";
  const track = field(formData, "track") || "both";
  const guardianPhone = field(formData, "guardianPhone") || null;

  if (name.length < 2) fail("/counselor", "نام دانش‌آموز را کامل وارد کنید.");
  if (!/^09\d{9}$/.test(phone)) fail("/counselor", "شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.");

  const db = await getDb();
  const inviteCode = randomUUID().replace(/-/g, "").slice(0, 12);

  const [student] = await db
    .insert(students)
    .values({
      workspaceId: counselor.workspaceId,
      counselorId: counselor.id,
      name,
      phone,
      grade,
      field: studentField,
      track: track as "konkur" | "final" | "both",
      guardianPhone,
      inviteCode,
    })
    .onConflictDoNothing()
    .returning();

  if (!student) fail("/counselor", "این شماره برای دانش‌آموز دیگری در دفتر ثبت شده است.");

  await db
    .insert(studentConstraints)
    .values({ studentId: student.id })
    .onConflictDoNothing();

  revalidatePath("/counselor");
  redirect(studentPath(student.id, "?success=created"));
}

export async function updateStudentAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);

  const name = field(formData, "name");
  const grade = field(formData, "grade");
  const studentField = field(formData, "field");
  const track = field(formData, "track");
  const guardianPhone = field(formData, "guardianPhone") || null;

  if (name.length < 2) fail(studentPath(studentId), "نام را کامل وارد کنید.");

  const db = await getDb();
  await db
    .update(students)
    .set({
      name,
      grade: grade || "دوازدهم",
      field: studentField || "تجربی",
      track: (track || "both") as "konkur" | "final" | "both",
      guardianPhone,
    })
    .where(and(eq(students.id, studentId), eq(students.workspaceId, counselor.workspaceId)));

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=profile"));
}

export async function archiveStudentAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);

  const db = await getDb();
  await db
    .update(students)
    .set({ status: "archived" })
    .where(and(eq(students.id, studentId), eq(students.workspaceId, counselor.workspaceId)));

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "student.archive",
    entity: "student",
    entityId: studentId,
  });

  redirect("/counselor?success=archived");
}

export async function addExamTargetAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);

  const title = field(formData, "title");
  const examType = field(formData, "examType") || "konkur";
  const examDate = field(formData, "examDate");
  const weight = Math.max(1, Math.min(5, numberField(formData, "weight") || 3));

  if (!title || !parseISODate(examDate)) fail(studentPath(studentId), "عنوان و تاریخ امتحان لازم است.");

  const db = await getDb();
  await db.insert(examTargets).values({
    studentId,
    title,
    examType: examType as "final" | "konkur" | "mock",
    examDate,
    weight,
  });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=target"));
}

export async function deleteExamTargetAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);
  const targetId = field(formData, "targetId");

  const db = await getDb();
  await db
    .delete(examTargets)
    .where(and(eq(examTargets.id, targetId), eq(examTargets.studentId, studentId)));

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=target-deleted"));
}

export async function addResourceAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);

  const subjectId = field(formData, "subjectId");
  const title = field(formData, "title");
  const unitType = field(formData, "unitType") || "page";
  const totalUnits = Math.max(0, numberField(formData, "totalUnits"));
  const completedUnits = Math.max(0, numberField(formData, "completedUnits"));
  const priority = Math.max(1, Math.min(5, numberField(formData, "priority") || 3));
  const parsedChapters = parseChapters(field(formData, "chapters"), totalUnits);

  if (!subjectId || !title) fail(studentPath(studentId), "درس و عنوان منبع لازم است.");
  if (completedUnits > totalUnits) fail(studentPath(studentId), "پیشرفت نمی‌تواند بیشتر از کل باشد.");
  if (parsedChapters.error) fail(studentPath(studentId), parsedChapters.error);

  const db = await getDb();
  await db.insert(resources).values({
    workspaceId: counselor.workspaceId,
    studentId,
    subjectId,
    title,
    unitType: unitType as "test" | "page" | "chapter",
    totalUnits,
    completedUnits,
    chaptersJson: parsedChapters.chapters,
    priority,
  });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=resource"));
}

export async function updateResourceAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);

  const resourceId = field(formData, "resourceId");
  const completedUnits = Math.max(0, numberField(formData, "completedUnits"));
  const totalUnits = Math.max(0, numberField(formData, "totalUnits"));
  const priority = Math.max(1, Math.min(5, numberField(formData, "priority") || 3));
  const parsedChapters = parseChapters(field(formData, "chapters"), totalUnits);

  if (completedUnits > totalUnits) fail(studentPath(studentId), "پیشرفت نمی‌تواند بیشتر از کل باشد.");
  if (parsedChapters.error) fail(studentPath(studentId), parsedChapters.error);

  const db = await getDb();
  await db
    .update(resources)
    .set({
      completedUnits,
      totalUnits,
      priority,
      chaptersJson: parsedChapters.chapters,
    })
    .where(
      and(
        eq(resources.id, resourceId),
        eq(resources.studentId, studentId),
        eq(resources.workspaceId, counselor.workspaceId),
      ),
    );

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=resource-updated"));
}

export async function deleteResourceAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);
  const resourceId = field(formData, "resourceId");

  const db = await getDb();
  await db
    .delete(resources)
    .where(
      and(
        eq(resources.id, resourceId),
        eq(resources.studentId, studentId),
        eq(resources.workspaceId, counselor.workspaceId),
      ),
    );

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=resource-deleted"));
}

export async function addAvailabilityAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);

  const weekday = numberField(formData, "weekday");
  const start = parseTime(field(formData, "start"));
  const end = parseTime(field(formData, "end"));

  if (weekday < 0 || weekday > 6) fail(studentPath(studentId), "روز هفته نامعتبر است.");
  if (start === null || end === null) fail(studentPath(studentId), "ساعت شروع/پایان نامعتبر است.");
  if (end <= start) fail(studentPath(studentId), "ساعت پایان باید بعد از شروع باشد.");

  const db = await getDb();
  await db.insert(availability).values({ studentId, weekday, startMin: start, endMin: end });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=availability"));
}

export async function deleteAvailabilityAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);
  const availabilityId = field(formData, "availabilityId");

  const db = await getDb();
  await db
    .delete(availability)
    .where(and(eq(availability.id, availabilityId), eq(availability.studentId, studentId)));

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=availability-deleted"));
}

export async function saveConstraintsAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);

  const maxDailyMinutes = Math.max(30, Math.min(720, numberField(formData, "maxDailyMinutes") || 240));
  const restWeekday = Math.max(0, Math.min(6, numberField(formData, "restWeekday")));
  const bufferPct = Math.max(0, Math.min(50, numberField(formData, "bufferPct") || 15));

  const db = await getDb();
  await db
    .insert(studentConstraints)
    .values({ studentId, maxDailyMinutes, restWeekday, bufferPct })
    .onConflictDoUpdate({
      target: studentConstraints.studentId,
      set: { maxDailyMinutes, restWeekday, bufferPct },
    });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=constraints"));
}

export async function generatePlanAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);

  const requestedWeek = field(formData, "weekStart") || todayISO();
  const weekStart = startOfWeekSaturday(requestedWeek);

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.studentId, studentId), eq(plans.weekStart, weekStart)))
    .limit(1);

  const regenerate = field(formData, "regenerate") === "1";
  if (existing && existing.status !== "draft" && !regenerate) {
    fail(
      studentPath(studentId, `?week=${weekStart}`),
      "برنامه این هفته تأیید شده است. برای بازتولید، دکمه بازتولید را بزنید.",
    );
  }

  const [resourceRows, targetRows, availabilityRows, constraintRows, subjectRows] =
    await Promise.all([
      db
        .select({
          id: resources.id,
          subjectId: resources.subjectId,
          subjectTitle: subjects.title,
          title: resources.title,
          unitType: resources.unitType,
          totalUnits: resources.totalUnits,
          completedUnits: resources.completedUnits,
          chaptersJson: resources.chaptersJson,
          priority: resources.priority,
        })
        .from(resources)
        .innerJoin(subjects, eq(resources.subjectId, subjects.id))
        .where(and(eq(resources.workspaceId, counselor.workspaceId), eq(resources.studentId, studentId))),
      db.select().from(examTargets).where(eq(examTargets.studentId, studentId)),
      db.select().from(availability).where(eq(availability.studentId, studentId)),
      db
        .select()
        .from(studentConstraints)
        .where(eq(studentConstraints.studentId, studentId))
        .limit(1),
      db.select().from(subjects).where(eq(subjects.workspaceId, counselor.workspaceId)),
    ]);

  if (resourceRows.length === 0) {
    fail(studentPath(studentId, `?week=${weekStart}`), "اول حداقل یک منبع برای دانش‌آموز ثبت کنید.");
  }
  if (availabilityRows.length === 0) {
    fail(studentPath(studentId, `?week=${weekStart}`), "اول زمان‌های آزاد هفتگی را ثبت کنید.");
  }

  const constraints = constraintRows[0] ?? {
    studentId,
    maxDailyMinutes: 240,
    restWeekday: 6,
    bufferPct: 15,
  };

  const plannerInput = {
    weekStart,
    availability: availabilityRows.map((row) => ({
      weekday: row.weekday,
      startMin: row.startMin,
      endMin: row.endMin,
    })),
    constraints: {
      maxDailyMinutes: constraints.maxDailyMinutes,
      restWeekday: constraints.restWeekday,
      bufferPct: constraints.bufferPct,
    },
    resources: resourceRows.map((row) => ({
      id: row.id,
      subjectId: row.subjectId,
      subjectTitle: row.subjectTitle,
      title: row.title,
      unitType: row.unitType as "test" | "page" | "chapter",
      totalUnits: row.totalUnits,
      completedUnits: row.completedUnits,
      priority: row.priority,
      chapters: row.chaptersJson,
    })),
    examTargets: targetRows.map((row) => ({
      title: row.title,
      examDate: row.examDate,
      weight: row.weight,
    })),
  };

  let generated = generatePlan(plannerInput);
  let aiRunId: string | null = null;

  if (field(formData, "useAi") === "1" && aiPlanningConfigured()) {
    const aiResult = await generateAiPlan({
      workspaceId: counselor.workspaceId,
      studentId,
      planner: plannerInput,
    });
    aiRunId = aiResult.runId;

    if (aiResult.ok) {
      generated = aiResult.plan;
      generated.warnings = ["برنامه پیشنهادی AI پس از اعتبارسنجی اعمال شد.", ...generated.warnings];
    } else {
      generated.warnings = [
        `خروجی AI اعمال نشد (${aiResult.source})؛ برنامه قطعی ساخته شد.`,
        ...generated.warnings,
      ];
    }
  }

  if (generated.tasks.length === 0) {
    fail(
      studentPath(studentId, `?week=${weekStart}`),
      generated.warnings[0] ?? "با داده‌های فعلی برنامه‌ای ساخته نشد.",
    );
  }

  const subjectIds = new Set(subjectRows.map((subject) => subject.id));

  let savedPlanId = existing?.id;

  await db.transaction(async (tx) => {
    let planId = existing?.id;
    if (existing) {
      await tx.delete(tasks).where(eq(tasks.planId, existing.id));
      await tx
        .update(plans)
        .set({
          status: "draft",
          version: existing.version + 1,
          approvedAt: null,
          warningsJson: generated.warnings,
          aiRunId,
        })
        .where(eq(plans.id, existing.id));
    } else {
      const [created] = await tx
        .insert(plans)
        .values({
          studentId,
          weekStart,
          status: "draft",
          warningsJson: generated.warnings,
          aiRunId,
        })
        .returning();
      planId = created.id;
    }

    if (!planId) throw new Error("plan id missing");
    savedPlanId = planId;

    await tx.insert(tasks).values(
      generated.tasks
        .filter((task) => subjectIds.has(task.subjectId))
        .map((task) => ({
          planId: planId!,
          planDate: task.planDate,
          plannedStart: task.plannedStart,
          plannedEnd: task.plannedEnd,
          subjectId: task.subjectId,
          resourceId: task.resourceId,
          topic: task.topic,
          type: task.type,
          targetUnits: task.targetUnits,
          estMinutes: task.estMinutes,
        })),
    );
  });

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "plan.generate",
    entity: "plan",
    entityId: savedPlanId,
    diff: {
      weekStart,
      tasks: generated.tasks.length,
      warnings: generated.warnings,
      aiRunId,
    },
  });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, `?week=${weekStart}&success=generated`));
}

export async function approvePlanAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);
  const planId = field(formData, "planId");

  const db = await getDb();
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.studentId, studentId)))
    .limit(1);

  if (!plan) fail(studentPath(studentId), "برنامه پیدا نشد.");

  const planTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.planId, planId));
  if (planTasks.length === 0) {
    fail(studentPath(studentId, `?week=${plan.weekStart}`), "برنامه خالی است و قابل تأیید نیست.");
  }

  await db
    .update(plans)
    .set({ status: "approved", approvedAt: new Date() })
    .where(eq(plans.id, planId));

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "plan.approve",
    entity: "plan",
    entityId: planId,
    diff: { weekStart: plan.weekStart, version: plan.version },
  });

  await notifyStudentUser(studentId, "plan_approved", {
    title: "برنامه هفته تأیید شد",
    body: `برنامه ${formatJalali(plan.weekStart)} آماده اجراست.`,
    weekStart: plan.weekStart,
    planId,
  });

  revalidatePath(studentPath(studentId));
  revalidatePath("/student");
  redirect(studentPath(studentId, `?week=${plan.weekStart}&success=approved`));
}

export async function reopenPlanAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);
  const planId = field(formData, "planId");

  const db = await getDb();
  await db.update(plans).set({ status: "draft", approvedAt: null }).where(eq(plans.id, planId));

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "plan.reopen",
    entity: "plan",
    entityId: planId,
  });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, "?success=reopened"));
}

export async function updateTaskAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);
  const taskId = field(formData, "taskId");

  const start = parseTime(field(formData, "start"));
  const end = parseTime(field(formData, "end"));
  const topic = field(formData, "topic");
  const note = field(formData, "note");

  if (start === null || end === null || end <= start) {
    fail(studentPath(studentId), "بازه زمانی تسک نامعتبر است.");
  }

  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) fail(studentPath(studentId), "تسک پیدا نشد.");

  const [plan] = await db.select().from(plans).where(eq(plans.id, task.planId)).limit(1);
  if (!plan || plan.studentId !== studentId) fail(studentPath(studentId), "تسک پیدا نشد.");

  await db
    .update(tasks)
    .set({ plannedStart: start, plannedEnd: end, estMinutes: end - start, topic, note })
    .where(eq(tasks.id, taskId));

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "plan.task.update",
    entity: "task",
    entityId: taskId,
    diff: { plannedStart: start, plannedEnd: end, topic, note },
  });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, `?week=${plan.weekStart}&success=task-updated`));
}

export async function addTaskAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);
  const planId = field(formData, "planId");
  const subjectId = field(formData, "subjectId");
  const resourceId = field(formData, "resourceId") || null;
  const planDate = field(formData, "planDate");
  const start = parseTime(field(formData, "start"));
  const end = parseTime(field(formData, "end"));
  const topic = field(formData, "topic");
  const type = field(formData, "type") || "study";
  const targetUnits = Math.max(0, numberField(formData, "targetUnits"));

  if (!subjectId || !parseISODate(planDate)) fail(studentPath(studentId), "درس و تاریخ لازم است.");
  if (start === null || end === null || end <= start) {
    fail(studentPath(studentId), "بازه زمانی تسک نامعتبر است.");
  }

  const db = await getDb();
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.studentId, studentId)))
    .limit(1);
  if (!plan) fail(studentPath(studentId), "برنامه پیدا نشد.");

  const [createdTask] = await db
    .insert(tasks)
    .values({
      planId,
      planDate,
      plannedStart: start,
      plannedEnd: end,
      subjectId,
      resourceId,
      topic,
      type: type as "study" | "review" | "test",
      targetUnits,
      estMinutes: end - start,
    })
    .returning();

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "plan.task.add",
    entity: "task",
    entityId: createdTask.id,
    diff: { planId, planDate, start, end, topic },
  });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, `?week=${plan.weekStart}&success=task-added`));
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  await assertStudent(counselor.workspaceId, studentId);
  const taskId = field(formData, "taskId");

  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) fail(studentPath(studentId), "تسک پیدا نشد.");

  const [plan] = await db.select().from(plans).where(eq(plans.id, task.planId)).limit(1);
  if (!plan || plan.studentId !== studentId) fail(studentPath(studentId), "تسک پیدا نشد.");

  await db.delete(tasks).where(eq(tasks.id, taskId));

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "plan.task.delete",
    entity: "task",
    entityId: taskId,
    diff: { planId: plan.id, planDate: task.planDate },
  });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, `?week=${plan.weekStart}&success=task-deleted`));
}
