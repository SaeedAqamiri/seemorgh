import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  availability,
  contentItems,
  examAssignments,
  examTargets,
  exams,
  plans,
  questionBanks,
  questions,
  resources,
  studentConstraints,
  students,
  subjects,
  tasks,
  users,
  workspaces,
} from "../src/db/schema";
import { addDays, startOfWeekSaturday, todayISO } from "../src/lib/dates";
import { hashPassword } from "../src/lib/password";
import { buildSnapshot, selectExamQuestions } from "../src/lib/exam";
import { generatePlan } from "../src/lib/planner";

const DEMO_PHONE = "09120000000";
const DEMO_PASSWORD = "seemorgh123";

async function main() {
  const db = await getDb();

  const [existing] = await db.select().from(users).where(eq(users.phone, DEMO_PHONE)).limit(1);
  if (existing) {
    console.log("داده نمونه از قبل وجود دارد. برای ساخت مجدد: bun run db:reset && bun run db:seed");
    console.log(`ورود: ${DEMO_PHONE} / ${DEMO_PASSWORD}`);
    return;
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: "دفتر مشاوره نمونه" })
    .returning();

  const [counselor] = await db
    .insert(users)
    .values({
      workspaceId: workspace.id,
      role: "counselor",
      name: "سارا محمدی",
      phone: DEMO_PHONE,
      passwordHash: hashPassword(DEMO_PASSWORD),
    })
    .returning();

  await db.update(workspaces).set({ ownerId: counselor.id }).where(eq(workspaces.id, workspace.id));

  const subjectRows = await db
    .insert(subjects)
    .values(
      ["ریاضی", "فیزیک", "شیمی", "زیست‌شناسی", "ادبیات فارسی", "زبان انگلیسی", "دین و زندگی"].map(
        (title) => ({ workspaceId: workspace.id, title }),
      ),
    )
    .returning();

  const subjectId = (title: string) => {
    const subject = subjectRows.find((row) => row.title === title);
    if (!subject) throw new Error(`subject missing: ${title}`);
    return subject.id;
  };

  const weekStart = startOfWeekSaturday(todayISO());
  const examDate = addDays(weekStart, 70);

  const demoStudents = [
    {
      name: "علی رضایی",
      phone: "09121111111",
      grade: "دوازدهم",
      field: "تجربی",
      resources: [
        { subject: "زیست‌شناسی", title: "زیست دوازدهم — تست", unitType: "test" as const, total: 1200, done: 420, priority: 5 },
        { subject: "شیمی", title: "شیمی دوازدهم — تست", unitType: "test" as const, total: 800, done: 250, priority: 4 },
        { subject: "ریاضی", title: "ریاضی تجربی — تست", unitType: "test" as const, total: 600, done: 180, priority: 4 },
        {
          subject: "ادبیات فارسی",
          title: "ادبیات دوازدهم — صفحه",
          unitType: "page" as const,
          total: 220,
          done: 90,
          priority: 3,
          chapters: [
            { title: "فصل ۱ — ادبیات تعلیمی", pages: 60, startPage: 1, endPage: 60 },
            { title: "فصل ۲ — حماسی", pages: 80, startPage: 61, endPage: 140 },
            { title: "فصل ۳ — غنایی", pages: 80, startPage: 141, endPage: 220 },
          ],
        },
      ],
    },
    {
      name: "مریم کاظمی",
      phone: "09122222222",
      grade: "یازدهم",
      field: "ریاضی",
      resources: [
        { subject: "ریاضی", title: "حسابان ۲ — تست", unitType: "test" as const, total: 900, done: 300, priority: 5 },
        { subject: "فیزیک", title: "فیزیک یازدهم — تست", unitType: "test" as const, total: 700, done: 210, priority: 4 },
        {
          subject: "زبان انگلیسی",
          title: "زبان یازدهم — صفحه",
          unitType: "page" as const,
          total: 160,
          done: 40,
          priority: 3,
          chapters: [
            { title: "Unit 1", pages: 40, startPage: 1, endPage: 40 },
            { title: "Unit 2", pages: 40, startPage: 41, endPage: 80 },
            { title: "Unit 3", pages: 40, startPage: 81, endPage: 120 },
            { title: "Unit 4", pages: 40, startPage: 121, endPage: 160 },
          ],
        },
      ],
    },
  ];

  for (const demo of demoStudents) {
    const [student] = await db
      .insert(students)
      .values({
        workspaceId: workspace.id,
        counselorId: counselor.id,
        name: demo.name,
        phone: demo.phone,
        grade: demo.grade,
        field: demo.field,
        track: "both",
        inviteCode: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
      })
      .returning();

    await db.insert(studentConstraints).values({
      studentId: student.id,
      maxDailyMinutes: 300,
      restWeekday: 6,
      bufferPct: 15,
    });

    await db.insert(examTargets).values({
      studentId: student.id,
      title: "کنکور آزمایشی",
      examType: "konkur",
      examDate,
      weight: 5,
    });

    const resourceRows = await db
      .insert(resources)
      .values(
        demo.resources.map((resource) => ({
          workspaceId: workspace.id,
          studentId: student.id,
          subjectId: subjectId(resource.subject),
          title: resource.title,
          unitType: resource.unitType,
          totalUnits: resource.total,
          completedUnits: resource.done,
          chaptersJson: resource.chapters ?? null,
          priority: resource.priority,
        })),
      )
      .returning();

    await db.insert(availability).values(
      [0, 1, 2, 3, 4].flatMap((weekday) => [
        { studentId: student.id, weekday, startMin: 16 * 60, endMin: 19 * 60 },
      ]),
    );
    await db.insert(availability).values({
      studentId: student.id,
      weekday: 5,
      startMin: 9 * 60,
      endMin: 13 * 60,
    });

    const generated = generatePlan({
      weekStart,
      availability: [
        ...[0, 1, 2, 3, 4].map((weekday) => ({
          weekday,
          startMin: 16 * 60,
          endMin: 19 * 60,
        })),
        { weekday: 5, startMin: 9 * 60, endMin: 13 * 60 },
      ],
      constraints: { maxDailyMinutes: 300, restWeekday: 6, bufferPct: 15 },
      resources: resourceRows.map((resource) => ({
        id: resource.id,
        subjectId: resource.subjectId,
        subjectTitle:
          subjectRows.find((subject) => subject.id === resource.subjectId)?.title ?? "",
        title: resource.title,
        unitType: resource.unitType,
        totalUnits: resource.totalUnits,
        completedUnits: resource.completedUnits,
        priority: resource.priority,
        chapters: resource.chaptersJson,
      })),
      examTargets: [{ title: "کنکور آزمایشی", examDate, weight: 5 }],
    });

    const [plan] = await db
      .insert(plans)
      .values({ studentId: student.id, weekStart, status: "approved", approvedAt: new Date() })
      .returning();

    if (generated.tasks.length > 0) {
      await db.insert(tasks).values(
        generated.tasks.map((task) => ({
          planId: plan.id,
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
    }
  }

  const [firstStudent] = await db
    .select()
    .from(students)
    .where(and(eq(students.workspaceId, workspace.id), eq(students.name, "علی رضایی")))
    .limit(1);

  if (firstStudent) {
    const [studentUser] = await db
      .insert(users)
      .values({
        workspaceId: workspace.id,
        role: "student",
        name: firstStudent.name,
        phone: firstStudent.phone,
        passwordHash: hashPassword(DEMO_PASSWORD),
      })
      .returning();
    await db.update(students).set({ userId: studentUser.id }).where(eq(students.id, firstStudent.id));

    const [bank] = await db
      .insert(questionBanks)
      .values({
        workspaceId: workspace.id,
        title: "بانک نمونه زیست",
        subjectId: subjectId("زیست‌شناسی"),
        createdBy: counselor.id,
      })
      .returning();

    const sampleQuestions = [
      { topic: "ژنتیک", difficulty: "easy" as const, body: "واحد وراثت چیست؟", options: ["ژن", "پروتئین", "سلول", "بافت"], correct: 1 },
      { topic: "ژنتیک", difficulty: "medium" as const, body: "در آمیزش آزمون، فرد هتروزیگوت با کدام فرد بررسی می‌شود؟", options: ["هوموزیگوت غالب", "هوموزیگوت مغلوب", "هتروزیگوت", "هیچ‌کدام"], correct: 2 },
      { topic: "ژنتیک", difficulty: "hard" as const, body: "نسبت فنوتیپی ۹:۳:۳:۱ مربوط به کدام حالت است؟", options: ["تک‌آمیزی", "دورگه مستقل", "هم‌توانی", "چندآللی"], correct: 2 },
      { topic: "سینتیک", difficulty: "easy" as const, body: "آنزیم‌ها کدام نقش را دارند؟", options: ["کاتالیزور", "مصرف ATP", "ساخت DNA", "انتقال خون"], correct: 1 },
      { topic: "سینتیک", difficulty: "medium" as const, body: "افزایش دما بیش از حد بهینه چه اثری دارد؟", options: ["افزایش فعالیت", "دناتوره شدن آنزیم", "تغییر pH", "بی‌اثر است"], correct: 2 },
      { topic: "سینتیک", difficulty: "hard" as const, body: "بازدارنده رقابتی چه می‌کند؟", options: ["جایگاه فعال را اشغال می‌کند", "آنزیم را می‌سازد", "pH را تغییر می‌دهد", "ATP مصرف می‌کند"], correct: 1 },
      { topic: "تنظیم عصبی", difficulty: "easy" as const, body: "واحد ساختاری دستگاه عصبی چیست؟", options: ["نرون", "نفرون", "آلئول", "میوسیت"], correct: 1 },
      { topic: "تنظیم عصبی", difficulty: "medium" as const, body: "غلاف میلین کدام ویژگی را افزایش می‌دهد؟", options: ["سرعت هدایت", "تعداد نرون", "فشار خون", "گوارش"], correct: 1 },
      { topic: "تنظیم عصبی", difficulty: "hard" as const, body: "پمپ سدیم-پتاسیم در هر چرخه چند سدیم بیرون می‌برد؟", options: ["۱", "۲", "۳", "۴"], correct: 3 },
      { topic: "ژنتیک", difficulty: "medium" as const, body: "احتمال فرزند پسر از والدین چقدر است؟", options: ["۲۵٪", "۵۰٪", "۷۵٪", "۱۰۰٪"], correct: 2 },
    ];

    const questionRows = await db
      .insert(questions)
      .values(
        sampleQuestions.map((question, index) => ({
          bankId: bank.id,
          workspaceId: workspace.id,
          subjectId: subjectId("زیست‌شناسی"),
          topic: question.topic,
          type: "mcq" as const,
          difficulty: question.difficulty,
          body: question.body,
          optionsJson: question.options,
          correctJson: question.correct,
          score: 1,
          explanation: "پاسخ صحیح در گزینه مشخص شده است.",
          externalKey: `demo-bio-${index + 1}`,
        })),
      )
      .returning();

    const shortRows = await db
      .insert(questions)
      .values([
        {
          bankId: bank.id,
          workspaceId: workspace.id,
          subjectId: subjectId("زیست‌شناسی"),
          topic: "ژنتیک",
          type: "short" as const,
          difficulty: "medium" as const,
          body: "تفاوت ژنوتیپ و فنوتیپ را کوتاه توضیح دهید.",
          correctJson: "ژنوتیپ ترکیب ژن‌ها و فنوتیپ صفت ظاهری است.",
          score: 2,
          explanation: "",
          externalKey: "demo-bio-short-1",
        },
        {
          bankId: bank.id,
          workspaceId: workspace.id,
          subjectId: subjectId("زیست‌شناسی"),
          topic: "سینتیک",
          type: "short" as const,
          difficulty: "medium" as const,
          body: "دو عامل مؤثر بر فعالیت آنزیم را نام ببرید.",
          correctJson: "دما و pH",
          score: 2,
          explanation: "",
          externalKey: "demo-bio-short-2",
        },
      ])
      .returning();

    const pool = [...questionRows, ...shortRows].map((question) => ({
      id: question.id,
      subjectId: question.subjectId,
      subjectTitle: "زیست‌شناسی",
      topic: question.topic,
      difficulty: question.difficulty,
      type: question.type,
      body: question.body,
      options: question.optionsJson,
      correct: question.correctJson ?? "",
      score: question.score,
      explanation: question.explanation,
      externalKey: question.externalKey,
    }));

    const selection = selectExamQuestions(
      { items: [{ subjectId: subjectId("زیست‌شناسی"), topic: "", difficulty: "", count: pool.length }] },
      pool,
      "demo-exam",
    );
    const snapshot = buildSnapshot(selection.selected);

    const [exam] = await db
      .insert(exams)
      .values({
        workspaceId: workspace.id,
        title: "آزمون نمونه زیست",
        createdBy: counselor.id,
        status: "scheduled",
        startAt: new Date(Date.now() - 10 * 60_000),
        endAt: new Date(Date.now() + 2 * 60 * 60_000),
        durationMinutes: 45,
        blueprintJson: { items: [{ subjectId: subjectId("زیست‌شناسی"), topic: "", difficulty: "", count: pool.length }] },
        questionSnapshotJson: snapshot,
        totalScore: snapshot.totalScore,
        publishedAt: new Date(),
      })
      .returning();

    const allStudents = await db.select().from(students).where(eq(students.workspaceId, workspace.id));
    await db.insert(examAssignments).values(
      allStudents.map((student) => ({ examId: exam.id, studentId: student.id })),
    );

    const [demoResource] = await db
      .select()
      .from(resources)
      .where(eq(resources.studentId, firstStudent.id))
      .limit(1);

    await db.insert(contentItems).values([
      {
        workspaceId: workspace.id,
        title: "ویدیو نمونه — پخش داخل سایت",
        kind: "video",
        url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        body: "این یک ویدیو نمونه برای تست پخش داخل سایت است. لینک آپارات یا یوتیوب خودت را جای آن بگذار.",
        subjectId: demoResource?.subjectId ?? null,
        resourceId: demoResource?.id ?? null,
        createdBy: counselor.id,
      },
      {
        workspaceId: workspace.id,
        title: "راهنمای مطالعه فعال",
        kind: "text",
        url: null,
        body: "هر روز با یک بلوک کوتاه شروع کن. هدف این هفته: ثبت شروع/پایان هر تسک و خواندن صفحات مشخص‌شده.",
        createdBy: counselor.id,
      },
      {
        workspaceId: workspace.id,
        title: "تست روان‌شناسی — لینک نمونه",
        kind: "psychology",
        url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        body: "این بخش فعلاً فقط لینک محتواست؛ تفسیر تخصصی انجام نمی‌شود.",
        createdBy: counselor.id,
      },
    ]);
  }

  console.log("داده نمونه ساخته شد.");
  console.log(`مشاور: ${DEMO_PHONE} / ${DEMO_PASSWORD}`);
  console.log(`دانش‌آموز: 09121111111 / ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
