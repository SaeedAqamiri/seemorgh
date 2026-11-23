// Builds a client-ready demo for a 12th-grade experimental group:
// realistic resources + progress, past mock-exam history, a full mock calendar
// through the final exam, study goals, availability and weekly plans/panels.
//
// Usage:
//   bunx tsx scripts/seed-demo-group-12exp.ts --stage=resources
//   bunx tsx scripts/seed-demo-group-12exp.ts --stage=exams
//   bunx tsx scripts/seed-demo-group-12exp.ts --stage=plan
//   bunx tsx scripts/seed-demo-group-12exp.ts --stage=performance
//   bunx tsx scripts/seed-demo-group-12exp.ts --stage=collections
//
// Psych attempts + AI summaries are generated separately:
//   bunx tsx scripts/simulate-psych-attempts.ts --group "علامه حلی" --force
//   bunx tsx scripts/generate-psych-analyses.ts --group "علامه حلی"
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  availability,
  examTargets,
  externalExams,
  groupMockExams,
  mockExamPrograms,
  planningSettings,
  plans,
  questionCollectionItems,
  questionCollections,
  questions,
  resourceChapters,
  resourcePool,
  resources,
  studentConstraints,
  studentGroups,
  studentMockExams,
  students,
  studyGoals,
  subjects,
  tasks,
  users,
  weeklyPanels,
  workspaces,
  type ExamSubjectScore,
} from "../src/db/schema";
import { buildDeterministicAllocation, scheduleAutoPlan } from "../src/lib/auto-plan";
import { getAutoPlanContext } from "../src/lib/auto-plan-data";
import { getLatestCounselingReport } from "../src/lib/counseling-report";
import { startOfWeekSaturday, todayISO, weekDates } from "../src/lib/dates";
import { buildGridFromTasks, saveGeneratedPanel } from "../src/lib/panel";
import { recomputeResourceTotals } from "../src/lib/resource-chapters";
import {
  alignPersonalResourcesWithPool,
  copyPoolBookToStudent,
  listResourcePool,
  seedResourcePool,
  type PoolBookView,
} from "../src/lib/resource-pool";
import { seedPerformanceData } from "../src/lib/seed-performance-data";
import { ensureMockExamCatalog } from "../src/lib/mock-exams";
import { schoolWeekdaysForGrade } from "../src/lib/study-windows";

const GROUP_NAME = "مدرسه علامه حلی";
const SPECIALIZED = ["زیست‌شناسی", "شیمی", "فیزیک", "ریاضی"] as const;
const GENERALS = ["ادبیات فارسی", "عربی", "دین و زندگی", "زبان انگلیسی"] as const;
const SUBJECTS = [...SPECIALIZED, ...GENERALS];
const SUBJECT_WEIGHT: Record<string, number> = {
  "زیست‌شناسی": 12,
  شیمی: 9,
  فیزیک: 7,
  ریاضی: 7,
  "ادبیات فارسی": 3,
  عربی: 3,
  "دین و زندگی": 3,
  "زبان انگلیسی": 3,
};
const GRADE_FACTOR: Record<string, number> = { دهم: 1.15, یازدهم: 1.05, دوازدهم: 0.9 };
const PUBLISHER_ORDER = ["خیلی سبز", "گاج", "قلم چی", "مبتکران", "الگو", "مهروماه", "سنجش"];

type Level = "strong" | "normal" | "weak";

type Persona = {
  level: Level;
  target: string;
  capacity: number;
  trend: number;
  base: Record<string, number>;
  goals: Record<string, number>;
};

