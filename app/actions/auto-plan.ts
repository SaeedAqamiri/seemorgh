"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { planningSettings, plans, studyGoals, tasks } from "@/db/schema";
import { requireCounselor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  buildDeterministicAllocation,
  clampNumber,
  metricScale,
  normalizePolicy,
  scheduleAutoPlan,
  type AutoPlanInput,
  type GoalMetric,
  type PlanningPolicy,
  type StudyGoalInput,
} from "@/lib/auto-plan";
import { aiAutoPlanningConfigured, generateAiAutoAllocation } from "@/lib/ai-auto-plan";
import { getAutoPlanContext } from "@/lib/auto-plan-data";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import { buildGridFromTasks, saveGeneratedPanel } from "@/lib/panel";
import type { PlannerResource } from "@/lib/planner";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function numberField(form: FormData, name: string): number {
  return Number(field(form, name));
}

function studentPath(studentId: string, suffix = ""): string {
  return `/counselor/students/${studentId}/auto-plan${suffix}`;
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

type SavedSetup = {
  studentId: string;
  targetDate: string;
  policy: PlanningPolicy;
  goals: StudyGoalInput[];
};

async function parseAndSaveSetup(formData: FormData): Promise<SavedSetup> {
  const counselor = await requireCounselor();
  const studentId = field(formData, "studentId");
  if (!studentId) fail("/counselor", "دانش‌آموز مشخص نیست.");

  const context = await getAutoPlanContext(counselor.workspaceId, studentId);
  if (!context) fail("/counselor", "دانش‌آموز پیدا نشد.");

  const targetDateRaw = field(formData, "targetDate");
  const targetDate = isISODate(targetDateRaw)
    ? targetDateRaw
    : addDays(todayISO(), 90);
  if (targetDate < todayISO()) {
    fail(studentPath(studentId), "تاریخ هدف نباید قبل از امروز باشد.");
  }

  const policy = normalizePolicy({
    strategy: field(formData, "strategy"),
    minutesPerPercentPoint: numberField(formData, "minutesPerPercentPoint"),
    minutesPerTest: numberField(formData, "minutesPerTest"),
    testRatioPct: numberField(formData, "testRatioPct"),
    reviewRatioPct: numberField(formData, "reviewRatioPct"),
    maxSubjectsPerDay: numberField(formData, "maxSubjectsPerDay"),
    minBlockMinutes: numberField(formData, "minBlockMinutes"),
    maxBlockMinutes: numberField(formData, "maxBlockMinutes"),
    fillCapacity: field(formData, "fillCapacity") === "1",
    notes: field(formData, "notes"),
  });

  const subjectIds = formData.getAll("subjectId").map((value) => String(value));
  const metrics = formData.getAll("metric").map((value) => String(value));
  const currentValues = formData.getAll("currentValue").map((value) => Number(value));
  const targetValues = formData.getAll("targetValue").map((value) => Number(value));
  const weights = formData.getAll("weight").map((value) => Number(value));
  const enabled = new Set(formData.getAll("enabled").map((value) => String(value)));

  const subjectTitles = new Map(
    context.detail.subjects.map((subject) => [subject.id, subject.title]),
  );
  const goals: StudyGoalInput[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < subjectIds.length; index += 1) {
    const subjectId = subjectIds[index];
    if (!enabled.has(subjectId) || seen.has(subjectId)) continue;
    const subjectTitle = subjectTitles.get(subjectId);
    if (!subjectTitle) continue;

    const metric: GoalMetric = metrics[index] === "score" ? "score" : "percent";
    const scale = metricScale(metric);
    const currentValue = clampNumber(currentValues[index], 0, scale);
    const targetValue = clampNumber(targetValues[index], 0, scale);
    const weight = Math.round(clampNumber(weights[index] || 3, 1, 5));

    if (!Number.isFinite(currentValue) || !Number.isFinite(targetValue)) continue;

    goals.push({ subjectId, subjectTitle, metric, currentValue, targetValue, weight });
    seen.add(subjectId);
  }

  if (goals.length === 0) {
    fail(studentPath(studentId), "حداقل یک هدف درسی را فعال کنید.");
  }

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(studyGoals).where(eq(studyGoals.studentId, studentId));
    await tx.insert(studyGoals).values(
      goals.map((goal) => ({
        studentId,
        subjectId: goal.subjectId,
        metric: goal.metric,
        currentValue: goal.currentValue,
        targetValue: goal.targetValue,
        weight: goal.weight,
      })),
    );
    await tx
      .insert(planningSettings)
      .values({
        studentId,
        targetDate,
        policyJson: policy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: planningSettings.studentId,
        set: { targetDate, policyJson: policy, updatedAt: new Date() },
      });
  });

  return { studentId, targetDate, policy, goals };
}

