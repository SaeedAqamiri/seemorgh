import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  availability,
  dailyLogs,
  examTargets,
  plans,
  resources,
  studentConstraints,
  students,
  subjects,
  tasks,
} from "@/db/schema";
import { startOfWeekSaturday, todayISO, weekDates } from "./dates";

export type StudentListItem = {
  id: string;
  name: string;
  phone: string;
  grade: string;
  field: string;
  track: string;
  inviteCode: string;
  hasAccount: boolean;
  planStatus: "draft" | "approved" | "active" | "archived" | null;
  planWeekStart: string | null;
  doneTasks: number;
  totalTasks: number;
  todayTasks: number;
  todayDone: number;
  remainingUnits: number;
  totalUnits: number;
  completedUnits: number;
  progressPercent: number;
};

export async function listStudents(
  workspaceId: string,
  counselorId: string,
): Promise<StudentListItem[]> {
  const db = await getDb();
  const weekStart = startOfWeekSaturday(todayISO());
  const today = todayISO();

  const rows = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.workspaceId, workspaceId),
        eq(students.counselorId, counselorId),
        eq(students.status, "active"),
      ),
    )
    .orderBy(asc(students.name));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const planRows = await db
    .select()
    .from(plans)
    .where(and(inArray(plans.studentId, ids), eq(plans.weekStart, weekStart)));

  const planIds = planRows.map((plan) => plan.id);

  const taskStats = planIds.length
    ? await db
        .select({
          planId: tasks.planId,
          total: sql<number>`count(*)::int`,
          done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
        })
        .from(tasks)
        .where(inArray(tasks.planId, planIds))
        .groupBy(tasks.planId)
    : [];

  const todayStats = await db
    .select({
      studentId: plans.studentId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .innerJoin(plans, eq(tasks.planId, plans.id))
    .where(and(inArray(plans.studentId, ids), eq(tasks.planDate, today)))
    .groupBy(plans.studentId);

  const resourceRows = await db
    .select({
      studentId: resources.studentId,
      total: sql<number>`coalesce(sum(${resources.totalUnits}), 0)::int`,
      completed: sql<number>`coalesce(sum(least(${resources.completedUnits}, ${resources.totalUnits})), 0)::int`,
      remaining: sql<number>`coalesce(sum(greatest(${resources.totalUnits} - ${resources.completedUnits}, 0)), 0)::int`,
    })
    .from(resources)
    .where(inArray(resources.studentId, ids))
    .groupBy(resources.studentId);

  const planByStudent = new Map(planRows.map((plan) => [plan.studentId, plan]));
  const taskStatsByPlan = new Map(taskStats.map((row) => [row.planId, row]));
  const todayByStudent = new Map(todayStats.map((row) => [row.studentId, row]));
  const resourceByStudent = new Map(resourceRows.map((row) => [row.studentId, row]));

  return rows.map((student) => {
    const plan = planByStudent.get(student.id);
    const stats = plan ? taskStatsByPlan.get(plan.id) : undefined;
    const todayRow = todayByStudent.get(student.id);
    const resourceRow = resourceByStudent.get(student.id);
    const totalUnits = resourceRow?.total ?? 0;
    const completedUnits = resourceRow?.completed ?? 0;
    return {
      id: student.id,
      name: student.name,
      phone: student.phone,
      grade: student.grade,
      field: student.field,
      track: student.track,
      inviteCode: student.inviteCode,
      hasAccount: Boolean(student.userId),
      planStatus: plan?.status ?? null,
      planWeekStart: plan?.weekStart ?? null,
      doneTasks: stats?.done ?? 0,
      totalTasks: stats?.total ?? 0,
      todayTasks: todayRow?.total ?? 0,
      todayDone: todayRow?.done ?? 0,
      remainingUnits: resourceRow?.remaining ?? 0,
      totalUnits,
      completedUnits,
      progressPercent: totalUnits === 0 ? 0 : Math.round((completedUnits / totalUnits) * 100),
    };
  });
}

export type ResourceWithSubject = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  title: string;
  unitType: "test" | "page" | "chapter";
  totalUnits: number;
  completedUnits: number;
  chaptersJson: { title: string; pages: number; startPage: number; endPage: number }[] | null;
  priority: number;
};

export type StudentDetail = {
  student: typeof students.$inferSelect;
  targets: (typeof examTargets.$inferSelect)[];
  resources: ResourceWithSubject[];
  availability: (typeof availability.$inferSelect)[];
  constraints: typeof studentConstraints.$inferSelect;
  subjects: (typeof subjects.$inferSelect)[];
  plans: (typeof plans.$inferSelect)[];
};