const PERSONAS: Record<string, Persona> = {
  "سارا احمدی": {
    level: "strong",
    target: "پزشکی",
    capacity: 480,
    trend: 1.4,
    base: { "زیست‌شناسی": 82, شیمی: 78, فیزیک: 66, ریاضی: 70, "ادبیات فارسی": 84, عربی: 78, "دین و زندگی": 86, "زبان انگلیسی": 80 },
    goals: { "زیست‌شناسی": 94, شیمی: 90, فیزیک: 80, ریاضی: 84, "ادبیات فارسی": 90, عربی: 86, "دین و زندگی": 94, "زبان انگلیسی": 90 },
  },
  "نگار موسوی": {
    level: "strong",
    target: "دندان‌پزشکی",
    capacity: 450,
    trend: 1.8,
    base: { "زیست‌شناسی": 80, شیمی: 72, فیزیک: 62, ریاضی: 58, "ادبیات فارسی": 86, عربی: 80, "دین و زندگی": 88, "زبان انگلیسی": 84 },
    goals: { "زیست‌شناسی": 92, شیمی: 84, فیزیک: 76, ریاضی: 72, "ادبیات فارسی": 92, عربی: 88, "دین و زندگی": 95, "زبان انگلیسی": 92 },
  },
  "فاطمه شریفی": {
    level: "normal",
    target: "داروسازی",
    capacity: 420,
    trend: 1.9,
    base: { "زیست‌شناسی": 68, شیمی: 74, فیزیک: 55, ریاضی: 60, "ادبیات فارسی": 74, عربی: 70, "دین و زندگی": 78, "زبان انگلیسی": 72 },
    goals: { "زیست‌شناسی": 84, شیمی: 88, فیزیک: 72, ریاضی: 76, "ادبیات فارسی": 84, عربی: 80, "دین و زندگی": 88, "زبان انگلیسی": 82 },
  },
  "الهام صادقی": {
    level: "normal",
    target: "فیزیوتراپی",
    capacity: 420,
    trend: 1.6,
    base: { "زیست‌شناسی": 66, شیمی: 62, فیزیک: 58, ریاضی: 50, "ادبیات فارسی": 76, عربی: 68, "دین و زندگی": 74, "زبان انگلیسی": 70 },
    goals: { "زیست‌شناسی": 80, شیمی: 78, فیزیک: 74, ریاضی: 68, "ادبیات فارسی": 86, عربی: 78, "دین و زندگی": 84, "زبان انگلیسی": 80 },
  },
  "آیدا محمدی": {
    level: "normal",
    target: "علوم آزمایشگاهی",
    capacity: 390,
    trend: 1.5,
    base: { "زیست‌شناسی": 70, شیمی: 58, فیزیک: 48, ریاضی: 46, "ادبیات فارسی": 78, عربی: 72, "دین و زندگی": 76, "زبان انگلیسی": 74 },
    goals: { "زیست‌شناسی": 84, شیمی: 74, فیزیک: 66, ریاضی: 64, "ادبیات فارسی": 86, عربی: 80, "دین و زندگی": 84, "زبان انگلیسی": 82 },
  },
  "یسنا مرادی": {
    level: "normal",
    target: "پرستاری",
    capacity: 390,
    trend: 1.7,
    base: { "زیست‌شناسی": 58, شیمی: 52, فیزیک: 50, ریاضی: 48, "ادبیات فارسی": 72, عربی: 66, "دین و زندگی": 70, "زبان انگلیسی": 68 },
    goals: { "زیست‌شناسی": 76, شیمی: 70, فیزیک: 68, ریاضی: 66, "ادبیات فارسی": 82, عربی: 76, "دین و زندگی": 80, "زبان انگلیسی": 78 },
  },
  "مهسا فراهانی": {
    level: "normal",
    target: "مامایی",
    capacity: 360,
    trend: 1.8,
    base: { "زیست‌شناسی": 55, شیمی: 50, فیزیک: 42, ریاضی: 38, "ادبیات فارسی": 80, عربی: 74, "دین و زندگی": 78, "زبان انگلیسی": 76 },
    goals: { "زیست‌شناسی": 74, شیمی: 68, فیزیک: 60, ریاضی: 56, "ادبیات فارسی": 88, عربی: 82, "دین و زندگی": 86, "زبان انگلیسی": 84 },
  },
  "هانیه رستمی": {
    level: "weak",
    target: "تغذیه",
    capacity: 360,
    trend: 2.1,
    base: { "زیست‌شناسی": 52, شیمی: 44, فیزیک: 38, ریاضی: 36, "ادبیات فارسی": 68, عربی: 60, "دین و زندگی": 66, "زبان انگلیسی": 62 },
    goals: { "زیست‌شناسی": 72, شیمی: 64, فیزیک: 58, ریاضی: 54, "ادبیات فارسی": 80, عربی: 74, "دین و زندگی": 78, "زبان انگلیسی": 74 },
  },
  "ترنم نیکو": {
    level: "weak",
    target: "بینایی‌سنجی",
    capacity: 330,
    trend: 2.0,
    base: { "زیست‌شناسی": 44, شیمی: 40, فیزیک: 32, ریاضی: 30, "ادبیات فارسی": 70, عربی: 64, "دین و زندگی": 68, "زبان انگلیسی": 66 },
    goals: { "زیست‌شناسی": 64, شیمی: 60, فیزیک: 50, ریاضی: 48, "ادبیات فارسی": 82, عربی: 76, "دین و زندگی": 80, "زبان انگلیسی": 78 },
  },
  "علی رضایی": {
    level: "weak",
    target: "بهداشت عمومی",
    capacity: 330,
    trend: 2.6,
    base: { "زیست‌شناسی": 40, شیمی: 34, فیزیک: 30, ریاضی: 28, "ادبیات فارسی": 60, عربی: 54, "دین و زندگی": 62, "زبان انگلیسی": 56 },
    goals: { "زیست‌شناسی": 62, شیمی: 56, فیزیک: 48, ریاضی: 46, "ادبیات فارسی": 76, عربی: 70, "دین و زندگی": 76, "زبان انگلیسی": 72 },
  },
};

