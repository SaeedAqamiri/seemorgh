import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  externalExams,
  groupMockExams,
  mockExamPrograms,
  planningSettings,
  plans,
  resources,
  schoolLessons,
  studentGroups,
  studentMockExams,
  students,
  studyGoals,
  subjects,
  tasks,
  type ExamSubjectScore,
  type MockExamBudgetItem,
} from "../src/db/schema";
import {
  buildDeterministicAllocation,
  scheduleAutoPlan,
} from "../src/lib/auto-plan";
import { examAnchorFor, getAutoPlanContext } from "../src/lib/auto-plan-data";
import { addDays, startOfWeekSaturday, todayISO } from "../src/lib/dates";
import { ensureMockExamCatalog, ensureGroupMockExamPlan, studentMockExamPrograms } from "../src/lib/mock-exams";
import { buildGridFromTasks, saveGeneratedPanel } from "../src/lib/panel";
import { saveSchoolLessons } from "../src/lib/school-schedule";
import { getBellSlots } from "../src/lib/schedule";
import { ensureSubjectCatalog } from "../src/lib/subject-catalog";

type Level = "weak" | "normal" | "strong";

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFor(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function levelFromProgress(percent: number): Level {
  if (percent < 35) return "weak";
  if (percent > 70) return "strong";
  return "normal";
}

function overallPercent(subjects: ExamSubjectScore[]): number {
  if (subjects.length === 0) return 0;
  const total = subjects.reduce((sum, subject) => sum + subject.percent, 0);
  return Math.round(total / subjects.length);
}

async function seedSchoolLessons(studentId: string, field: string, subjectTitleById: Map<string, string>) {
  const db = await getDb();
  const existing = await db
    .select({ id: schoolLessons.id })
    .from(schoolLessons)
    .where(eq(schoolLessons.studentId, studentId))
    .limit(1);
  if (existing.length > 0) return;
  const slots = await getBellSlots(studentId);
  const titles = field === "ریاضی"
    ? ["حسابان", "هندسه", "فیزیک", "شیمی", "ادبیات فارسی", "عربی", "دین و زندگی", "زبان انگلیسی"]
    : field === "انسانی"
      ? ["ریاضی و آمار", "علوم و فنون ادبی", "تاریخ", "جغرافیا", "جامعه‌شناسی", "عربی", "دین و زندگی", "زبان انگلیسی"]
      : ["زیست‌شناسی", "شیمی", "فیزیک", "ریاضی", "ادبیات فارسی", "عربی", "دین و زندگی", "زبان انگلیسی"];
  const ids = titles
    .map((title) => [...subjectTitleById.entries()].find(([, value]) => value === title)?.[0])
    .filter((value): value is string => Boolean(value));
  const random = randomFor(`${studentId}:school`);
  const lessons: { weekday: number; slotIndex: number; subjectId: string }[] = [];
  for (let weekday = 0; weekday <= 4; weekday += 1) {
    const periodCount = 4 + Math.floor(random() * 3);
    for (let slotIndex = 0; slotIndex < periodCount && slotIndex < slots.length; slotIndex += 1) {
      lessons.push({
        weekday,
        slotIndex,
        subjectId: ids[Math.floor(random() * ids.length)],
      });
    }
  }
  if (lessons.length > 0) await saveSchoolLessons(studentId, lessons);
}

async function seedReportCards(
  studentId: string,
  field: string,
  level: Level,
  subjectTitleById: Map<string, string>,
  pastPrograms: { id: string; title: string; provider: string; examDate: string; budgetJson: MockExamBudgetItem[] | null }[],
) {
  const db = await getDb();
  const random = randomFor(`${studentId}:reports`);
  const picked = pastPrograms.slice(-3);
  for (const program of picked) {
    const base = level === "strong" ? 68 + random() * 22 : level === "weak" ? 28 + random() * 22 : 48 + random() * 22;
    const items: ExamSubjectScore[] = (program.budgetJson ?? []).map((item) => {
      const subjectId = [...subjectTitleById.entries()].find(([, title]) => title === item.subjectTitle)?.[0] ?? null;
      const percent = Math.max(5, Math.min(98, Math.round(base + (random() - 0.5) * 26)));
      return {
        subjectId,
        subjectTitle: item.subjectTitle,
        percent,
        correct: Math.round(percent / 3),
        wrong: Math.round((100 - percent) / 5),
        blank: 20,
        total: 40,
      };
    });
    const [inserted] = await db
      .insert(externalExams)
      .values({
        workspaceId: (await db.select({ workspaceId: students.workspaceId }).from(students).where(eq(students.id, studentId)).limit(1))[0]!.workspaceId,
        studentId,
        title: program.title,
        examDate: program.examDate,
        examType: "mock",
        provider: program.provider,
        subjectsJson: items,
        overallPercent: overallPercent(items),
        mockExamId: program.id,
        note: "کارنامه نمونه تولیدشده برای آزمون آزمایشی",
      })
      .onConflictDoNothing()
      .returning({ id: externalExams.id });
    if (inserted) {
      await db
        .update(studentMockExams)
        .set({ status: "taken", resultExamId: inserted.id })
        .where(and(eq(studentMockExams.studentId, studentId), eq(studentMockExams.mockExamId, program.id)));
    }
  }
}

async function persistPlan(studentId: string, input: Awaited<ReturnType<typeof getAutoPlanContext>>, actorId: string) {
  if (!input) return { weeks: 0 };
  const plannerInput = {
    startDate: todayISO(),
    targetDate: input.targetDate ?? addDays(todayISO(), 60),
    availability: input.detail.availability.map((slot) => ({ weekday: slot.weekday, startMin: slot.startMin, endMin: slot.endMin })),
    constraints: {
      maxDailyMinutes: input.detail.constraints.maxDailyMinutes,
      restWeekday: input.detail.constraints.restWeekday,
      bufferPct: input.detail.constraints.bufferPct,
    },
    goals: input.goals,
    resources: input.detail.resources.map((resource) => ({
      id: resource.id,
      subjectId: resource.subjectId,
      subjectTitle: resource.subjectTitle,
      title: resource.title,
      unitType: resource.unitType,
      totalUnits: resource.totalUnits,
      completedUnits: resource.completedUnits,
      priority: resource.priority,
      chapters: resource.chaptersJson,
    })),
    policy: input.policy,
    schoolPeriods: input.schoolPeriods,
    exams: input.mockExams.map((program) => examAnchorFor(program, input.analysisMinutesPerExam)),
    level: input.level,
    subjectSpeeds: input.subjectSpeeds,
    goalExamId: input.goalExamId,
    systemSubjectId: input.systemSubjectId,
  };
  const generated = scheduleAutoPlan(plannerInput, buildDeterministicAllocation(plannerInput));
  if (generated.weeks.length === 0) return { weeks: 0 };
  const db = await getDb();
  const todayWeek = startOfWeekSaturday(todayISO());
  for (const week of generated.weeks) {
    if (week.weekStart < todayWeek) continue;
    const [existing] = await db
      .select()
      .from(plans)
      .where(and(eq(plans.studentId, studentId), eq(plans.weekStart, week.weekStart)))
      .limit(1);
    await db.transaction(async (tx) => {
      let planId = existing?.id;
      if (existing) {
        await tx.delete(tasks).where(eq(tasks.planId, existing.id));
        await tx
          .update(plans)
          .set({ status: "draft", version: existing.version + 1, approvedAt: null, warningsJson: week.warnings.slice(0, 12), aiRunId: null })
          .where(eq(plans.id, existing.id));
      } else {
        const [created] = await tx
          .insert(plans)
          .values({ studentId, weekStart: week.weekStart, status: "draft", warningsJson: week.warnings.slice(0, 12) })
          .returning();
        planId = created.id;
      }
      if (!planId) return;
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
            mockExamId: task.mockExamId ?? null,
          })),
        );
      }
    });
    await saveGeneratedPanel({
      studentId,
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
          topic: task.topic,
          type: task.type,
          actionKind: task.actionKind,
          routineMode: task.routineMode,
          targetUnits: task.targetUnits,
          mockExamId: task.mockExamId ?? null,
        })),
      ),
      dailyRoutine: week.dailyRoutine,
      nextWeekHomework: week.nextWeekHomework,
      actorId,
    });
  }
  return { weeks: generated.weeks.length };
}

