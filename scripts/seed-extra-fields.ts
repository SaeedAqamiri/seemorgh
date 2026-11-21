import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  availability,
  dailyLogs,
  examTargets,
  performancePanels,
  resourceChapters,
  resources,
  studentConstraints,
  studentGroups,
  students,
  subjects,
  users,
  weeklyPanels,
  workspaces,
  type PanelCellJson,
  type PerformanceCellJson,
  type PerformanceGridJson,
  type WeeklyGridJson,
} from "../src/db/schema";
import {
  addDays,
  startOfWeekSaturday,
  tehranDateTime,
  todayISO,
  weekDates,
  weekdayIndex,
} from "../src/lib/dates";
import { hashPassword } from "../src/lib/password";
import { PANEL_SLOTS } from "../src/lib/panel";
import { ensureSubjectCatalog } from "../src/lib/subject-catalog";
import { recomputeResourceTotals } from "../src/lib/resource-chapters";
import { availabilityForGrade, STUDY_CONSTRAINTS } from "../src/lib/study-windows";

const PASSWORD = "seemorgh123";

type Grade = "دهم" | "یازدهم" | "دوازدهم";
type ChapterDef = [title: string, count: number];
type BookDef = { subject: string; title: string; chapters: ChapterDef[] };

const GROUPS = [
  {
    name: "مدرسه علامه طباطبایی",
    field: "ریاضی",
    emoji: "🏛️",
    color: "#0e7490",
  },
  {
    name: "مؤسسه مشاوره دکتر اصغری",
    field: "انسانی",
    emoji: "📖",
    color: "#b45309",
  },
] as const;

const MATH_STUDENTS: { name: string; grade: Grade }[] = [
  { name: "آرمان صادقی", grade: "دهم" },
  { name: "پویا مهربان", grade: "یازدهم" },
  { name: "سامان رفیعی", grade: "دوازدهم" },
  { name: "متین اکبری", grade: "دهم" },
  { name: "امیرعلی زمانی", grade: "یازدهم" },
  { name: "کیانا شریفی", grade: "دوازدهم" },
  { name: "نیلوفر احمدی", grade: "دهم" },
  { name: "ستایش کریمی", grade: "یازدهم" },
  { name: "محمدرضا سلطانی", grade: "دوازدهم" },
  { name: "حسین مرادی", grade: "دوازدهم" },
];

const HUMANITIES_STUDENTS: { name: string; grade: Grade }[] = [
  { name: "درسا محمدی", grade: "دهم" },
  { name: "مبینا حسینی", grade: "یازدهم" },
  { name: "زهرا کاظمی", grade: "دوازدهم" },
  { name: "یاسمن رستمی", grade: "دهم" },
  { name: "ریحانه اکبری", grade: "یازدهم" },
  { name: "نازنین صادقی", grade: "دوازدهم" },
  { name: "عرفان مرادی", grade: "دهم" },
  { name: "امیرمحمد نوری", grade: "یازدهم" },
  { name: "محمدطاها رحیمی", grade: "دوازدهم" },
  { name: "سیدعلی موسوی", grade: "دهم" },
  { name: "فاطمه احمدی", grade: "یازدهم" },
  { name: "مرسانا کریمی", grade: "دوازدهم" },
  { name: "آیدا شریفی", grade: "دهم" },
  { name: "هستی قاسمی", grade: "یازدهم" },
  { name: "سوگند رضایی", grade: "دوازدهم" },
];