export async function getStudentDetail(
  workspaceId: string,
  studentId: string,
): Promise<StudentDetail | null> {
  const db = await getDb();
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.workspaceId, workspaceId), eq(students.id, studentId)))
    .limit(1);

  if (!student) return null;

  const [targetRows, resourceRows, availabilityRows, constraintRows, subjectRows, planRows] =
    await Promise.all([
      db
        .select()
        .from(examTargets)
        .where(eq(examTargets.studentId, studentId))
        .orderBy(asc(examTargets.examDate)),
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
        .where(and(eq(resources.workspaceId, workspaceId), eq(resources.studentId, studentId)))
        .orderBy(asc(subjects.title), asc(resources.title)),
      db
        .select()
        .from(availability)
        .where(eq(availability.studentId, studentId))
        .orderBy(asc(availability.weekday), asc(availability.startMin)),
      db
        .select()
        .from(studentConstraints)
        .where(eq(studentConstraints.studentId, studentId))
        .limit(1),
      db
        .select()
        .from(subjects)
        .where(eq(subjects.workspaceId, workspaceId))
        .orderBy(asc(subjects.title)),
      db
        .select()
        .from(plans)
        .where(eq(plans.studentId, studentId))
        .orderBy(desc(plans.weekStart))
        .limit(12),
    ]);

  const resourceList: ResourceWithSubject[] = resourceRows.map((row) => ({
    ...row,
    unitType: row.unitType as ResourceWithSubject["unitType"],
  }));

  const constraints =
    constraintRows[0] ??
    ({
      studentId,
      maxDailyMinutes: 240,
      restWeekday: 6,
      bufferPct: 15,
    } satisfies typeof studentConstraints.$inferSelect);

  return {
    student,
    targets: targetRows,
    resources: resourceList,
    availability: availabilityRows,
    constraints,
    subjects: subjectRows,
    plans: planRows,
  };
}

export type PlanWithTasks = {
  plan: typeof plans.$inferSelect;
  tasks: (typeof tasks.$inferSelect)[];
} | null;

export async function getPlanForWeek(
  workspaceId: string,
  studentId: string,
  weekStart: string,
): Promise<PlanWithTasks> {
  const db = await getDb();
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.workspaceId, workspaceId), eq(students.id, studentId)))
    .limit(1);
  if (!student) return null;

  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.studentId, studentId), eq(plans.weekStart, weekStart)))
    .limit(1);

  if (!plan) return null;

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.planId, plan.id))
    .orderBy(asc(tasks.planDate), asc(tasks.plannedStart));

  return { plan, tasks: taskRows };
}

export type WeekReport = {
  weekStart: string;
  dates: string[];
  plannedMinutes: number;
  doneMinutes: number;
  doneTasks: number;
  totalTasks: number;
  activeDays: number;
  correctStarts: number;
  eligibleDays: number;
  testsDone: number;
  byDay: {
    date: string;
    total: number;
    done: number;
    minutes: number;
  }[];
};

export async function getWeekReport(
  workspaceId: string,
  studentId: string,
  weekStart: string,
): Promise<WeekReport> {
  const dates = weekDates(weekStart);
  const planData = await getPlanForWeek(workspaceId, studentId, weekStart);

  if (!planData) {
    return {
      weekStart,
      dates,
      plannedMinutes: 0,
      doneMinutes: 0,
      doneTasks: 0,
      totalTasks: 0,
      activeDays: 0,
      correctStarts: 0,
      eligibleDays: 0,
      testsDone: 0,
      byDay: dates.map((date) => ({ date, total: 0, done: 0, minutes: 0 })),
    };
  }

  const byDay = dates.map((date) => {
    const dayTasks = planData.tasks.filter((task) => task.planDate === date);
    return {
      date,
      total: dayTasks.length,
      done: dayTasks.filter((task) => task.status === "done").length,
      minutes: dayTasks
        .filter((task) => task.status === "done")
        .reduce((sum, task) => sum + task.estMinutes, 0),
    };
  });

  let correctStarts = 0;
  let eligibleDays = 0;

  for (const date of dates) {
    const dayTasks = planData.tasks
      .filter((task) => task.planDate === date)
      .sort((a, b) => a.plannedStart - b.plannedStart);
    const first = dayTasks[0];
    if (!first) continue;
    eligibleDays += 1;
    if (first.actualStartedAt) {
      const planned = new Date(`${date}T00:00:00+03:30`).getTime() + first.plannedStart * 60_000;
      const diff = first.actualStartedAt.getTime() - planned;
      if (diff >= -5 * 60_000 && diff <= 30 * 60_000) correctStarts += 1;
    }
  }

  return {
    weekStart,
    dates,
    plannedMinutes: planData.tasks.reduce((sum, task) => sum + task.estMinutes, 0),
    doneMinutes: planData.tasks
      .filter((task) => task.status === "done")
      .reduce((sum, task) => sum + task.estMinutes, 0),
    doneTasks: planData.tasks.filter((task) => task.status === "done").length,
    totalTasks: planData.tasks.length,
    activeDays: byDay.filter((day) => day.done > 0).length,
    correctStarts,
    eligibleDays,
    testsDone: planData.tasks.filter((task) => task.type === "test" && task.status === "done").length,
    byDay,
  };
}

