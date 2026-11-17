// Simulates realistic psych-test attempts for every student in the workspace.
// Persona per student is deterministic (seeded from student id) and correlated
// with the student's real mock-exam performance so profiles look plausible.
//
// Usage:
//   bunx tsx scripts/simulate-psych-attempts.ts            # fill missing attempts
//   bunx tsx scripts/simulate-psych-attempts.ts --force    # wipe + regenerate all
//   bunx tsx scripts/simulate-psych-attempts.ts --limit 5  # only first N students
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  externalExams,
  psychAnswers,
  psychAttempts,
  psychDimensions,
  psychOptions,
  psychQuestions,
  psychTests,
  students,
  workspaces,
  type PsychBand,
} from "../src/db/schema";
import { findPsychBand, scorePsychAttempt, type PsychScoringDimension } from "../src/lib/psych";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const limitIndex = args.indexOf("--limit");
const LIMIT = limitIndex >= 0 ? Number(args[limitIndex + 1]) || 0 : 0;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rand(seed: string): number {
  return (hashString(seed) % 100000) / 100000;
}

function noise(seed: string, spread: number): number {
  return (rand(seed) - 0.5) * 2 * spread;
}

function clamp01(value: number): number {
  return Math.max(0.04, Math.min(0.96, value));
}

type Persona = {
  discipline: number;
  focus: number;
  motivation: number;
  resilience: number;
  selfEsteem: number;
  anxiety: number;
  procrastination: number;
  wellbeing: number;
  social: number;
  openness: number;
};

function buildPersona(studentId: string, performance: number): Persona {
  const p = clamp01(performance);
  const n = (key: string, spread: number) => noise(`${studentId}:${key}`, spread);
  return {
    discipline: clamp01(0.3 + 0.4 * p + n("disc", 0.22)),
    focus: clamp01(0.26 + 0.45 * p + n("focus", 0.22)),
    motivation: clamp01(0.3 + 0.38 * p + n("motiv", 0.26)),
    resilience: clamp01(0.4 + 0.2 * p + n("resil", 0.26)),
    selfEsteem: clamp01(0.34 + 0.3 * p + n("esteem", 0.24)),
    anxiety: clamp01(0.58 - 0.32 * p + n("anx", 0.26)),
    procrastination: clamp01(0.58 - 0.38 * p + n("proc", 0.26)),
    wellbeing: clamp01(0.45 + 0.18 * p + n("well", 0.28)),
    social: clamp01(0.38 + n("social", 0.3)),
    openness: clamp01(0.42 + n("open", 0.3)),
  };
}

const CAUTION_DIRECT: [RegExp, keyof Persona][] = [
  [/اهمال|تعویق|شروع کردن|مقدمه|فردا موکول/, "procrastination"],
  [/اضطراب|نگرانی|استرس|فشار|واکنش بدنی|روان.?رنجوری|نوسان|ترس/, "anxiety"],
  [/اجتناب|فرار|دوری/, "anxiety"],
  [/بی.?انگیزگی|بی.?معنا/, "motivation"],
  [/بیزاری|ناخوشایند|پشت گوش/, "wellbeing"],
  [/تردید|بلاتکلیفی|تصمیم را به بعد/, "motivation"],
  [/کمال|وسواس/, "anxiety"],
  [/حواس.?پرتی|پرش|مزاحمت|گوشی|شبکه اجتماعی|کارهای بی.?ربط/, "focus"],
];

const POSITIVE_DIRECT: [RegExp, keyof Persona][] = [
  [/تمرکز|توجه/, "focus"],
  [/برنامه|مدیریت زمان|اولویت|نظم|پیگیری|پایبندی|یادداشت|مرور|محیط مطالعه|سازمان/, "discipline"],
  [/انگیزه درونی|کنجکاوی|لذت یادگیری|تلاش|هدف|باور/, "motivation"],
  [/اعتماد|عزت|خودکارآمدی|خودآگاهی|پذیرش خود|توانایی/, "selfEsteem"],
  [/بازیابی|تاب.?آوری|خوش.?بینی|حمایت|چالش|تنظیم هیجان/, "resilience"],
  [/خواب|انرژی|تعادل استفاده/, "wellbeing"],
  [/همدلی|مهارت اجتماعی|ارتباط|گوش|کار گروهی|گشودگی/, "social"],
  [/وضوح|کاوش|جمع.?آوری اطلاعات/, "openness"],
  [/وجدان|مسئولیت/, "discipline"],
];