function generalBooks(grade: Grade, suffix: string): BookDef[] {
  return [
    {
      subject: "ادبیات فارسی",
      title: `ادبیات فارسی ${suffix} — تمرین تشریحی`,
      chapters: [
        ["ادبیات تعلیمی", 90],
        ["ادبیات پایداری", 80],
        ["ادبیات غنایی", 80],
      ],
    },
    {
      subject: "عربی",
      title: `عربی ${suffix} — تمرین تشریحی`,
      chapters: [
        ["قواعد و ترجمه", 80],
        ["متن و واژگان", 70],
        ["تمرینهای ترکیبی", 50],
      ],
    },
    {
      subject: "دین و زندگی",
      title: `دین و زندگی ${suffix} — تمرین تشریحی`,
      chapters: [
        ["درسهای اعتقادی", 90],
        ["درسهای اخلاقی", 70],
        ["درسهای اجتماعی", 60],
      ],
    },
    {
      subject: "زبان انگلیسی",
      title: `زبان انگلیسی ${suffix} — تمرین تشریحی`,
      chapters: [
        ["Reading", 90],
        ["Vocabulary", 70],
        ["Grammar", 70],
      ],
    },
  ];
}

const MATH_BOOKS: Record<Grade, BookDef[]> = {
  دهم: [
    {
      subject: "حسابان",
      title: "ریاضی ۱ — تست خیلی سبز",
      chapters: [
        ["مجموعه، الگو و دنباله", 180],
        ["مثلثات", 200],
        ["آمار و احتمال", 120],
      ],
    },
    {
      subject: "هندسه",
      title: "هندسه ۱ — تست گاج",
      chapters: [
        ["ترسیمهای هندسی و استدلال", 120],
        ["قضیه تالس و تشابه", 150],
        ["چندضلعیها", 130],
      ],
    },
    {
      subject: "فیزیک",
      title: "فیزیک ۱ — تست الگو",
      chapters: [
        ["فیزیک و اندازهگیری", 80],
        ["کار، انرژی و توان", 130],
        ["ویژگیهای فیزیکی مواد", 120],
        ["دما و گرما", 120],
      ],
    },
    {
      subject: "شیمی",
      title: "شیمی ۱ — تست مبتکران",
      chapters: [
        ["کیهان، زادگاه الفبای هستی", 100],
        ["ردپای گازها در زندگی", 90],
        ["آب، آهنگ زندگی", 110],
        ["استوکیومتری", 150],
      ],
    },
    ...generalBooks("دهم", "۱"),
  ],
  یازدهم: [
    {
      subject: "حسابان",
      title: "حسابان ۱ — تست خیلی سبز",
      chapters: [
        ["جبر و معادله", 200],
        ["تابع", 240],
        ["توابع نمایی و لگاریتمی", 180],
        ["مثلثات", 200],
      ],
    },
    {
      subject: "هندسه",
      title: "هندسه ۲ — تست گاج",
      chapters: [
        ["دایره", 180],
        ["تبدیلهای هندسی", 160],
        ["مساحت و حجم", 150],
      ],
    },
    {
      subject: "آمار و احتمال",
      title: "آمار و احتمال — تست خیلی سبز",
      chapters: [
        ["آشنایی با مبانی ریاضیات", 100],
        ["احتمال", 160],
        ["آمار", 140],
      ],
    },
    {
      subject: "فیزیک",
      title: "فیزیک ۲ — تست الگو",
      chapters: [
        ["الکتریسیته ساکن", 150],
        ["جریان الکتریکی", 140],
        ["مغناطیس", 130],
        ["القای الکترومغناطیسی", 120],
      ],
    },
    {
      subject: "شیمی",
      title: "شیمی ۲ — تست مبتکران",
      chapters: [
        ["قدر هدایای زمینی", 120],
        ["در پی غذای سالم", 130],
        ["پوشاک، نیازی پایانناپذیر", 120],
        ["مول و واکنش", 150],
      ],
    },
    ...generalBooks("یازدهم", "۲"),
  ],
  دوازدهم: [
    {
      subject: "حسابان",
      title: "حسابان ۲ — تست خیلی سبز",
      chapters: [
        ["تابع", 200],
        ["مثلثات", 180],
        ["حد", 200],
        ["مشتق", 240],
        ["کاربرد مشتق", 180],
      ],
    },
    {
      subject: "هندسه",
      title: "هندسه ۳ — تست گاج",
      chapters: [
        ["دایره", 170],
        ["تبدیلهای هندسی", 160],
        ["بردارها", 170],
      ],
    },
    {
      subject: "گسسته",
      title: "ریاضیات گسسته — تست خیلی سبز",
      chapters: [
        ["گراف و مدلسازی", 160],
        ["آمار و احتمال", 140],
        ["نظریه اعداد", 150],
      ],
    },
    {
      subject: "فیزیک",
      title: "فیزیک ۳ — تست الگو",
      chapters: [
        ["حرکت بر خط راست", 150],
        ["دینامیک", 160],
        ["نوسان و امواج", 140],
        ["برق و مدار", 150],
        ["فیزیک اتمی", 100],
      ],
    },
    {
      subject: "شیمی",
      title: "شیمی ۳ — تست مبتکران",
      chapters: [
        ["مولکولها در خدمت تندرستی", 120],
        ["آسایش و رفاه", 120],
        ["شیمی جلوتر از زمان", 120],
        ["سفر غذا", 130],
      ],
    },
    ...generalBooks("دوازدهم", "۳"),
  ],
};

