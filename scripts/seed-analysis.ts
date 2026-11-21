import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  availability,
  dailyLogs,
  examTargets,
  externalExams,
  performancePanels,
  plans,
  reports,
  resources,
  studentConstraints,
  studentGroups,
  students,
  subjects,
  users,
  weeklyPanels,
  workspaces,
  type ExamSubjectScore,
  type PerformanceGridJson,
  type WeeklyGridJson,
} from "../src/db/schema";
import {
  addDays,
  startOfWeekSaturday,
  todayISO,
  weekDates,
  weekdayIndex,
} from "../src/lib/dates";
import { hashPassword } from "../src/lib/password";
import { PANEL_SLOTS } from "../src/lib/panel";
import { availabilityForGrade, STUDY_CONSTRAINTS } from "../src/lib/study-windows";

const PASSWORD = "seemorgh123";
const NEW_STUDENT_NAMES = [
  "سارا احمدی",
  "محمد کریمی",
  "نگار موسوی",
  "امیرحسین رحیمی",
  "فاطمه شریفی",
  "رضا نوری",
  "الهام صادقی",
  "مهدی قاسمی",
  "یسنا مرادی",
  "پارسا اکبری",
  "هانیه رستمی",
  "کیانوش عظیمی",
  "مهسا فراهانی",
  "سینا خسروی",
  "آیدا محمدی",
  "بردیا کاظمی",
  "ترنم نیکو",
  "آرش امینی",
];

const EXPERIMENTAL_SUBJECTS = [
  "زیست‌شناسی",
  "شیمی",
  "فیزیک",
  "ریاضی",
  "ادبیات فارسی",
  "عربی",
  "دین و زندگی",
  "زبان انگلیسی",
] as const;
const MATH_SUBJECTS = [
  "فیزیک",
  "شیمی",
  "ادبیات فارسی",
  "عربی",
  "دین و زندگی",
  "زبان انگلیسی",
] as const;

const QUESTION_COUNT: Record<string, number> = {
  "زیست‌شناسی": 45,
  شیمی: 35,
  فیزیک: 30,
  ریاضی: 30,
};

const SUBJECT_WEIGHT: Record<string, number> = {
  "زیست‌شناسی": 12,
  شیمی: 9,
  فیزیک: 7,
  ریاضی: 7,
};

const RESOURCE_TEMPLATE = [
  { subject: "زیست‌شناسی", title: "زیست‌شناسی دهم — تست خیلی سبز", total: 1200 },
  { subject: "زیست‌شناسی", title: "زیست‌شناسی یازدهم — تست خیلی سبز", total: 1300 },
  { subject: "زیست‌شناسی", title: "زیست‌شناسی دوازدهم — تست خیلی سبز", total: 2200 },
  { subject: "شیمی", title: "شیمی دهم — تست گاج", total: 1100 },
  { subject: "شیمی", title: "شیمی یازدهم — تست گاج", total: 1200 },
  { subject: "شیمی", title: "شیمی دوازدهم — تست گاج", total: 1700 },
  { subject: "شیمی", title: "شیمی دوازدهم — تست مبتکران", total: 1600 },
  { subject: "فیزیک", title: "فیزیک دهم — تست خیلی سبز", total: 1000 },
  { subject: "فیزیک", title: "فیزیک یازدهم — تست خیلی سبز", total: 1100 },
  { subject: "فیزیک", title: "فیزیک دوازدهم — تست خیلی سبز", total: 1200 },
  { subject: "ریاضی", title: "ریاضی دهم — تست خیلی سبز", total: 900 },
  { subject: "ریاضی", title: "ریاضی یازدهم — تست خیلی سبز", total: 1000 },
  { subject: "ریاضی", title: "ریاضیات تجربی دوازدهم — تست خیلی سبز", total: 1500 },
];