const NEUTRAL_PATTERN =
  /واقع.?گرا|جستجوگر|هنری|اجتماعی \(|متهور|قراردادی|هوش|پیشرفت و موفقیت|استقلال|ثبات|خدمت|برون.?گرایی|توافق.?پذیری|گرایش|درون.?گرا|حسی|شهودی|فکری|احساسی|قضاوت|ادراکی|زبان|منطقی|فضایی|موسیقی|بدنی|میان.?فردی|درون.?فردی|طبیعت/;

function targetLevelFor(title: string, persona: Persona, seed: string): number {
  if (NEUTRAL_PATTERN.test(title)) {
    return clamp01(0.22 + 0.56 * rand(seed));
  }
  for (const [pattern, trait] of CAUTION_DIRECT) {
    if (pattern.test(title)) return clamp01(persona[trait] + noise(`${seed}:j`, 0.08));
  }
  for (const [pattern, trait] of POSITIVE_DIRECT) {
    if (pattern.test(title)) return clamp01(persona[trait] + noise(`${seed}:j`, 0.08));
  }
  return clamp01(persona.discipline + noise(`${seed}:j`, 0.12));
}

type SimOption = { id: string; contribution: number };
type SimQuestion = { id: string; dimensionId: string; options: SimOption[]; maxContribution: number };

function simulateTestAnswers(
  testId: string,
  studentId: string,
  dimensions: { id: string; title: string; bandsJson: PsychBand[] | null }[],
  questions: SimQuestion[],
  persona: Persona,
): { questionId: string; optionId: string }[] {
  const questionsByDimension = new Map<string, SimQuestion[]>();
  for (const question of questions) {
    const list = questionsByDimension.get(question.dimensionId) ?? [];
    list.push(question);
    questionsByDimension.set(question.dimensionId, list);
  }

  const targetScoreByDimension = new Map<string, number>();
  for (const dimension of dimensions) {
    const list = questionsByDimension.get(dimension.id) ?? [];
    if (list.length === 0) continue;
    const maxPerQuestion = Math.max(...list.map((question) => question.maxContribution), 0);
    if (maxPerQuestion <= 0) continue;
    const target = targetLevelFor(dimension.title, persona, `${studentId}:${dimension.id}`);
    targetScoreByDimension.set(dimension.id, target * maxPerQuestion * list.length);
  }

  const answers: { questionId: string; optionId: string }[] = [];
  for (const [dimensionId, list] of questionsByDimension) {
    const targetScore = targetScoreByDimension.get(dimensionId) ?? 0;
    const maxPerQuestion = Math.max(...list.map((question) => question.maxContribution), 0);
    let accumulated = 0;
    for (const [index, question] of list.entries()) {
      const questionsLeft = list.length - index;
      const desired = questionsLeft > 0
        ? Math.max(0, Math.min(maxPerQuestion, (targetScore - accumulated) / questionsLeft))
        : 0;
      const jitter = maxPerQuestion * 0.16 * (rand(`${studentId}:${question.id}:j`) - 0.5);
      const wanted = Math.max(0, Math.min(maxPerQuestion, desired + jitter));
      let best = question.options[0];
      let bestGap = Number.POSITIVE_INFINITY;
      for (const option of question.options) {
        const gap = Math.abs(option.contribution - wanted);
        if (gap < bestGap - 1e-9) {
          bestGap = gap;
          best = option;
        }
      }
      accumulated += best.contribution;
      answers.push({ questionId: question.id, optionId: best.id });
    }
  }
  return answers;
}

async function main() {
  const db = await getDb();
  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) throw new Error("no workspace");

  if (FORCE) {
    const existing = await db
      .select({ id: psychAttempts.id })
      .from(psychAttempts)
      .where(eq(psychAttempts.workspaceId, workspace.id));
    if (existing.length > 0) {
      console.log(`force: deleting ${existing.length} existing attempts…`);
      await db.delete(psychAttempts).where(eq(psychAttempts.workspaceId, workspace.id));
    }
  }

  const studentRows = await db
    .select()
    .from(students)
    .where(eq(students.workspaceId, workspace.id));
  const active = studentRows.filter((student) => student.userId);
  const selected = LIMIT > 0 ? active.slice(0, LIMIT) : active;

  const examRows = await db
    .select({ studentId: externalExams.studentId, overallPercent: externalExams.overallPercent })
    .from(externalExams)
    .where(eq(externalExams.workspaceId, workspace.id));
  const perfSum = new Map<string, number>();
  const perfCount = new Map<string, number>();
  for (const row of examRows) {
    perfSum.set(row.studentId, (perfSum.get(row.studentId) ?? 0) + row.overallPercent);
    perfCount.set(row.studentId, (perfCount.get(row.studentId) ?? 0) + 1);
  }

  const tests = await db
    .select()
    .from(psychTests)
    .where(and(eq(psychTests.workspaceId, workspace.id), eq(psychTests.status, "published")));

  const testIds = tests.map((test) => test.id);
  const dimensionRows = testIds.length
    ? await db.select().from(psychDimensions).where(inArray(psychDimensions.testId, testIds))
    : [];
  const questionRows = testIds.length
    ? await db.select().from(psychQuestions).where(inArray(psychQuestions.testId, testIds))
    : [];
  const optionRows =
    testIds.length && questionRows.length > 0
      ? await db
          .select({ option: psychOptions, questionId: psychQuestions.id, testId: psychQuestions.testId })
          .from(psychOptions)
          .innerJoin(psychQuestions, eq(psychOptions.questionId, psychQuestions.id))
          .where(
            inArray(
              psychQuestions.testId,
              testIds,
            ),
          )
      : [];

  const dimsByTest = new Map<string, typeof dimensionRows>();
  for (const dimension of dimensionRows) {
    const list = dimsByTest.get(dimension.testId) ?? [];
    list.push(dimension);
    dimsByTest.set(dimension.testId, list);
  }
  const questionsByTest = new Map<string, typeof questionRows>();
  for (const question of questionRows) {
    const list = questionsByTest.get(question.testId) ?? [];
    list.push(question);
    questionsByTest.set(question.testId, list);
  }
  const optionInfoById = new Map<string, { id: string; contribution: number; scoresJson: Record<string, number> | null }>();
  const optionsByQuestion = new Map<string, { id: string; contribution: number }[]>();
  for (const row of optionRows) {
    const scores = row.option.scoresJson ?? {};
    const contribution = Object.values(scores).reduce((sum, value) => sum + (Number(value) || 0), 0);
    optionInfoById.set(row.option.id, { id: row.option.id, contribution, scoresJson: scores });
    const list = optionsByQuestion.get(row.questionId) ?? [];
    list.push({ id: row.option.id, contribution });
    optionsByQuestion.set(row.questionId, list);
  }

  const now = Date.now();
  let createdAttempts = 0;
  let createdAnswers = 0;
  let skippedStudents = 0;

  for (const [studentIndex, student] of selected.entries()) {
    const hasAttempt = await db
      .select({ id: psychAttempts.id })
      .from(psychAttempts)
      .where(and(eq(psychAttempts.workspaceId, workspace.id), eq(psychAttempts.studentId, student.id)))
      .limit(1);
    if (hasAttempt.length > 0 && !FORCE) {
      skippedStudents += 1;
      continue;
    }
    if (!student.userId) continue;

    const averagePercent = (perfSum.get(student.id) ?? 0) / (perfCount.get(student.id) ?? 1);
    const persona = buildPersona(student.id, averagePercent / 100);

    for (const [testIndex, test] of tests.entries()) {
      const dimensions = (dimsByTest.get(test.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
      const rawQuestions = (questionsByTest.get(test.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
      if (dimensions.length === 0 || rawQuestions.length === 0) continue;

      const simQuestions: SimQuestion[] = [];
      for (const question of rawQuestions) {
        const options = optionsByQuestion.get(question.id) ?? [];
        if (options.length === 0) continue;
        const dimensionIds = new Set<string>();
        for (const option of options) {
          const scores = optionInfoById.get(option.id)?.scoresJson ?? {};
          for (const key of Object.keys(scores)) dimensionIds.add(key);
        }
        // Prefer a dimension that belongs to this test.
        const dimensionId =
          [...dimensionIds].find((key) => dimensions.some((dimension) => dimension.id === key)) ??
          [...dimensionIds][0];
        if (!dimensionId) continue;
        simQuestions.push({
          id: question.id,
          dimensionId,
          options,
          maxContribution: Math.max(...options.map((option) => option.contribution), 0),
        });
      }

      const answers = simulateTestAnswers(test.id, student.id, dimensions, simQuestions, persona);
      if (answers.length === 0) continue;

      const scoringDimensions: PsychScoringDimension[] = dimensions.map((dimension) => ({
        id: dimension.id,
        title: dimension.title,
        description: dimension.description,
        bands: dimension.bandsJson ?? [],
      }));
      const result = scorePsychAttempt(
        scoringDimensions,
        answers.map((answer) => optionInfoById.get(answer.optionId)?.scoresJson ?? null),
        test.resultRulesJson ?? [],
      );

      const daysAgo = 40 - testIndex * 1.4 - rand(`${student.id}:${test.id}:d`) * 3;
      const startedAt = new Date(now - Math.max(1, daysAgo) * 24 * 3600 * 1000);
      const submittedAt = new Date(startedAt.getTime() + (4 + rand(`${student.id}:${test.id}:m`) * 9) * 60 * 1000);

      const [attempt] = await db
        .insert(psychAttempts)
        .values({
          workspaceId: workspace.id,
          testId: test.id,
          userId: student.userId,
          studentId: student.id,
          participantRole: "student",
          status: "submitted",
          startedAt,
          submittedAt,
          scoresJson: result.scores,
          resultCode: result.code,
          resultTitle: result.title,
          resultBody: result.body,
        })
        .returning();

      await db.insert(psychAnswers).values(
        answers.map((answer) => ({
          attemptId: attempt.id,
          questionId: answer.questionId,
          optionId: answer.optionId,
        })),
      );

      createdAttempts += 1;
      createdAnswers += answers.length;
    }

    if ((studentIndex + 1) % 10 === 0) {
      console.log(`… ${studentIndex + 1}/${selected.length} students done`);
    }
  }

  console.log(
    `done: students=${selected.length} skipped=${skippedStudents} attempts=${createdAttempts} answers=${createdAnswers}`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