const HUMANITIES_BOOKS: Record<Grade, BookDef[]> = {
  دهم: [
    {
      subject: "ریاضی و آمار",
      title: "ریاضی و آمار ۱ — تست خیلی سبز",
      chapters: [
        ["معادله درجه دوم", 120],
        ["تابع", 100],
        ["آمار", 80],
      ],
    },
    {
      subject: "علوم و فنون ادبی",
      title: "علوم و فنون ادبی ۱ — تست گاج",
      chapters: [
        ["مبانی تحلیل متن", 120],
        ["ساختار و معنا", 110],
        ["آرایههای ادبی", 130],
      ],
    },
    {
      subject: "تاریخ",
      title: "تاریخ ۱ — تست الگو",
      chapters: [
        ["تاریخ ایران و جهان", 150],
        ["تمدنهای باستانی", 140],
      ],
    },
    {
      subject: "جغرافیا",
      title: "جغرافیا ۱ — تست گاج",
      chapters: [
        ["جغرافیای ایران", 150],
        ["ناهمواریها و اقلیم", 140],
      ],
    },
    {
      subject: "جامعه‌شناسی",
      title: "جامعه‌شناسی ۱ — تست خیلی سبز",
      chapters: [
        ["کنش اجتماعی", 120],
        ["جهان اجتماعی", 110],
      ],
    },
    {
      subject: "منطق",
      title: "منطق — تست خیلی سبز",
      chapters: [
        ["منطق و تفکر", 140],
        ["استدلال", 130],
      ],
    },
    ...generalBooks("دهم", "۱"),
  ],
  یازدهم: [
    {
      subject: "ریاضی و آمار",
      title: "ریاضی و آمار ۲ — تست خیلی سبز",
      chapters: [
        ["آمار و احتمال", 140],
        ["الگوها و توابع", 120],
      ],
    },
    {
      subject: "علوم و فنون ادبی",
      title: "علوم و فنون ادبی ۲ — تست گاج",
      chapters: [
        ["زیباییشناسی", 130],
        ["نقد و تحلیل", 120],
      ],
    },
    {
      subject: "تاریخ",
      title: "تاریخ ۲ — تست الگو",
      chapters: [
        ["ایران در دوره اسلامی", 160],
        ["جهان در قرون میانه", 140],
      ],
    },
    {
      subject: "جغرافیا",
      title: "جغرافیا ۲ — تست گاج",
      chapters: [
        ["نظامهای جغرافیایی", 150],
        ["محیط و انسان", 130],
      ],
    },
    {
      subject: "جامعه‌شناسی",
      title: "جامعه‌شناسی ۲ — تست خیلی سبز",
      chapters: [
        ["نهادهای اجتماعی", 140],
        ["تغییرات اجتماعی", 120],
      ],
    },
    {
      subject: "روان‌شناسی",
      title: "روان‌شناسی — تست گاج",
      chapters: [
        ["روان‌شناسی و زندگی", 150],
        ["یادگیری و حافظه", 130],
      ],
    },
    {
      subject: "فلسفه",
      title: "فلسفه ۱ — تست الگو",
      chapters: [
        ["فلسفه و تفکر", 130],
        ["هستی و معرفت", 120],
      ],
    },
    ...generalBooks("یازدهم", "۲"),
  ],
  دوازدهم: [
    {
      subject: "ریاضی و آمار",
      title: "ریاضی و آمار ۳ — تست خیلی سبز",
      chapters: [
        ["تابع و مدلسازی", 120],
        ["آمار و احتمال", 140],
      ],
    },
    {
      subject: "علوم و فنون ادبی",
      title: "علوم و فنون ادبی ۳ — تست گاج",
      chapters: [
        ["تحلیل متون", 150],
        ["شعر و نثر", 130],
      ],
    },
    {
      subject: "تاریخ",
      title: "تاریخ ۳ — تست الگو",
      chapters: [
        ["ایران معاصر", 170],
        ["جهان معاصر", 150],
      ],
    },
    {
      subject: "جغرافیا",
      title: "جغرافیا ۳ — تست گاج",
      chapters: [
        ["جغرافیای کاربردی", 150],
        ["برنامهریزی", 130],
      ],
    },
    {
      subject: "جامعه‌شناسی",
      title: "جامعه‌شناسی ۳ — تست خیلی سبز",
      chapters: [
        ["هویت و فرهنگ", 140],
        ["جهانیشدن", 130],
      ],
    },
    {
      subject: "فلسفه",
      title: "فلسفه ۲ — تست الگو",
      chapters: [
        ["فلسفه اسلامی", 140],
        ["فلسفه غرب", 130],
      ],
    },
    {
      subject: "اقتصاد",
      title: "اقتصاد — تست خیلی سبز",
      chapters: [
        ["اقتصاد خرد", 120],
        ["اقتصاد کلان", 130],
      ],
    },
    ...generalBooks("دوازدهم", "۳"),
  ],
};