const PAST_EXAMS: { date: string; provider: string }[] = [
  { date: "2026-08-14", provider: "خیلی سبز" },
  { date: "2026-08-28", provider: "خیلی سبز" },
  { date: "2026-09-11", provider: "خیلی سبز" },
  { date: "2026-09-25", provider: "خیلی سبز" },
  { date: "2026-10-09", provider: "قلم‌چی" },
  { date: "2026-10-23", provider: "سنجش" },
  { date: "2026-11-06", provider: "قلم‌چی" },
  { date: "2026-11-13", provider: "گاج" },
];

const FUTURE_DATES = [
  "2026-11-27",
  "2026-12-04",
  "2026-12-11",
  "2026-12-18",
  "2026-12-25",
  "2027-01-01",
  "2027-01-08",
  "2027-01-15",
  "2027-01-22",
  "2027-01-29",
  "2027-02-05",
  "2027-02-12",
  "2027-02-19",
  "2027-02-26",
  "2027-03-05",
  "2027-03-12",
  "2027-04-07",
  "2027-04-14",
  "2027-04-21",
  "2027-04-28",
  "2027-05-05",
  "2027-05-12",
  "2027-05-26",
  "2027-06-24",
  "2027-07-01",
];
const FUTURE_PROVIDERS = ["قلم‌چی", "گاج", "سنجش", "خیلی سبز"];

const args = process.argv.slice(2);
const stageArg = args.find((arg) => arg.startsWith("--stage="))?.split("=")[1] ?? "all";
const STAGES = new Set(
  stageArg === "all"
    ? ["resources", "exams", "plan", "performance", "collections"]
    : stageArg.split(","),
);

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function gradeOf(title: string): string | null {
  if (title.includes("دوازدهم")) return "دوازدهم";
  if (title.includes("یازدهم")) return "یازدهم";
  if (title.includes("دهم")) return "دهم";
  return null;
}

function weightedOverall(items: ExamSubjectScore[]): number {
  const totalWeight = items.reduce((sum, item) => sum + (SUBJECT_WEIGHT[item.subjectTitle] ?? 1), 0);
  if (totalWeight === 0) return 0;
  const total = items.reduce(
    (sum, item) => sum + item.percent * (SUBJECT_WEIGHT[item.subjectTitle] ?? 1),
    0,
  );
  return Math.round(total / totalWeight);
}

async function context() {
  const db = await getDb();
  const [group] = await db
    .select()
    .from(studentGroups)
    .where(eq(studentGroups.name, GROUP_NAME))
    .limit(1);
  if (!group) throw new Error(`group not found: ${GROUP_NAME}`);
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, group.workspaceId))
    .limit(1);
  if (!workspace) throw new Error("workspace not found");
  const [counselor] = await db
    .select()
    .from(users)
    .where(and(eq(users.workspaceId, workspace.id), eq(users.role, "counselor")))
    .limit(1);
  if (!counselor) throw new Error("counselor not found");
  const members = await db
    .select()
    .from(students)
    .where(and(eq(students.groupId, group.id), eq(students.status, "active")))
    .orderBy(asc(students.name));
  if (members.length === 0) throw new Error("group has no active students");
  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, workspace.id));
  return { db, group, workspace, counselor, members, subjectRows };
}

function personaFor(name: string): Persona {
  const persona = PERSONAS[name];
  if (!persona) throw new Error(`persona missing for ${name}`);
  return persona;
}

async function ensurePool(workspaceId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resourcePool)
    .where(eq(resourcePool.workspaceId, workspaceId));
  if (Number(row?.count ?? 0) === 0) {
    const result = await seedResourcePool(workspaceId);
    console.log(`resource pool seeded: ${result.books} books / ${result.chapters} chapters`);
  }
}