const EXAM_TITLES = [
  "آزمون آزمایشی قلم‌چی — دوره ۱",
  "آزمون آزمایشی قلم‌چی — دوره ۲",
  "آزمون آزمایشی قلم‌چی — دوره ۳",
  "آزمون آزمایشی قلم‌چی — دوره ۴",
];

const EXAM_OFFSETS: Record<string, number>[] = [
  { "زیست‌شناسی": 0, شیمی: 0, فیزیک: 0, ریاضی: 0 },
  { "زیست‌شناسی": -8, شیمی: -6, فیزیک: 4, ریاضی: 2 },
  { "زیست‌شناسی": 2, شیمی: 7, فیزیک: -7, ریاضی: -8 },
  { "زیست‌شناسی": 5, شیمی: 3, فیزیک: -2, ریاضی: -4 },
];

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seedText: string) {
  let state = hashSeed(seedText);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: { value: T; weight: number }[], random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function weightedOverall(subjects: ExamSubjectScore[]): number {
  const totalWeight = subjects.reduce(
    (sum, subject) => sum + (SUBJECT_WEIGHT[subject.subjectTitle] ?? 1),
    0,
  );
  if (totalWeight === 0) return 0;
  const total = subjects.reduce(
    (sum, subject) =>
      sum + subject.percent * (SUBJECT_WEIGHT[subject.subjectTitle] ?? 1),
    0,
  );
  return Math.round(total / totalWeight);
}

async function main() {
  const db = await getDb();
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, "دفتر مشاوره نمونه"))
    .limit(1);
  if (!workspace) throw new Error("workspace missing");
  const [counselor] = await db
    .select()
    .from(users)
    .where(and(eq(users.workspaceId, workspace.id), eq(users.role, "counselor")))
    .limit(1);
  if (!counselor) throw new Error("counselor missing");

  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, workspace.id));
  const subjectId = (title: string) => {
    const row = subjectRows.find((subject) => subject.title === title);
    if (!row) throw new Error(`subject missing: ${title}`);
    return row.id;
  };

  const existingStudents = await db
    .select()
    .from(students)
    .where(eq(students.workspaceId, workspace.id));
  const ali = existingStudents.find((student) => student.name === "علی رضایی");
  const maryam = existingStudents.find((student) => student.name === "مریم کاظمی");
  if (!ali || !maryam) throw new Error("base demo students missing");

  // Remove previously seeded analysis students so this script is idempotent.
  const oldNewStudents = existingStudents.filter((student) =>
    NEW_STUDENT_NAMES.includes(student.name),
  );
  if (oldNewStudents.length > 0) {
    const oldIds = oldNewStudents.map((student) => student.id);
    await db.delete(performancePanels).where(inArray(performancePanels.studentId, oldIds));
    await db.delete(weeklyPanels).where(inArray(weeklyPanels.studentId, oldIds));
    await db.delete(externalExams).where(inArray(externalExams.studentId, oldIds));
    await db.delete(plans).where(inArray(plans.studentId, oldIds));
    await db.delete(availability).where(inArray(availability.studentId, oldIds));
    await db.delete(examTargets).where(inArray(examTargets.studentId, oldIds));
    await db.delete(resources).where(inArray(resources.studentId, oldIds));
    await db.delete(reports).where(inArray(reports.studentId, oldIds));
    await db.delete(dailyLogs).where(inArray(dailyLogs.studentId, oldIds));
    await db.delete(studentConstraints).where(inArray(studentConstraints.studentId, oldIds));
    await db.delete(students).where(inArray(students.id, oldIds));
    await db
      .delete(users)
      .where(
        inArray(
          users.phone,
          oldNewStudents.map((student) => student.phone),
        ),
      );
  }

  const groupSeed = [
    { name: "مدرسه علامه حلی", field: "تجربی", emoji: "🏫", color: "#2563eb" },
    { name: "مؤسسه مشاوره دکتر سعیدی", field: "ریاضی", emoji: "🎓", color: "#7c3aed" },
    { name: "دبیرستان فرزانگان", field: "تجربی", emoji: "⭐", color: "#be123c" },
  ];
  for (const group of groupSeed) {
    await db
      .insert(studentGroups)
      .values({ workspaceId: workspace.id, ...group })
      .onConflictDoNothing();
    await db
      .update(studentGroups)
      .set({ field: group.field, emoji: group.emoji, color: group.color })
      .where(
        and(eq(studentGroups.workspaceId, workspace.id), eq(studentGroups.name, group.name)),
      );
  }
  const groupRows = await db
    .select()
    .from(studentGroups)
    .where(eq(studentGroups.workspaceId, workspace.id));
  const groupIdByName = (name: string) => groupRows.find((group) => group.name === name)?.id ?? null;
  const experimentalGroups = [
    groupIdByName("مدرسه علامه حلی"),
    groupIdByName("دبیرستان فرزانگان"),
  ].filter((id): id is string => Boolean(id));
  const mathGroup = groupIdByName("مؤسسه مشاوره دکتر سعیدی");

  await db
    .update(students)
    .set({ groupId: experimentalGroups[0] ?? null })
    .where(eq(students.id, ali.id));
  await db
    .update(students)
    .set({ groupId: mathGroup ?? null })
    .where(eq(students.id, maryam.id));

  const today = todayISO();
  const currentWeek = startOfWeekSaturday(today);
  const firstWeek = addDays(currentWeek, -16 * 7);

  // Clear study history seeded previously for the two base students (past weeks only).
  for (const student of [ali, maryam]) {
    await db.delete(externalExams).where(eq(externalExams.studentId, student.id));
    await db
      .delete(performancePanels)
      .where(
        and(
          eq(performancePanels.studentId, student.id),
          sql`${performancePanels.weekStart} >= ${firstWeek}`,
          sql`${performancePanels.weekStart} < ${currentWeek}`,
        ),
      );
    await db
      .delete(weeklyPanels)
      .where(
        and(
          eq(weeklyPanels.studentId, student.id),
          sql`${weeklyPanels.weekStart} >= ${firstWeek}`,
          sql`${weeklyPanels.weekStart} < ${currentWeek}`,
        ),
      );
  }

  const newStudents: (typeof students.$inferSelect)[] = [];
  for (const [index, name] of NEW_STUDENT_NAMES.entries()) {
    const phone = `09123${String(index + 1).padStart(6, "0")}`;
    const [user] = await db
      .insert(users)
      .values({
        workspaceId: workspace.id,
        role: "student",
        name,
        phone,
        passwordHash: hashPassword(PASSWORD),
      })
      .returning();
    const [student] = await db
      .insert(students)
      .values({
        workspaceId: workspace.id,
        groupId: experimentalGroups[index % Math.max(1, experimentalGroups.length)] ?? null,
        counselorId: counselor.id,
        userId: user.id,
        name,
        phone,
        grade: "دوازدهم",
        field: "تجربی",
        track: "konkur",
        inviteCode: randomUUID().replace(/-/g, "").slice(0, 12),
        status: "active",
      })
      .returning();
    newStudents.push(student);

    await db.insert(studentConstraints).values({
      studentId: student.id,
      restWeekday: 6,
      ...STUDY_CONSTRAINTS,
    });
    await db.insert(availability).values(
      availabilityForGrade("دوازدهم", 6).map((slot) => ({
        studentId: student.id,
        ...slot,
      })),
    );
    await db.insert(examTargets).values([
      {
        studentId: student.id,
        title: "کنکور ۱۴۰۶",
        examType: "konkur",
        examDate: addDays(today, 150),
        weight: 5,
      },
      {
        studentId: student.id,
        title: "امتحانات نهایی دی",
        examType: "final",
        examDate: addDays(today, 80),
        weight: 5,
      },
      {
        studentId: student.id,
        title: "آزمون آزمایشی قلم‌چی",
        examType: "mock",
        examDate: addDays(today, 10),
        weight: 4,
      },
    ]);

    const random = makeRandom(`${phone}-resources`);
    await db.insert(resources).values(
      RESOURCE_TEMPLATE.map((resource) => {
        const doneShare = 0.1 + random() * 0.6;
        return {
          workspaceId: workspace.id,
          studentId: student.id,
          subjectId: subjectId(resource.subject),
          title: resource.title,
          unitType: "test" as const,
          totalUnits: resource.total,
          completedUnits: Math.round(resource.total * doneShare),
          priority: resource.subject === "زیست‌شناسی" || resource.subject === "شیمی" ? 5 : 4,
        };
      }),
    );
  }

  const allStudents = [ali, maryam, ...newStudents];

  // Study history + weekly panels for the last 4 months.
  for (const student of allStudents) {
    const random = makeRandom(`${student.phone}-study`);
    const isMath = student.field === "ریاضی";
    const subjectTitles = isMath ? [...MATH_SUBJECTS] : [...EXPERIMENTAL_SUBJECTS];
    const resourceRows = await db
      .select({ id: resources.id, subjectId: resources.subjectId, title: resources.title })
      .from(resources)
      .where(eq(resources.studentId, student.id));
    const resourceBySubject = new Map<string, string[]>();
    for (const resource of resourceRows) {
      const title = subjectRows.find((subject) => subject.id === resource.subjectId)?.title;
      if (!title) continue;
      const list = resourceBySubject.get(title) ?? [];
      list.push(resource.id);
      resourceBySubject.set(title, list);
    }

    const studyBias: Record<string, number> = {};
    for (const title of subjectTitles) {
      studyBias[title] = 0.7 + random() * 0.8;
    }

    const weekList = Array.from({ length: 17 }, (_, index) => addDays(currentWeek, (index - 16) * 7));
    const lastWeek = weekList[weekList.length - 1];

    for (const weekStart of weekList) {
      const isCurrentWeek = weekStart === lastWeek;
      if (isCurrentWeek && (student.id === ali.id || student.id === maryam.id)) {
        // Keep the existing current-week data for the two base students.
        continue;
      }

      const todayIndex = weekdayIndex(today);
      const planGrid: WeeklyGridJson = [];
      const perfGrid: PerformanceGridJson = [];

      for (let day = 0; day < 7; day += 1) {
        const planRow: WeeklyGridJson[number] = [];
        const perfRow: PerformanceGridJson[number] = [];
        const isRest = day === 6;
        const isFutureCurrent = isCurrentWeek && day > todayIndex;

        for (let slot = 0; slot < PANEL_SLOTS.length; slot += 1) {
          if (isRest) {
            planRow.push({ kind: "rest" });
            perfRow.push(isFutureCurrent ? { kind: "empty" } : { kind: "rest" });
            continue;
          }

          const subjectTitle = pickWeighted(
            subjectTitles.map((title) => ({ value: title, weight: studyBias[title] ?? 1 })),
            random,
          );
          const subject = subjectId(subjectTitle);
          const subjectResources = resourceBySubject.get(subjectTitle) ?? [];
          const resourceId =
            subjectResources.length > 0
              ? subjectResources[Math.floor(random() * subjectResources.length)]
              : null;
          const isTest = random() < 0.7;
          const count = 20 + Math.floor(random() * 16);

          if (isTest) {
            planRow.push({
              kind: "test",
              subjectId: subject,
              resourceId,
              chapterId: null,
              count,
            });
          } else {
            planRow.push({ kind: "review", subjectId: subject, resourceText: "" });
          }

          if (isFutureCurrent) {
            perfRow.push({ kind: "empty" });
            continue;
          }

          const slotDef = PANEL_SLOTS[slot];
          const startMin = slotDef.startMin + Math.floor(random() * 18);
          const didIt = random() > 0.08;
          if (!didIt) {
            perfRow.push({ kind: "empty" });
          } else if (isTest) {
            perfRow.push({
              kind: "test",
              subjectId: subject,
              resourceId,
              chapterId: null,
              count: Math.max(5, Math.round(count * (0.55 + random() * 0.45))),
              minutes: Math.max(5, slotDef.endMin - startMin),
              note: random() > 0.8 ? "تمرین زمان‌دار" : "",
            });
          } else {
            perfRow.push({
              kind: "review",
              subjectId: subject,
              resourceText: "",
              minutes: Math.max(5, slotDef.endMin - startMin),
              note: random() > 0.85 ? "مرور و جمع‌بندی" : "",
            });
          }
        }

        planGrid.push(planRow);
        perfGrid.push(perfRow);
      }

      await db.insert(weeklyPanels).values({
        studentId: student.id,
        weekStart,
        gridJson: planGrid,
        dailyRoutine: isMath ? "مرور مسئله‌ها و تست‌زنی هدفمند." : "مرور سبک صبح، تست عصر، جمع‌بندی شب.",
        nextWeekHomework: "مرور اشتباهات و تست ترکیبی.",
        updatedBy: counselor.id,
        updatedAt: new Date(),
      });
      await db.insert(performancePanels).values({
        studentId: student.id,
        weekStart,
        cellsJson: perfGrid,
        narrative: "",
        updatedBy: counselor.id,
        updatedAt: new Date(),
      });
    }
  }

  // Four common external exams, one per month, for all students.
  const examDates = [addDays(today, -90), addDays(today, -60), addDays(today, -30), addDays(today, -3)];

  for (const student of allStudents) {
    const random = makeRandom(`${student.phone}-exams`);
    const isMath = student.field === "ریاضی";
    const subjectTitles = isMath ? [...MATH_SUBJECTS] : [...EXPERIMENTAL_SUBJECTS];
    const skill: Record<string, number> = {};
    const improvement: Record<string, number> = {};
    for (const title of subjectTitles) {
      skill[title] = 35 + random() * 45;
      improvement[title] = -2 + random() * 7;
    }

    const values = EXAM_TITLES.map((title, examIndex) => {
      const offsets = EXAM_OFFSETS[examIndex];
      const subjectsJson: ExamSubjectScore[] = subjectTitles.map((subjectTitle) => {
        const percent = clamp(
          Math.round(
            (skill[subjectTitle] ?? 50) +
              (improvement[subjectTitle] ?? 0) * examIndex +
              (offsets[subjectTitle] ?? 0) +
              (random() * 8 - 4),
          ),
          10,
          100,
        );
        const total = QUESTION_COUNT[subjectTitle] ?? 30;
        const correct = Math.round((percent / 100) * total);
        const blank = Math.floor(random() * 4);
        const wrong = Math.max(0, total - correct - blank);
        return {
          subjectId: subjectId(subjectTitle),
          subjectTitle,
          percent,
          correct,
          wrong,
          blank,
          total,
        };
      });
      return {
        workspaceId: workspace.id,
        studentId: student.id,
        title,
        examDate: examDates[examIndex],
        examType: "mock",
        provider: "قلم‌چی",
        subjectsJson,
        overallPercent: weightedOverall(subjectsJson),
        note: "",
        createdBy: counselor.id,
      };
    });

    await db.insert(externalExams).values(values);
  }

  const counts = await db
    .select({
      students: sql<number>`count(distinct ${students.id})::int`,
    })
    .from(students)
    .where(eq(students.workspaceId, workspace.id));
  const examCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(externalExams)
    .where(eq(externalExams.workspaceId, workspace.id));
  const perfCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(performancePanels);

  console.log(`analysis demo ready: ${counts[0]?.students ?? 0} students, ${examCount[0]?.count ?? 0} external exams, ${perfCount[0]?.count ?? 0} performance panels`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
