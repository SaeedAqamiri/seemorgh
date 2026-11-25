import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  availability,
  dailyLogs,
  examTargets,
  plans,
  resources,
  studentConstraints,
  studentGroups,
  students,
  subjects,
  tasks,
} from "@/db/schema";
import { startOfWeekSaturday, tehranMinutesOf, todayISO, weekDates } from "./dates";
import { ensureSubjectCatalog, listSubjectsForField } from "./subject-catalog";
import { chaptersByResourceIds, ensureChaptersFromJson } from "./resource-chapters";
import { ensureStudentGroups, getGroupForStudent, type StudentGroup } from "./student-groups";
import type { ResourceChapterRow } from "@/db/schema";

export type StudentListItem = {
  id: string;
  name: string;
  phone: string;
  grade: string;
  field: string;
  track: string;
  inviteCode: string;
  hasAccount: boolean;
  groupId: string | null;
  groupName: string | null;
  groupEmoji: string | null;
  groupColor: string | null;
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

  await ensureStudentGroups(workspaceId);

  const rows = await db
    .select({
      student: students,
      groupName: studentGroups.name,
      groupEmoji: studentGroups.emoji,
      groupColor: studentGroups.color,
    })
    .from(students)
    .leftJoin(studentGroups, eq(students.groupId, studentGroups.id))
    .where(
      and(
        eq(students.workspaceId, workspaceId),
        eq(students.counselorId, counselorId),
        eq(students.status, "active"),
      ),
    )
    .orderBy(asc(students.name));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.student.id);

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

  return rows.map((row) => {
    const student = row.student;
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
      groupId: student.groupId,
      groupName: row.groupName,
      groupEmoji: row.groupEmoji,
      groupColor: row.groupColor,
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
  unitType: "test" | "exercise" | "page" | "chapter";
  totalUnits: number;
  completedUnits: number;
  chaptersJson: { title: string; pages: number; startPage: number; endPage: number }[] | null;
  chapters: ResourceChapterRow[];
  priority: number;
  coverUrl: string | null;
  coverSource: string | null;
};

export type StudentDetail = {
  student: typeof students.$inferSelect;
  targets: (typeof examTargets.$inferSelect)[];
  resources: ResourceWithSubject[];
  availability: (typeof availability.$inferSelect)[];
  constraints: typeof studentConstraints.$inferSelect;
  subjects: Awaited<ReturnType<typeof listSubjectsForField>>;
  plans: (typeof plans.$inferSelect)[];
  group: StudentGroup | null;
};

export async function getStudentDetail(
  workspaceId: string,
  studentId: string,
): Promise<StudentDetail | null> {
  const db = await getDb();
  await ensureStudentGroups(workspaceId);
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.workspaceId, workspaceId), eq(students.id, studentId)))
    .limit(1);

  if (!student) return null;

  await ensureSubjectCatalog(workspaceId);

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
          coverUrl: resources.coverUrl,
          coverSource: resources.coverSource,
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
      listSubjectsForField(workspaceId, student.field),
      db
        .select()
        .from(plans)
        .where(eq(plans.studentId, studentId))
        .orderBy(desc(plans.weekStart))
        .limit(12),
    ]);

  const knownSubjectIds = new Set(subjectRows.map((row) => row.id));
  const missingSubjectIds = [
    ...new Set(resourceRows.map((row) => row.subjectId).filter((id) => !knownSubjectIds.has(id))),
  ];
  if (missingSubjectIds.length > 0) {
    const extraSubjects = await db
      .select({
        id: subjects.id,
        title: subjects.title,
        kind: subjects.kind,
        color: subjects.color,
        fieldsJson: subjects.fieldsJson,
      })
      .from(subjects)
      .where(inArray(subjects.id, missingSubjectIds));
    subjectRows.push(...extraSubjects);
  }

  let chapterMap = await chaptersByResourceIds(
    db,
    resourceRows.map((row) => row.id),
  );
  let backfilled = false;
  for (const row of resourceRows) {
    if ((chapterMap.get(row.id)?.length ?? 0) > 0) continue;
    const created = await ensureChaptersFromJson(db, {
      id: row.id,
      unitType: row.unitType as ResourceWithSubject["unitType"],
      totalUnits: row.totalUnits,
      completedUnits: row.completedUnits,
      chaptersJson: row.chaptersJson,
    });
    if (created) backfilled = true;
  }
  if (backfilled) {
    chapterMap = await chaptersByResourceIds(
      db,
      resourceRows.map((row) => row.id),
    );
  }
  const resourceList: ResourceWithSubject[] = resourceRows.map((row) => ({
    ...row,
    unitType: row.unitType as ResourceWithSubject["unitType"],
    chapters: chapterMap.get(row.id) ?? [],
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
    group: await getGroupForStudent(workspaceId, studentId),
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

  const counted = planData.tasks.filter(
    (task) => task.type !== "school" && task.type !== "exam" && task.type !== "exam_analysis",
  );
  const byDay = dates.map((date) => {
    const dayTasks = counted.filter((task) => task.planDate === date);
    return {
      date,
      total: dayTasks.length,
      done: dayTasks.filter((task) => task.status === "done").length,
      minutes: dayTasks
        .filter((task) => task.status === "done")
        .reduce((sum, task) => sum + task.estMinutes, 0),
    };
  });

  const db = await getDb();
  const openedRows = await db
    .select({ date: dailyLogs.logDate, firstOpenedAt: dailyLogs.firstOpenedAt })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.studentId, studentId),
        inArray(dailyLogs.logDate, dates),
      ),
    );
  const openedByDate = new Map(
    openedRows
      .filter((row) => row.firstOpenedAt)
      .map((row) => [row.date, tehranMinutesOf(row.firstOpenedAt!)]),
  );

  let correctStarts = 0;
  let eligibleDays = 0;

  for (const date of dates) {
    const dayTasks = counted
      .filter((task) => task.planDate === date)
      .sort((a, b) => a.plannedStart - b.plannedStart);
    const first = dayTasks[0];
    if (!first) continue;
    eligibleDays += 1;
    const opened = openedByDate.get(date);
    if (opened !== undefined) {
      const diff = opened - first.plannedStart;
      if (diff >= -5 && diff <= 30) correctStarts += 1;
    }
  }

  return {
    weekStart,
    dates,
    plannedMinutes: counted.reduce((sum, task) => sum + task.estMinutes, 0),
    doneMinutes: counted
      .filter((task) => task.status === "done")
      .reduce((sum, task) => sum + task.estMinutes, 0),
    doneTasks: counted.filter((task) => task.status === "done").length,
    totalTasks: counted.length,
    activeDays: byDay.filter((day) => day.done > 0).length,
    correctStarts,
    eligibleDays,
    testsDone: counted.filter((task) => task.status === "done" && (task.type === "test" || task.type === "timed_test" || task.type === "exercise")).length,
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

  const openedRows = await db
    .select({ date: dailyLogs.logDate, firstOpenedAt: dailyLogs.firstOpenedAt })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.studentId, studentId),
        sql`${dailyLogs.logDate} >= ${from}`,
        sql`${dailyLogs.logDate} <= ${to}`,
      ),
    );
  const openedByDate = new Map(
    openedRows
      .filter((row) => row.firstOpenedAt)
      .map((row) => [row.date, tehranMinutesOf(row.firstOpenedAt!)]),
  );

  let correctStarts = 0;
  let eligibleDays = 0;

  for (const [date, dayRows] of byDate.entries()) {
    const first = dayRows[0];
    if (!first) continue;
    eligibleDays += 1;
    const opened = openedByDate.get(date);
    if (opened !== undefined) {
      const diff = opened - first.task.plannedStart;
      if (diff >= -5 && diff <= 30) correctStarts += 1;
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
    testsDone: doneRows.filter((row) => row.task.type === "test" || row.task.type === "timed_test" || row.task.type === "exercise").length,
    byWeek: [...byWeek.entries()]
      .map(([weekStart, stats]) => ({ weekStart, ...stats }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
  };
}