function pickBook(
  pool: PoolBookView[],
  subjectTitle: string,
  grade: string,
  field: string,
): PoolBookView | null {
  const candidates = pool
    .filter(
      (book) =>
        book.subjectTitle === subjectTitle &&
        book.grade === grade &&
        (book.fields.length === 0 || book.fields.includes(field)),
    )
    .sort((a, b) => {
      const ai = PUBLISHER_ORDER.indexOf(a.publisher);
      const bi = PUBLISHER_ORDER.indexOf(b.publisher);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.title.localeCompare(b.title, "fa");
    });
  return candidates[0] ?? null;
}

async function stageResources() {
  const { db, workspace, members } = await context();
  await ensurePool(workspace.id);
  const studentIds = members.map((member) => member.id);
  const aligned = await alignPersonalResourcesWithPool(workspace.id, { studentIds });
  console.log(`aligned resources with pool: updated=${aligned.updated} synthesized=${aligned.synthesized}`);

  const pool = await listResourcePool(workspace.id);
  for (const student of members) {
    const persona = personaFor(student.name);
    const rows = await db
      .select({
        id: resources.id,
        title: resources.title,
        unitType: resources.unitType,
        totalUnits: resources.totalUnits,
        subjectId: resources.subjectId,
        subjectTitle: subjects.title,
      })
      .from(resources)
      .innerJoin(subjects, eq(resources.subjectId, subjects.id))
      .where(eq(resources.studentId, student.id));

    const existing = new Map<string, Set<string>>();
    for (const row of rows) {
      const grades = existing.get(row.subjectTitle) ?? new Set<string>();
      const grade = gradeOf(row.title);
      if (grade) grades.add(grade);
      existing.set(row.subjectTitle, grades);
    }

    let added = 0;
    for (const title of SPECIALIZED) {
      for (const grade of ["دهم", "یازدهم", "دوازدهم"]) {
        if (existing.get(title)?.has(grade)) continue;
        const book = pickBook(pool, title, grade, student.field);
        if (!book) continue;
        await copyPoolBookToStudent(workspace.id, student.id, book.id, 4);
        added += 1;
      }
    }
    for (const title of GENERALS) {
      if (existing.get(title)?.has("دوازدهم")) continue;
      const book = pickBook(pool, title, "دوازدهم", student.field);
      if (!book) continue;
      await copyPoolBookToStudent(workspace.id, student.id, book.id, 3);
      added += 1;
    }
    if (added > 0) console.log(`${student.name}: added ${added} missing books`);

    const current = await db
      .select({
        id: resources.id,
        title: resources.title,
        unitType: resources.unitType,
        totalUnits: resources.totalUnits,
        subjectId: resources.subjectId,
        subjectTitle: subjects.title,
      })
      .from(resources)
      .innerJoin(subjects, eq(resources.subjectId, subjects.id))
      .where(eq(resources.studentId, student.id))
      .orderBy(asc(subjects.title), asc(resources.title));

    const random = rng(`${student.id}:resources`);
    const perSubjectCount = new Map<string, number>();
    for (const row of current) {
      const base = persona.base[row.subjectTitle] ?? 50;
      const ratioBase = clamp((base - 18) / 82, 0.12, 0.9);
      const grade = gradeOf(row.title) ?? "دوازدهم";
      const gradeFactor = GRADE_FACTOR[grade] ?? 1;
      const seen = perSubjectCount.get(row.subjectTitle) ?? 0;
      perSubjectCount.set(row.subjectTitle, seen + 1);
      const ratio = clamp(
        ratioBase * gradeFactor + (random() - 0.5) * 0.16 - seen * 0.03,
        0.05,
        0.95,
      );
      const priority = base < 45 ? 5 : base < 60 ? 4 : base < 72 ? 3 : 2;

      await db.update(resources).set({ priority }).where(eq(resources.id, row.id));
      const chapters = await db
        .select()
        .from(resourceChapters)
        .where(eq(resourceChapters.resourceId, row.id))
        .orderBy(asc(resourceChapters.sortIndex));
      for (const [index, chapter] of chapters.entries()) {
        const bias = clamp(1.12 - (index / Math.max(1, chapters.length)) * 0.45, 0.35, 1);
        const completedTests = Math.round(chapter.testCount * clamp(ratio * bias, 0, 1));
        const completedExercises = Math.round(chapter.exerciseCount * clamp(ratio * bias, 0, 1));
        const completedPages = Math.round(chapter.pages * clamp(ratio * bias, 0, 1));
        await db
          .update(resourceChapters)
          .set({
            completedTests: Math.min(chapter.testCount, completedTests),
            completedExercises: Math.min(chapter.exerciseCount, completedExercises),
            completedPages: Math.min(chapter.pages, completedPages),
          })
          .where(eq(resourceChapters.id, chapter.id));
      }
      await recomputeResourceTotals(db, row.id);
    }
    console.log(`${student.name}: resources=${current.length}`);
  }
}