function plannerInputFor(
  context: NonNullable<Awaited<ReturnType<typeof getAutoPlanContext>>>,
  setup: SavedSetup,
): AutoPlanInput {
  const resources: PlannerResource[] = context.detail.resources.map((resource) => ({
    id: resource.id,
    subjectId: resource.subjectId,
    subjectTitle: resource.subjectTitle,
    title: resource.title,
    unitType: resource.unitType,
    totalUnits: resource.totalUnits,
    completedUnits: resource.completedUnits,
    priority: resource.priority,
    chapters: resource.chaptersJson,
  }));

  return {
    startDate: todayISO(),
    targetDate: setup.targetDate,
    availability: context.detail.availability.map((slot) => ({
      weekday: slot.weekday,
      startMin: slot.startMin,
      endMin: slot.endMin,
    })),
    constraints: {
      maxDailyMinutes: context.detail.constraints.maxDailyMinutes,
      restWeekday: context.detail.constraints.restWeekday,
      bufferPct: context.detail.constraints.bufferPct,
    },
    goals: setup.goals,
    resources,
    policy: setup.policy,
  };
}

async function resolveSetup(formData: FormData) {
  const counselor = await requireCounselor();
  const setup = await parseAndSaveSetup(formData);
  const context = await getAutoPlanContext(counselor.workspaceId, setup.studentId);
  if (!context) fail("/counselor", "دانش‌آموز پیدا نشد.");
  return { counselor, setup, context };
}

export async function savePlanningSetupAction(formData: FormData): Promise<void> {
  const { counselor, setup } = await resolveSetup(formData);

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "auto_plan.settings.save",
    entity: "student",
    entityId: setup.studentId,
    diff: { targetDate: setup.targetDate, goals: setup.goals.length },
  });

  revalidatePath(studentPath(setup.studentId));
  redirect(studentPath(setup.studentId, "?success=saved"));
}

