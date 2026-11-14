import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dailyLogs, examTargets, plans, resourceChapters, resources, subjects, tasks } from "@/db/schema";
import { startOfWeekSaturday, todayISO, weekDates } from "./dates";
import { contentForResources, type ContentItemView } from "./content";

export type StudentTaskItem = {
  id: string;
  planDate: string;
  plannedStart: number;
  plannedEnd: number;
  subjectTitle: string;
  subjectColor: string;
  resourceId: string | null;
  resourceTitle: string | null;
  resourceUnitType: "test" | "page" | "chapter" | null;
  topic: string;
  type: "study" | "review" | "test" | "timed_test" | "exercise";
  actionKind: string;
  routineMode: "study" | "test" | null;
  chapterId: string | null;
  chapterTitle: string | null;
  resourceText: string;
  targetUnits: number;
  estMinutes: number;
  status: "pending" | "done" | "skipped";
  actualStartedAt: Date | null;
  actualEndedAt: Date | null;
  actualUnits: number;
  note: string;
};

export type StudentWeekData = {
  planId: string | null;
  planStatus: string | null;
  tasks: StudentTaskItem[];
};

async function taskItemsForPlan(planId: string): Promise<StudentTaskItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      task: tasks,
      subjectTitle: subjects.title,
      subjectColor: subjects.color,
      resourceTitle: resources.title,
      resourceUnitType: resources.unitType,
      chapterTitle: resourceChapters.title,
    })
    .from(tasks)
    .innerJoin(subjects, eq(tasks.subjectId, subjects.id))
    .leftJoin(resources, eq(tasks.resourceId, resources.id))
    .leftJoin(resourceChapters, eq(tasks.chapterId, resourceChapters.id))
    .where(eq(tasks.planId, planId))
    .orderBy(asc(tasks.planDate), asc(tasks.plannedStart));

  return rows.map((row) => ({
    id: row.task.id,
    planDate: row.task.planDate,
    plannedStart: row.task.plannedStart,
    plannedEnd: row.task.plannedEnd,
    subjectTitle: row.subjectTitle,
    subjectColor: row.subjectColor,
    resourceId: row.task.resourceId,
    resourceTitle: row.resourceTitle,
    resourceUnitType: row.resourceUnitType,
    topic: row.task.topic,
    type: row.task.type,
    actionKind: row.task.actionKind,
    routineMode: row.task.routineMode,
    chapterId: row.task.chapterId,
    chapterTitle: row.chapterTitle,
    resourceText: row.task.resourceText,
    targetUnits: row.task.targetUnits,
    estMinutes: row.task.estMinutes,
    status: row.task.status,
    actualStartedAt: row.task.actualStartedAt,
    actualEndedAt: row.task.actualEndedAt,
    actualUnits: row.task.actualUnits,
    note: row.task.note,
  }));
}

export async function getStudentTodayData(studentId: string) {
  const db = await getDb();
  const today = todayISO();
  const weekStart = startOfWeekSaturday(today);

  const [plan] = await db
    .select()
    .from(plans)
    .where(
      and(
        eq(plans.studentId, studentId),
        eq(plans.weekStart, weekStart),
        inArray(plans.status, ["approved", "active"]),
      ),
    )
    .limit(1);

  const examsToday = await db
    .select({ title: examTargets.title, examType: examTargets.examType, examDate: examTargets.examDate })
    .from(examTargets)
    .where(and(eq(examTargets.studentId, studentId), eq(examTargets.examDate, today)));

  if (!plan) {
    return {
      today,
      weekStart,
      plan: null,
      tasks: [] as StudentTaskItem[],
      weekTasks: [] as StudentTaskItem[],
      content: [] as ContentItemView[],
      log: null,
      examsToday,
    };
  }

  const all = await taskItemsForPlan(plan.id);
  const [log] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.studentId, studentId), eq(dailyLogs.logDate, today)))
    .limit(1);

  const resourceIds = [...new Set(all.map((task) => task.resourceId).filter((id): id is string => Boolean(id)))];

  return {
    today,
    weekStart,
    plan,
    tasks: all.filter((task) => task.planDate === today),
    weekTasks: all,
    content: await contentForResources(resourceIds),
    log: log ?? null,
    examsToday,
  };
}

export async function getStudentWeekData(
  studentId: string,
  weekStart: string,
): Promise<StudentWeekData> {
  const db = await getDb();
  const [plan] = await db
    .select()
    .from(plans)
    .where(
      and(
        eq(plans.studentId, studentId),
        eq(plans.weekStart, weekStart),
        inArray(plans.status, ["approved", "active"]),
      ),
    )
    .limit(1);

  if (!plan) return { planId: null, planStatus: null, tasks: [] };
  return { planId: plan.id, planStatus: plan.status, tasks: await taskItemsForPlan(plan.id) };
}

export function summarizeWeek(tasks: StudentTaskItem[], weekStart: string) {
  const dates = weekDates(weekStart);
  return dates.map((date) => {
    const dayTasks = tasks.filter((task) => task.planDate === date);
    return {
      date,
      total: dayTasks.length,
      done: dayTasks.filter((task) => task.status === "done").length,
      minutes: dayTasks
        .filter((task) => task.status === "done")
        .reduce((sum, task) => sum + task.estMinutes, 0),
    };
  });
}