async function programsForField(workspaceId: string) {
  const { db } = await context();
  await ensureMockExamCatalog(workspaceId);
  return db
    .select()
    .from(mockExamPrograms)
    .where(
      and(
        eq(mockExamPrograms.workspaceId, workspaceId),
        eq(mockExamPrograms.field, "تجربی"),
        eq(mockExamPrograms.grade, "دوازدهم"),
      ),
    )
    .orderBy(asc(mockExamPrograms.examDate));
}

function choosePastPrograms(programs: (typeof mockExamPrograms.$inferSelect)[]) {
  const byDate = new Map<string, (typeof mockExamPrograms.$inferSelect)[]>();
  for (const program of programs) {
    const list = byDate.get(program.examDate) ?? [];
    list.push(program);
    byDate.set(program.examDate, list);
  }
  const chosen: (typeof mockExamPrograms.$inferSelect)[] = [];
  for (const item of PAST_EXAMS) {
    const list = byDate.get(item.date) ?? [];
    const match = list.find((program) => program.provider === item.provider) ?? list[0];
    if (match) chosen.push(match);
  }
  return chosen;
}

function chooseFuturePrograms(programs: (typeof mockExamPrograms.$inferSelect)[]) {
  const byDate = new Map<string, (typeof mockExamPrograms.$inferSelect)[]>();
  for (const program of programs) {
    const list = byDate.get(program.examDate) ?? [];
    list.push(program);
    byDate.set(program.examDate, list);
  }
  const chosen: (typeof mockExamPrograms.$inferSelect)[] = [];
  FUTURE_DATES.forEach((date, index) => {
    const list = byDate.get(date) ?? [];
    if (list.length === 0) return;
    const provider = FUTURE_PROVIDERS[index % FUTURE_PROVIDERS.length];
    chosen.push(list.find((program) => program.provider === provider) ?? list[0]);
  });
  return chosen;
}

function subjectScoresFor(
  persona: Persona,
  examIndex: number,
  seed: string,
): ExamSubjectScore[] {
  const random = rng(`${seed}:exam:${examIndex}`);
  const difficulty = [0, -2, -1, 1, 0, 2, 1, 3][examIndex] ?? 0;
  return SUBJECTS.map((title) => {
    const base = persona.base[title] ?? 50;
    const percent = clamp(
      Math.round(base + persona.trend * examIndex + difficulty + (random() - 0.5) * 9),
      5,
      98,
    );
    const total = 40;
    const correct = Math.round((percent / 100) * total);
    const wrong = Math.round(((100 - percent) / 100) * total * 0.55);
    const blank = Math.max(0, total - correct - wrong);
    return { subjectId: null, subjectTitle: title, percent, correct, wrong, blank, total };
  });
}