async function main() {
  const db = await getDb();
  const workspaces = await db.select().from(subjects);
  const workspaceIds = [...new Set(workspaces.map((row) => row.workspaceId))];
  for (const workspaceId of workspaceIds) {
    await ensureSubjectCatalog(workspaceId);
    await ensureMockExamCatalog(workspaceId);
    const groups = await db.select().from(studentGroups).where(eq(studentGroups.workspaceId, workspaceId));
    for (const group of groups) await ensureGroupMockExamPlan(workspaceId, group.id);

    const subjectRows = await db.select().from(subjects).where(eq(subjects.workspaceId, workspaceId));
    const subjectTitleById = new Map(subjectRows.map((row) => [row.id, row.title]));
    const studentRows = await db
      .select()
      .from(students)
      .where(and(eq(students.workspaceId, workspaceId), eq(students.status, "active")));

    for (const student of studentRows) {
      const [counselor] = await db
        .select({ id: students.counselorId })
        .from(students)
        .where(eq(students.id, student.id))
        .limit(1);
      const [progressRow] = await db
        .select({
          total: sql<number>`coalesce(sum(${resources.totalUnits}), 0)::int`,
          completed: sql<number>`coalesce(sum(${resources.completedUnits}), 0)::int`,
        })
        .from(resources)
        .where(eq(resources.studentId, student.id));
      const percent = Number(progressRow?.total ?? 0) > 0
        ? (Number(progressRow?.completed ?? 0) / Number(progressRow?.total ?? 1)) * 100
        : 35;
      const level = levelFromProgress(percent);
      await seedSchoolLessons(student.id, student.field, subjectTitleById);

      const groupPrograms = student.groupId
        ? await db
            .select({ program: mockExamPrograms })
            .from(groupMockExams)
            .innerJoin(mockExamPrograms, eq(groupMockExams.mockExamId, mockExamPrograms.id))
            .where(eq(groupMockExams.groupId, student.groupId))
        : [];
      const allPrograms = await db
        .select()
        .from(mockExamPrograms)
        .where(and(eq(mockExamPrograms.workspaceId, workspaceId), eq(mockExamPrograms.field, student.field)));
      const pastPrograms = [...groupPrograms.map((row) => row.program), ...allPrograms]
        .filter((program) => program.examDate < todayISO())
        .sort((a, b) => a.examDate.localeCompare(b.examDate));
      await seedReportCards(student.id, student.field, level, subjectTitleById, pastPrograms);

      const existingGoals = await db
        .select({ id: studyGoals.id })
        .from(studyGoals)
        .where(eq(studyGoals.studentId, student.id))
        .limit(1);
      if (existingGoals.length === 0) {
        const resourceSubjectRows = await db
          .selectDistinct({ subjectId: resources.subjectId })
          .from(resources)
          .where(eq(resources.studentId, student.id));
        const allowed = new Set(resourceSubjectRows.map((row) => row.subjectId));
        const candidates = subjectRows.filter(
          (row) =>
            row.title !== "آزمون" &&
            (allowed.size === 0 || allowed.has(row.id)) &&
            (row.fieldsJson?.includes(student.field) || row.kind === "general"),
        );
        const base = level === "strong" ? 70 : level === "weak" ? 30 : 52;
        if (candidates.length > 0) {
          await db.insert(studyGoals).values(
            candidates.map((subject, index) => ({
              studentId: student.id,
              subjectId: subject.id,
              metric: "percent" as const,
              currentValue: Math.max(10, Math.min(85, base + ((index * 7) % 15) - 7)),
              targetValue: Math.max(30, Math.min(95, base + 14 + ((index * 5) % 10))),
              weight: subject.kind === "specialized" ? 4 : 3,
            })),
          ).onConflictDoNothing();
        }
      }

      const selected = await studentMockExamPrograms(student.id);
      const goal = [...selected].sort((a, b) => b.examDate.localeCompare(a.examDate))[0];
      if (!goal) continue;
      await db
        .insert(planningSettings)
        .values({
          studentId: student.id,
          targetDate: goal.examDate,
          goalMockExamId: goal.id,
          studentLevel: level,
          analysisMinutesPerExam: 120,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: planningSettings.studentId,
          set: {
            targetDate: goal.examDate,
            goalMockExamId: goal.id,
            studentLevel: level,
            analysisMinutesPerExam: 120,
            updatedAt: new Date(),
          },
        });

      const context = await getAutoPlanContext(workspaceId, student.id);
      if (context && counselor) {
        await persistPlan(student.id, context, counselor.id);
        console.log(`planned ${student.name} → ${goal.title} (${goal.examDate})`);
      }
    }
  }
}

main().then(() => {
  console.log("mock exam calendar, report cards and plans are ready.");
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