const NOTES = [
  "",
  "تمرکز خوبی داشتم",
  "کمی خسته بودم",
  "با تایمر زدم",
  "سریعتر از برنامه تمام شد",
  "نزدیک پایان حوصله‌ام سر رفت",
  "وسطش گوشی چک کردم",
  "امروز پرانرژی بودم",
];

function hashSeed(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function makeRandom(seed: string): () => number {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: { value: T; weight: number }[], random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

type SubjectActivity = {
  subjectId: string;
  title: string;
  kind: string;
  unitType: "test" | "exercise";
  resources: { id: string; chapterIds: string[] }[];
  bias: number;
};

type DayMode = "full" | "good" | "partial" | "poor" | "off";

function dayMode(random: () => number): { mode: DayMode; doneRate: number } {
  const value = random();
  if (value < 0.16) return { mode: "full", doneRate: 0.96 };
  if (value < 0.52) return { mode: "good", doneRate: 0.84 };
  if (value < 0.78) return { mode: "partial", doneRate: 0.62 };
  if (value < 0.92) return { mode: "poor", doneRate: 0.32 };
  return { mode: "off", doneRate: 0.05 };
}

function activityCount(mode: DayMode): number {
  if (mode === "full") return 4;
  if (mode === "good") return 3;
  if (mode === "partial") return 2;
  if (mode === "poor") return 1;
  return 0;
}

async function main() {
  const db = await getDb();
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, "دفتر مشاوره نمونه"))
    .limit(1);
  if (!workspace) throw new Error("workspace missing; run `bun run db:seed` first");
  const [counselor] = await db
    .select()
    .from(users)
    .where(and(eq(users.workspaceId, workspace.id), eq(users.role, "counselor")))
    .limit(1);
  if (!counselor) throw new Error("counselor missing");

  await ensureSubjectCatalog(workspace.id);
  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, workspace.id));
  const subjectByTitle = new Map(subjectRows.map((subject) => [subject.title, subject]));

  for (const group of GROUPS) {
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

  const mathPhones = MATH_STUDENTS.map((_, index) => `09124${String(index + 1).padStart(6, "0")}`);
  const humanitiesPhones = HUMANITIES_STUDENTS.map(
    (_, index) => `09125${String(index + 1).padStart(6, "0")}`,
  );
  const allPhones = [...mathPhones, ...humanitiesPhones];

  await db.delete(students).where(inArray(students.phone, allPhones));
  await db.delete(users).where(inArray(users.phone, allPhones));

  const today = todayISO();
  const currentWeek = startOfWeekSaturday(today);
  const todayIndex = weekdayIndex(today);
  const tracks = ["konkur", "final", "both"] as const;

  let resourceTotal = 0;
  let chapterTotal = 0;
  let panelTotal = 0;

  const cohorts: {
    defs: { name: string; grade: Grade }[];
    phones: string[];
    field: "ریاضی" | "انسانی";
    books: Record<Grade, BookDef[]>;
    groupId: string | null;
  }[] = [
    {
      defs: MATH_STUDENTS,
      phones: mathPhones,
      field: "ریاضی",
      books: MATH_BOOKS,
      groupId: groupIdByName("مدرسه علامه طباطبایی"),
    },
    {
      defs: HUMANITIES_STUDENTS,
      phones: humanitiesPhones,
      field: "انسانی",
      books: HUMANITIES_BOOKS,
      groupId: groupIdByName("مؤسسه مشاوره دکتر اصغری"),
    },
  ];

  for (const cohort of cohorts) {
    for (const [index, def] of cohort.defs.entries()) {
      const phone = cohort.phones[index];
      const random = makeRandom(`${phone}-extra-student`);
      const track = tracks[index % tracks.length];
      const restWeekday = index % 2 === 0 ? 6 : 5;

      const [user] = await db
        .insert(users)
        .values({
          workspaceId: workspace.id,
          role: "student",
          name: def.name,
          phone,
          passwordHash: hashPassword(PASSWORD),
        })
        .returning();
      const [student] = await db
        .insert(students)
        .values({
          workspaceId: workspace.id,
          groupId: cohort.groupId,
          counselorId: counselor.id,
          userId: user.id,
          name: def.name,
          phone,
          grade: def.grade,
          field: cohort.field,
          track,
          guardianPhone: index % 3 === 0 ? null : `0935${String(1000000 + index * 37).slice(0, 7)}`,
          inviteCode: randomUUID().replace(/-/g, "").slice(0, 12),
          status: "active",
        })
        .returning();

      await db.insert(studentConstraints).values({
        studentId: student.id,
        restWeekday,
        ...STUDY_CONSTRAINTS,
      });
      await db.insert(availability).values(
        availabilityForGrade(def.grade, restWeekday).map((slot) => ({
          studentId: student.id,
          ...slot,
        })),
      );
      await db.insert(examTargets).values([
        {
          studentId: student.id,
          title: "کنکور ۱۴۰۶",
          examType: "konkur",
          examDate: addDays(today, 150 + (index % 5) * 7),
          weight: 5,
        },
        {
          studentId: student.id,
          title: "امتحانات نهایی",
          examType: "final",
          examDate: addDays(today, 80 + (index % 4) * 5),
          weight: pick([4, 5], random),
        },
        {
          studentId: student.id,
          title: "آزمون آزمایشی",
          examType: "mock",
          examDate: addDays(today, 12 + (index % 3) * 7),
          weight: 4,
        },
      ]);

      const activities: SubjectActivity[] = [];
      const books = cohort.books[def.grade];
      for (const book of books) {
        const subject = subjectByTitle.get(book.subject);
        if (!subject) throw new Error(`subject missing: ${book.subject}`);
        const unitType = subject.kind === "general" ? "exercise" : "test";
        const chapterShare = 0.08 + random() * 0.66;

        const [resource] = await db
          .insert(resources)
          .values({
            workspaceId: workspace.id,
            studentId: student.id,
            subjectId: subject.id,
            title: book.title,
            unitType,
            totalUnits: book.chapters.reduce((sum, chapter) => sum + chapter[1], 0),
            completedUnits: 0,
            priority: 3 + Math.floor(random() * 3),
          })
          .returning();
        resourceTotal += 1;

        const chapterRows = await db
          .insert(resourceChapters)
          .values(
            book.chapters.map((chapter, chapterIndex) => {
              const count = chapter[1];
              const completed = Math.min(count, Math.round(count * chapterShare * (0.85 + random() * 0.3)));
              return {
                resourceId: resource.id,
                title: chapter[0],
                sortIndex: chapterIndex,
                pageStart: null,
                pageEnd: null,
                pages: 0,
                completedPages: 0,
                testCount: unitType === "test" ? count : 0,
                completedTests: unitType === "test" ? completed : 0,
                exerciseCount: unitType === "exercise" ? count : 0,
                completedExercises: unitType === "exercise" ? completed : 0,
              };
            }),
          )
          .returning({ id: resourceChapters.id, title: resourceChapters.title });
        chapterTotal += chapterRows.length;
        await recomputeResourceTotals(db, resource.id);

        const title = book.title.split(" — ")[0];
        const existing = activities.find((activity) => activity.subjectId === subject.id);
        const payload = {
          id: resource.id,
          chapterIds: chapterRows.map((chapter) => chapter.id),
        };
        if (existing) {
          existing.resources.push(payload);
        } else {
          activities.push({
            subjectId: subject.id,
            title,
            kind: subject.kind,
            unitType,
            resources: [payload],
            bias: 0.6 + random() * 1.1,
          });
        }
      }

      const strength = 0.7 + random() * 0.9;
      const weekCount = 8 + Math.floor(random() * 4);
      for (let weekOffset = weekCount - 1; weekOffset >= 0; weekOffset -= 1) {
        const weekStart = addDays(currentWeek, -weekOffset * 7);
        const isCurrentWeek = weekOffset === 0;
        const planGrid: WeeklyGridJson = [];
        const perfGrid: PerformanceGridJson = [];
        const weekRandom = makeRandom(`${phone}-${weekStart}`);

        for (let day = 0; day < 7; day += 1) {
          const isRest = day === restWeekday;
          const isFuture = isCurrentWeek && day > todayIndex;
          const { mode, doneRate } = dayMode(weekRandom);
          const planRow: PanelCellJson[] = Array.from({ length: PANEL_SLOTS.length }, () => ({
            kind: "empty",
          }));
          const perfRow: PerformanceCellJson[] = Array.from({ length: PANEL_SLOTS.length }, () => ({
            kind: "empty",
          }));

          if (isRest) {
            for (let slot = 0; slot < PANEL_SLOTS.length; slot += 1) {
              planRow[slot] = { kind: "rest" };
              perfRow[slot] = isFuture ? { kind: "empty" } : { kind: "rest" };
            }
            planGrid.push(planRow);
            perfGrid.push(perfRow);
            continue;
          }

          const count = Math.min(PANEL_SLOTS.length, activityCount(mode) + (weekRandom() < 0.2 ? 1 : 0));
          const slotIndexes = new Set<number>();
          while (slotIndexes.size < count) {
            const slot = 2 + Math.floor(weekRandom() * (PANEL_SLOTS.length - 2));
            slotIndexes.add(slot);
          }

          let firstStart: number | null = null;
          for (const slotIndex of [...slotIndexes].sort((a, b) => a - b)) {
            const slot = PANEL_SLOTS[slotIndex];
            const activity = pickWeighted(
              activities.map((item) => ({ value: item, weight: item.bias })),
              weekRandom,
            );
            const resource = pick(activity.resources, weekRandom);
            const chapterId = resource.chapterIds.length
              ? pick(resource.chapterIds, weekRandom)
              : null;
            const isReview = activity.unitType === "test" ? weekRandom() < 0.22 : weekRandom() < 0.15;
            const plannedCount =
              activity.unitType === "test"
                ? Math.max(8, Math.round((14 + weekRandom() * 34) * activity.bias * strength))
                : Math.max(5, Math.round((8 + weekRandom() * 26) * activity.bias * strength));
            const slotMinutes = slot.endMin - slot.startMin;
            const minutes = Math.max(
              20,
              Math.round(slotMinutes * (0.55 + weekRandom() * 0.4)),
            );
            const note = weekRandom() < 0.75 ? pick(NOTES, weekRandom) : "";

            if (isReview) {
              planRow[slotIndex] = {
                kind: "review",
                subjectId: activity.subjectId,
                resourceText: `${activity.title} — مرور`,
              };
              if (!isFuture && weekRandom() < doneRate) {
                perfRow[slotIndex] = {
                  kind: "review",
                  subjectId: activity.subjectId,
                  resourceText: `${activity.title} — مرور`,
                  minutes,
                  note,
                };
                firstStart = firstStart === null ? slot.startMin : Math.min(firstStart, slot.startMin);
              }
            } else {
              planRow[slotIndex] = {
                kind: activity.unitType,
                subjectId: activity.subjectId,
                resourceId: resource.id,
                chapterId,
                count: plannedCount,
              };
              if (!isFuture && weekRandom() < doneRate) {
                const doneCount = Math.max(
                  3,
                  Math.round(plannedCount * (0.7 + weekRandom() * 0.3)),
                );
                perfRow[slotIndex] = {
                  kind: activity.unitType,
                  subjectId: activity.subjectId,
                  resourceId: resource.id,
                  chapterId,
                  count: doneCount,
                  minutes,
                  note,
                };
                firstStart = firstStart === null ? slot.startMin : Math.min(firstStart, slot.startMin);
              }
            }
          }

          planGrid.push(planRow);
          perfGrid.push(perfRow);

          if (!isFuture && firstStart !== null) {
            const openedMin = Math.max(
              5 * 60,
              Math.min(22 * 60, firstStart + Math.round((weekRandom() - 0.5) * 50)),
            );
            await db
              .insert(dailyLogs)
              .values({
                studentId: student.id,
                logDate: datesFor(weekStart, day),
                firstOpenedAt: tehranDateTime(datesFor(weekStart, day), openedMin),
                challengeCompletedAt:
                  weekRandom() < 0.8
                    ? new Date(tehranDateTime(datesFor(weekStart, day), openedMin).getTime() + 6 * 60_000)
                    : null,
                mood: 2 + Math.floor(weekRandom() * 4),
                energy: 2 + Math.floor(weekRandom() * 4),
              })
              .onConflictDoUpdate({
                target: [dailyLogs.studentId, dailyLogs.logDate],
                set: {
                  firstOpenedAt: tehranDateTime(datesFor(weekStart, day), openedMin),
                },
              });
          }
        }

        await db.insert(weeklyPanels).values({
          studentId: student.id,
          weekStart,
          gridJson: planGrid,
          dailyRoutine: pick(
            [
              "",
              "شروع با درس سخت، مرور شب قبل خواب",
              "صبحها تست، عصرها مرور",
              "بعد از هر ۵۰ دقیقه ۱۰ دقیقه استراحت",
            ],
            weekRandom,
          ),
          updatedBy: counselor.id,
        });
        await db.insert(performancePanels).values({
          studentId: student.id,
          weekStart,
          cellsJson: perfGrid,
          updatedAt: new Date(),
        });
        panelTotal += 1;
      }
    }
  }

  console.log(
    `extra fields ready: ${MATH_STUDENTS.length + HUMANITIES_STUDENTS.length} students, ${resourceTotal} resources, ${chapterTotal} chapters, ${panelTotal} performance weeks`,
  );
  process.exit(0);
}

function datesFor(weekStart: string, day: number): string {
  return weekDates(weekStart)[day];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