async function stageExams() {
  const { db, workspace, members } = await context();
  const programs = await programsForField(workspace.id);
  const past = choosePastPrograms(programs);
  const future = chooseFuturePrograms(programs);
  const calendar = [...past, ...future];
  if (calendar.length === 0) throw new Error("mock calendar is empty");
  console.log(`calendar: ${past.length} past + ${future.length} future mocks (last ${calendar.at(-1)?.examDate})`);

  const studentIds = members.map((member) => member.id);
  await db.delete(studentMockExams).where(inArray(studentMockExams.studentId, studentIds));
  await db.delete(groupMockExams).where(eq(groupMockExams.groupId, members[0]!.groupId!));
  await db.delete(externalExams).where(inArray(externalExams.studentId, studentIds));
  await db.delete(examTargets).where(inArray(examTargets.studentId, studentIds));
  await db.delete(studyGoals).where(inArray(studyGoals.studentId, studentIds));

  await db
    .insert(groupMockExams)
    .values(calendar.map((program) => ({ groupId: members[0]!.groupId!, mockExamId: program.id })))
    .onConflictDoNothing();

  const subjectRows = await db
    .select({ id: subjects.id, title: subjects.title })
    .from(subjects)
    .where(eq(subjects.workspaceId, workspace.id));
  const subjectIdByTitle = new Map(subjectRows.map((row) => [row.title, row.id]));

  for (const student of members) {
    const persona = personaFor(student.name);
    const resultByProgram = new Map<string, string>();
    for (const [index, program] of past.entries()) {
      const scores = subjectScoresFor(persona, index, student.id).map((item) => ({
        ...item,
        subjectId: subjectIdByTitle.get(item.subjectTitle) ?? null,
      }));
      const [inserted] = await db
        .insert(externalExams)
        .values({
          workspaceId: workspace.id,
          studentId: student.id,
          title: program.title,
          examDate: program.examDate,
          examType: "mock",
          provider: program.provider,
          subjectsJson: scores,
          overallPercent: weightedOverall(scores),
          mockExamId: program.id,
          note: "کارنامه آزمون آزمایشی",
          createdBy: workspace.ownerId ?? null,
        })
        .returning({ id: externalExams.id });
      if (inserted) resultByProgram.set(program.id, inserted.id);
    }

    await db.insert(studentMockExams).values(
      calendar.map((program) => ({
        studentId: student.id,
        mockExamId: program.id,
        status: resultByProgram.has(program.id) ? ("taken" as const) : ("selected" as const),
        source: "group" as const,
        resultExamId: resultByProgram.get(program.id) ?? null,
      })),
    ).onConflictDoNothing();

    const latest = await db
      .select({ subjectsJson: externalExams.subjectsJson })
      .from(externalExams)
      .where(eq(externalExams.studentId, student.id))
      .orderBy(asc(externalExams.examDate));
    const latestScores = new Map<string, number>();
    for (const row of latest) {
      for (const item of row.subjectsJson ?? []) {
        latestScores.set(item.subjectTitle, item.percent);
      }
    }

    await db.insert(studyGoals).values(
      SUBJECTS.map((title) => {
        const subjectId = subjectIdByTitle.get(title);
        if (!subjectId) throw new Error(`subject missing: ${title}`);
        const current = latestScores.get(title) ?? persona.base[title] ?? 40;
        const target = persona.goals[title] ?? Math.min(95, current + 14);
        return {
          studentId: student.id,
          subjectId,
          metric: "percent" as const,
          currentValue: current,
          targetValue: Math.max(current + 5, target),
          weight: SUBJECT_WEIGHT[title] >= 7 ? 4 : 3,
        };
      }),
    );

    const nextMock = future[0] ?? past.at(-1)!;
    await db.insert(examTargets).values([
      {
        studentId: student.id,
        title: `آزمون آزمایشی بعدی — ${nextMock.provider}`,
        examType: "mock" as const,
        examDate: nextMock.examDate,
        weight: 4,
      },
      {
        studentId: student.id,
        title: "آزمون جامع بهار",
        examType: "mock" as const,
        examDate: "2027-04-07",
        weight: 4,
      },
      {
        studentId: student.id,
        title: "امتحانات نهایی خرداد",
        examType: "final" as const,
        examDate: "2027-06-01",
        weight: 5,
      },
      {
        studentId: student.id,
        title: "کنکور سراسری ۱۴۰۶",
        examType: "konkur" as const,
        examDate: "2027-07-02",
        weight: 5,
      },
    ]);

    const lastProgram = calendar.at(-1)!;
    await db
      .insert(planningSettings)
      .values({
        studentId: student.id,
        targetDate: lastProgram.examDate,
        goalMockExamId: lastProgram.id,
        studentLevel: persona.level,
        analysisMinutesPerExam: 120,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: planningSettings.studentId,
        set: {
          targetDate: lastProgram.examDate,
          goalMockExamId: lastProgram.id,
          studentLevel: persona.level,
          analysisMinutesPerExam: 120,
          updatedAt: new Date(),
        },
      });

    console.log(`${student.name}: ${past.length} past exams, target ${persona.target}`);
  }
}

async function stageAvailability() {
  const { db, members } = await context();
  const studentIds = members.map((member) => member.id);
  await db.delete(availability).where(inArray(availability.studentId, studentIds));
  await db.delete(studentConstraints).where(inArray(studentConstraints.studentId, studentIds));
  for (const student of members) {
    const persona = personaFor(student.name);
    const schoolDays = new Set(schoolWeekdaysForGrade(student.grade));
    const windows: { weekday: number; startMin: number; endMin: number }[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      if (schoolDays.has(weekday)) {
        windows.push({ weekday, startMin: 6 * 60 + 30, endMin: 7 * 60 + 30 });
        windows.push({ weekday, startMin: 15 * 60 + 30, endMin: 23 * 60 });
      } else {
        windows.push({ weekday, startMin: 14 * 60, endMin: 23 * 60 });
      }
    }
    await db.insert(availability).values(windows.map((window) => ({ studentId: student.id, ...window })));
    await db.insert(studentConstraints).values({
      studentId: student.id,
      maxDailyMinutes: Math.max(420, persona.capacity),
      restWeekday: -1,
      bufferPct: 0,
    });
  }
  console.log(`availability refreshed for ${members.length} students (all 7 days, rest=-1)`);
}