export async function generateAutoPlanAction(formData: FormData): Promise<void> {
  const { counselor, setup, context } = await resolveSetup(formData);

  if (context.detail.availability.length === 0) {
    fail(studentPath(setup.studentId), "اول زمان‌های آزاد هفتگی دانش‌آموز را ثبت کنید.");
  }
  if (context.detail.resources.length === 0) {
    fail(studentPath(setup.studentId), "اول حداقل یک منبع برای دانش‌آموز ثبت کنید.");
  }

  const plannerInput = plannerInputFor(context, setup);
  const warnings: string[] = [];
  let allocation = buildDeterministicAllocation(plannerInput);
  let aiRunId: string | null = null;
  let source: "deterministic" | "ai" = "deterministic";

  if (field(formData, "useAi") === "1" && aiAutoPlanningConfigured()) {
    const aiResult = await generateAiAutoAllocation({
      workspaceId: counselor.workspaceId,
      studentId: setup.studentId,
      planner: plannerInput,
    });
    aiRunId = aiResult.runId;
    if (aiResult.ok) {
      allocation = aiResult.allocation;
      source = "ai";
      warnings.push("تخصیص زمانی پیشنهادی AI پس از اعتبارسنجی اعمال شد.");
    } else {
      allocation = aiResult.fallback;
      warnings.push(
        `خروجی AI اعمال نشد (${aiResult.source})${
          aiResult.errors.length ? `: ${aiResult.errors.slice(0, 3).join(" | ")}` : ""
        }؛ برنامه قطعی ساخته شد.`,
      );
    }
  }

  const generated = scheduleAutoPlan(plannerInput, allocation);
  const allWarnings = [...new Set([...warnings, ...generated.warnings])];

  if (generated.weeks.length === 0) {
    fail(
      studentPath(setup.studentId),
      allWarnings[0] ?? "با داده‌های فعلی برنامه‌ای ساخته نشد.",
    );
  }

  const overwrite = field(formData, "overwrite") === "1";
  const db = await getDb();
  let created = 0;
  let skipped = 0;
  const skippedWeeks: string[] = [];

  for (const week of generated.weeks) {
    const [existing] = await db
      .select()
      .from(plans)
      .where(
        and(eq(plans.studentId, setup.studentId), eq(plans.weekStart, week.weekStart)),
      )
      .limit(1);

    if (existing && existing.status !== "draft" && !overwrite) {
      skipped += 1;
      skippedWeeks.push(week.weekStart);
      continue;
    }

    const weekWarnings = [...new Set([...allWarnings, ...week.warnings])].slice(0, 12);

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
            warningsJson: weekWarnings,
            aiRunId,
          })
          .where(eq(plans.id, existing.id));
      } else {
        const [createdPlan] = await tx
          .insert(plans)
          .values({
            studentId: setup.studentId,
            weekStart: week.weekStart,
            status: "draft",
            warningsJson: weekWarnings,
            aiRunId,
          })
          .returning();
        planId = createdPlan.id;
      }

      if (!planId) throw new Error("plan id missing");

      if (week.tasks.length > 0) {
        await tx.insert(tasks).values(
          week.tasks.map((task) => ({
            planId: planId!,
            planDate: task.planDate,
            plannedStart: task.plannedStart,
            plannedEnd: task.plannedEnd,
            subjectId: task.subjectId,
            resourceId: task.resourceId || null,
            chapterId: task.chapterId,
            resourceText: task.resourceText,
            topic: task.topic,
            type: task.type,
            actionKind: task.actionKind,
            routineMode: task.routineMode,
            targetUnits: task.targetUnits,
            estMinutes: task.estMinutes,
          })),
        );
      }
    });

    await saveGeneratedPanel({
      studentId: setup.studentId,
      weekStart: week.weekStart,
      grid: buildGridFromTasks(
        week.weekStart,
        week.tasks.map((task) => ({
          planDate: task.planDate,
          plannedStart: task.plannedStart,
          subjectId: task.subjectId,
          resourceId: task.resourceId || null,
          chapterId: task.chapterId,
          resourceText: task.resourceText,
          type: task.type,
          actionKind: task.actionKind,
          routineMode: task.routineMode,
          targetUnits: task.targetUnits,
        })),
      ),
      dailyRoutine: week.dailyRoutine,
      nextWeekHomework: week.nextWeekHomework,
      actorId: counselor.id,
    });

    created += 1;
  }

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "auto_plan.generate",
    entity: "student",
    entityId: setup.studentId,
    diff: {
      targetDate: setup.targetDate,
      weeks: created,
      skipped,
      source,
      aiRunId,
      warnings: allWarnings,
    },
  });

  revalidatePath(studentPath(setup.studentId));
  revalidatePath(`/counselor/students/${setup.studentId}`);
  revalidatePath(`/counselor/students/${setup.studentId}/panel`);
  revalidatePath("/student");
  revalidatePath("/student/panel");
  revalidatePath("/student/report");

  const suffix = `?success=generated&weeks=${created}&source=${source}${
    skipped ? `&skipped=${skipped}` : ""
  }`;
  redirect(studentPath(setup.studentId, suffix));
}