export async function getStudentToday(studentId: string) {
  const db = await getDb();
  const today = todayISO();
  const plan = await db
    .select()
    .from(plans)
    .where(
      and(
        eq(plans.studentId, studentId),
        eq(plans.weekStart, startOfWeekSaturday(today)),
        inArray(plans.status, ["approved", "active"]),
      ),
    )
    .limit(1);

  const planRow = plan[0];
  if (!planRow) return { today, plan: null, tasks: [] as (typeof tasks.$inferSelect)[] };

  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.planId, planRow.id), eq(tasks.planDate, today)))
    .orderBy(asc(tasks.plannedStart));

  return { today, plan: planRow, tasks: taskRows };
}

export async function getStudentWeek(studentId: string, weekStart: string) {
  const db = await getDb();
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.studentId, studentId), eq(plans.weekStart, weekStart)))
    .limit(1);

  if (!plan) return { plan: null, tasks: [] as (typeof tasks.$inferSelect)[] };

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.planId, plan.id))
    .orderBy(asc(tasks.planDate), asc(tasks.plannedStart));

  return { plan, tasks: taskRows };
}

export async function getStudentDailyLog(studentId: string, date: string) {
  const db = await getDb();
  const [log] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.studentId, studentId), eq(dailyLogs.logDate, date)))
    .limit(1);
  return log ?? null;
}

export type PeriodReport = {
  from: string;
  to: string;
  plannedMinutes: number;
  doneMinutes: number;
  doneTasks: number;
  totalTasks: number;
  activeDays: number;
  correctStarts: number;
  eligibleDays: number;
  testsDone: number;
  byWeek: {
    weekStart: string;
    total: number;
    done: number;
    minutes: number;
  }[];
};

export async function getPeriodReport(
  workspaceId: string,
  studentId: string,
  from: string,
  to: string,
): Promise<PeriodReport> {
  const db = await getDb();
  const rows = await db
    .select({ task: tasks, weekStart: plans.weekStart })
    .from(tasks)
    .innerJoin(plans, eq(tasks.planId, plans.id))
    .innerJoin(students, eq(plans.studentId, students.id))
    .where(
      and(
        eq(students.workspaceId, workspaceId),
        eq(students.id, studentId),
        sql`${tasks.planDate} >= ${from}`,
        sql`${tasks.planDate} <= ${to}`,
      ),
    )
    .orderBy(asc(tasks.planDate), asc(tasks.plannedStart));

  const byDate = new Map<string, typeof rows>();
  const byWeek = new Map<string, { total: number; done: number; minutes: number }>();

  for (const row of rows) {
    const dateList = byDate.get(row.task.planDate) ?? [];
    dateList.push(row);
    byDate.set(row.task.planDate, dateList);

    const week = byWeek.get(row.weekStart) ?? { total: 0, done: 0, minutes: 0 };
    week.total += 1;
    if (row.task.status === "done") {
      week.done += 1;
      week.minutes += row.task.estMinutes;
    }
    byWeek.set(row.weekStart, week);
  }

  let correctStarts = 0;
  let eligibleDays = 0;

  for (const [date, dayRows] of byDate.entries()) {
    const first = dayRows[0];
    if (!first) continue;
    eligibleDays += 1;
    if (first.task.actualStartedAt) {
      const planned = new Date(`${date}T00:00:00+03:30`).getTime() + first.task.plannedStart * 60_000;
      const diff = first.task.actualStartedAt.getTime() - planned;
      if (diff >= -5 * 60_000 && diff <= 30 * 60_000) correctStarts += 1;
    }
  }

  const doneRows = rows.filter((row) => row.task.status === "done");

  return {
    from,
    to,
    plannedMinutes: rows.reduce((sum, row) => sum + row.task.estMinutes, 0),
    doneMinutes: doneRows.reduce((sum, row) => sum + row.task.estMinutes, 0),
    doneTasks: doneRows.length,
    totalTasks: rows.length,
    activeDays: [...byDate.entries()].filter(([, dayRows]) =>
      dayRows.some((row) => row.task.status === "done"),
    ).length,
    correctStarts,
    eligibleDays,
    testsDone: doneRows.filter((row) => row.task.type === "test").length,
    byWeek: [...byWeek.entries()]
      .map(([weekStart, stats]) => ({ weekStart, ...stats }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
  };
}