async function stagePlan() {
  const { db, workspace, counselor, members } = await context();
  const currentWeek = startOfWeekSaturday(todayISO());
  const studentIds = members.map((member) => member.id);

  const existingPlans = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(inArray(plans.studentId, studentIds), gte(plans.weekStart, currentWeek)));
  if (existingPlans.length > 0) {
    await db.delete(tasks).where(inArray(tasks.planId, existingPlans.map((plan) => plan.id)));
    await db.delete(plans).where(inArray(plans.id, existingPlans.map((plan) => plan.id)));
  }
  await db
    .delete(weeklyPanels)
    .where(and(inArray(weeklyPanels.studentId, studentIds), gte(weeklyPanels.weekStart, currentWeek)));

  for (const student of members) {
    const persona = personaFor(student.name);
    const generatedContext = await getAutoPlanContext(workspace.id, student.id);
    if (!generatedContext) {
      console.warn(`${student.name}: no auto-plan context`);
      continue;
    }
    const targetDate = generatedContext.targetDate ?? "2027-07-01";
    const counseling = await getLatestCounselingReport(student.id).catch(() => null);
    const counselingNotes = counseling
      ? [
          counseling.planningAdvice.join("؛ "),
          counseling.recommendations.join("، "),
        ]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 900)
      : "";
    const input = {
      startDate: todayISO(),
      targetDate,
      availability: generatedContext.detail.availability.map((slot) => ({
        weekday: slot.weekday,
        startMin: slot.startMin,
        endMin: slot.endMin,
      })),
      constraints: {
        maxDailyMinutes: Math.max(420, persona.capacity),
        restWeekday: -1,
        bufferPct: 0,
      },
      goals: generatedContext.goals,
      resources: generatedContext.detail.resources.map((resource) => ({
        id: resource.id,
        subjectId: resource.subjectId,
        subjectTitle: resource.subjectTitle,
        title: resource.title,
        unitType: resource.unitType,
        totalUnits: resource.totalUnits,
        completedUnits: resource.completedUnits,
        priority: resource.priority,
        chapters: resource.chapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          pages: chapter.pages,
          startPage: chapter.pageStart ?? 1,
          endPage: chapter.pageEnd ?? chapter.pages,
          testCount: chapter.testCount,
          completedTests: chapter.completedTests,
          exerciseCount: chapter.exerciseCount,
          completedExercises: chapter.completedExercises,
        })),
      })),
      policy: {
        ...generatedContext.policy,
        fillCapacity: true,
        maxBlockMinutes: 60,
        maxSubjectsPerDay: 3,
        notes: [generatedContext.policy.notes, counselingNotes]
          .filter(Boolean)
          .join(" ")
          .slice(0, 900),
      },
      schoolPeriods: generatedContext.schoolPeriods,
      exams: generatedContext.mockExams.map((program) => ({
        id: program.id,
        title: program.title,
        date: program.examDate,
        startMin: program.startMin,
        durationMinutes: program.durationMinutes,
        analysisMinutes: generatedContext.analysisMinutesPerExam || program.analysisMinutes,
        budget: (program.budgetJson ?? []).map((item) => ({
          subjectTitle: item.subjectTitle,
          chapters: item.chapters,
          weight: item.weight,
        })),
      })),
      level: generatedContext.level,
      subjectSpeeds: generatedContext.subjectSpeeds,
      goalExamId: generatedContext.goalExamId,
      systemSubjectId: generatedContext.systemSubjectId,
    } satisfies Parameters<typeof buildDeterministicAllocation>[0];

    const generated = scheduleAutoPlan(input, buildDeterministicAllocation(input));
    const today = todayISO();
    const fallbackResource = generatedContext.detail.resources.find(
      (resource) => resource.chapters.length > 0,
    ) ?? generatedContext.detail.resources[0];
    for (const week of generated.weeks) {
      for (const date of weekDates(week.weekStart)) {
        if (date < today) continue;
        const dayTasks = week.tasks.filter((task) => task.planDate === date);
        const lastEnd = dayTasks.reduce((max, task) => Math.max(max, task.plannedEnd), 0);
        if (lastEnd >= 20 * 60) continue;
        const start = Math.max(lastEnd + 5, 19 * 60);
        const end = 20 * 60 + 30;
        if (end - start < 30 || !fallbackResource) continue;
        const chapter = fallbackResource.chapters[0];
        week.tasks.push({
          planDate: date,
          plannedStart: start,
          plannedEnd: end,
          subjectId: fallbackResource.subjectId,
          resourceId: fallbackResource.id,
          chapterId: chapter?.id ?? null,
          resourceText: chapter?.title ?? fallbackResource.title,
          topic: chapter?.title ?? fallbackResource.title,
          type: "review",
          actionKind: "review",
          routineMode: null,
          targetUnits: 0,
          estMinutes: end - start,
          mockExamId: null,
        });
      }
    }
    let weeks = 0;
    let taskCount = 0;
    for (const week of generated.weeks) {
      if (week.weekStart < currentWeek) continue;
      const [created] = await db
        .insert(plans)
        .values({
          studentId: student.id,
          weekStart: week.weekStart,
          status: "approved",
          version: 1,
          warningsJson: week.warnings.slice(0, 12),
          approvedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [plans.studentId, plans.weekStart],
          set: {
            status: "approved",
            version: 1,
            warningsJson: week.warnings.slice(0, 12),
            approvedAt: new Date(),
          },
        })
        .returning({ id: plans.id });
      if (!created) continue;
      if (week.tasks.length > 0) {
        await db.insert(tasks).values(
          week.tasks.map((task) => ({
            planId: created.id,
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
        taskCount += week.tasks.length;
      }
      await saveGeneratedPanel({
        studentId: student.id,
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
        actorId: counselor.id,
      });
      weeks += 1;
    }
    console.log(`${student.name}: ${weeks} weeks / ${taskCount} tasks → ${targetDate}`);
  }
}

async function stagePerformance() {
  const { members } = await context();
  const result = await seedPerformanceData({ studentIds: members.map((member) => member.id) });
  console.log(`performance panels=${result.panels}, daily logs=${result.logs}`);
}

async function stageCollections() {
  const { db, workspace, members, subjectRows } = await context();
  const subjectIdByTitle = new Map(subjectRows.map((row) => [row.title, row.id]));
  const userIds = members.map((member) => member.userId).filter((id): id is string => Boolean(id));
  if (userIds.length > 0) {
    await db.delete(questionCollections).where(inArray(questionCollections.userId, userIds));
  }

  for (const student of members) {
    if (!student.userId) continue;
    const persona = personaFor(student.name);
    const latest = await db
      .select({ subjectsJson: externalExams.subjectsJson })
      .from(externalExams)
      .where(eq(externalExams.studentId, student.id))
      .orderBy(asc(externalExams.examDate));
    const latestScores = new Map<string, number>();
    for (const row of latest) {
      for (const item of row.subjectsJson ?? []) latestScores.set(item.subjectTitle, item.percent);
    }
    const weakest = [...SUBJECTS]
      .sort(
        (a, b) =>
          (latestScores.get(a) ?? persona.base[a] ?? 40) -
          (latestScores.get(b) ?? persona.base[b] ?? 40),
      )
      .slice(0, 2);

    for (const [index, title] of weakest.entries()) {
      const subjectId = subjectIdByTitle.get(title);
      if (!subjectId) continue;
      const picked = await db
        .select({ id: questions.id })
        .from(questions)
        .where(
          and(
            eq(questions.workspaceId, workspace.id),
            eq(questions.subjectId, subjectId),
            eq(questions.status, "active"),
            isNotNull(questions.correctJson),
          ),
        )
        .orderBy(asc(questions.difficulty), asc(questions.id))
        .limit(28);
      if (picked.length === 0) continue;

      const [collection] = await db
        .insert(questionCollections)
        .values({
          workspaceId: workspace.id,
          userId: student.userId,
          title:
            index === 0
              ? `مرور و جبران ${title} — ${persona.target}`
              : `تست‌های زمان‌دار ${title}`,
          description:
            index === 0
              ? "مجموعه شخصی بر اساس کارنامه آزمون‌های آزمایشی؛ تمرکز روی ضعیف‌ترین درس."
              : "گزیده تست‌های زمان‌دار برای افزایش سرعت و دقت در درس دومِ ضعیف.",
        })
        .returning();
      await db
        .insert(questionCollectionItems)
        .values(picked.map((question) => ({ collectionId: collection.id, questionId: question.id })))
        .onConflictDoNothing();
      console.log(`${student.name}: collection «${collection.title}» → ${picked.length} questions`);
    }
  }
}

async function main() {
  if (STAGES.has("resources")) await stageResources();
  if (STAGES.has("exams")) {
    await stageExams();
    await stageAvailability();
  }
  if (STAGES.has("availability")) await stageAvailability();
  if (STAGES.has("plan")) await stagePlan();
  if (STAGES.has("performance")) await stagePerformance();
  if (STAGES.has("collections")) await stageCollections();
  console.log("done");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
