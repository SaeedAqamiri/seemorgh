import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  psychAnswers,
  psychAttempts,
  psychDimensions,
  psychOptions,
  psychQuestions,
  psychTests,
  studentGroups,
  students,
  users,
  workspaces,
  type PsychBand,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { scorePsychAttempt, type PsychScoringDimension } from "../src/lib/psych";
import { PSYCH_TEST_CATALOG } from "../src/lib/psych-catalog";

const DEFAULT_GROUP_NAMES = ["مدرسه علامه حلی", "مدرسه علامه طباطبایی"];
const DEMO_PASSWORD = "seemorgh123";

type Persona = Record<string, number>;

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildPersona(seed: string): Persona {
  const traits = [
    "conscientiousness",
    "extraversion",
    "openness",
    "agreeableness",
    "stability",
    "motivation",
    "focus",
    "selfEsteem",
    "resilience",
    "sleepQuality",
    "careerClarity",
    "perfectionism",
    "realistic",
    "logical",
    "spatial",
    "musical",
    "bodily",
    "linguistic",
  ];
  const persona: Persona = {};
  for (const trait of traits) {
    persona[trait] = clamp01(0.18 + rand(`${seed}:${trait}`) * 0.72);
  }
  const jitter = (key: string) => rand(`${seed}:${key}`) * 0.24 - 0.12;
  persona.procrastination = clamp01(
    0.9 - persona.conscientiousness * 0.75 + jitter("procrastination"),
  );
  persona.taskAversion = clamp01(0.85 - persona.motivation * 0.6 + jitter("taskAversion"));
  persona.anxiety = clamp01(0.9 - persona.stability * 0.7 + jitter("anxiety"));
  persona.stress = clamp01(0.9 - persona.stability * 0.65 + jitter("stress"));
  persona.avoidance = clamp01(0.75 - persona.resilience * 0.55 + jitter("avoidance"));
  persona.focus = clamp01(
    persona.conscientiousness * 0.4 + persona.stability * 0.3 + rand(`${seed}:focus2`) * 0.3,
  );
  persona.selfEsteem = clamp01(
    persona.stability * 0.5 + persona.extraversion * 0.15 + rand(`${seed}:esteemb`) * 0.35,
  );
  persona.digitalBalance = clamp01(
    persona.conscientiousness * 0.55 + rand(`${seed}:digital`) * 0.45,
  );
  persona.sleepRoutine = clamp01(
    persona.conscientiousness * 0.5 + rand(`${seed}:sleepRoutine`) * 0.5,
  );
  persona.energy = clamp01(
    persona.sleepQuality * 0.55 + persona.stability * 0.2 + rand(`${seed}:energy`) * 0.25,
  );
  persona.sleepImpact = clamp01(1 - persona.digitalBalance * 0.6 + jitter("sleepImpact"));
  persona.careerIndecision = clamp01(
    0.8 - persona.careerClarity * 0.65 + jitter("careerIndecision"),
  );
  persona.extrinsicMotivation = clamp01(0.3 + rand(`${seed}:extrinsic`) * 0.6);
  persona.amotivation = clamp01(0.85 - persona.motivation * 0.7 + jitter("amotivation"));
  persona.optimism = clamp01(persona.stability * 0.5 + rand(`${seed}:optimism`) * 0.5);
  return persona;
}

const CATALOG_TRAIT_BY_TITLE = new Map<string, string>();
for (const test of PSYCH_TEST_CATALOG) {
  for (const dimension of test.dimensions) {
    CATALOG_TRAIT_BY_TITLE.set(dimension.title, dimension.trait);
  }
}

const MBTI_TRAITS: Record<string, string> = {
  "برون‌گرایی / درون‌گرایی": "extraversion",
  "حسی / شهودی": "openness",
  "فکری / احساسی": "agreeableness",
  "قضاوت‌گر / ادراکی": "conscientiousness",
};

function traitForTitle(title: string): string {
  if (MBTI_TRAITS[title]) return MBTI_TRAITS[title];
  const catalogTrait = CATALOG_TRAIT_BY_TITLE.get(title);
  if (catalogTrait) return catalogTrait;

  if (/حواس|تمرکز|توجه/.test(title)) return "focus";
  if (/اهمال|تعویق|بیزاری/.test(title)) return "procrastination";
  if (/اضطراب|نگرانی|استرس|فشار|واکنش بدنی|اجتناب/.test(title)) return "anxiety";
  if (/انگیزه|بی.?انگیزگی|هدف|تلاش/.test(title)) return "motivation";
  if (/برون|اجتماع|ارتباط|رهبر|جرئت|ابراز/.test(title)) return "extraversion";
  if (/درون/.test(title)) return "extraversion";
  if (/گشودگی|خلاق|هنر|کاوش|استقلال|طبیعت/.test(title)) return "openness";
  if (/توافق|همدلی|همکاری|حمایت|خدمت/.test(title)) return "agreeableness";
  if (/تاب.?آوری|بازیابی|خوش.?بینی|ثبات/.test(title)) return "resilience";
  if (/عزت|اعتماد|پذیرش خود|ارزش شخصی|خودآگاهی/.test(title)) return "selfEsteem";
  if (/کمال/.test(title)) return "perfectionism";
  if (/خواب/.test(title)) return "sleepQuality";
  if (/فضای مجازی|گوشی|شبکه|تعادل استفاده/.test(title)) return "digitalBalance";
  if (/تصمیم|مسیر|وضوح|تردید/.test(title)) return "careerClarity";
  if (/واقع.?گرا/.test(title)) return "realistic";
  if (/جستجوگر/.test(title)) return "openness";
  if (/هنری/.test(title)) return "openness";
  if (/متهور/.test(title)) return "extraversion";
  if (/قراردادی|وجدان|نظم|برنامه/.test(title)) return "conscientiousness";
  if (/زبانی/.test(title)) return "linguistic";
  if (/منطقی/.test(title)) return "logical";
  if (/فضایی/.test(title)) return "spatial";
  if (/موسیقی/.test(title)) return "musical";
  if (/بدنی/.test(title)) return "bodily";
  if (/میان.?فردی/.test(title)) return "agreeableness";
  if (/درون.?فردی/.test(title)) return "selfEsteem";
  return "openness";
}

function targetFor(persona: Persona, title: string, seed: string): number {
  const trait = traitForTitle(title);
  const base = persona[trait] ?? rand(`${seed}:${trait}`);
  return clamp01(base + (rand(`${seed}:${title}:target`) * 0.3 - 0.15));
}

function pickOptionIndex(
  optionScores: number[],
  target: number,
  seed: string,
): number {
  const max = Math.max(...optionScores);
  if (!Number.isFinite(max) || max <= 0) {
    return Math.floor(rand(seed) * optionScores.length);
  }
  const desired = clamp01(target + (rand(`${seed}:choice`) * 0.24 - 0.12));
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, score] of optionScores.entries()) {
    const normalized = score / max;
    const distance = Math.abs(normalized - desired);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function groupNamesFromArgs(): string[] {
  const arg = process.argv.find((item) => item.startsWith("--groups="));
  if (!arg) return DEFAULT_GROUP_NAMES;
  return arg
    .slice("--groups=".length)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

  const requestedNames = groupNamesFromArgs();
  const allGroups = await db
    .select()
    .from(studentGroups)
    .where(eq(studentGroups.workspaceId, workspace.id))
    .orderBy(asc(studentGroups.createdAt));

  const requestedGroups = requestedNames
    .map((name) => allGroups.find((group) => group.name === name))
    .filter((group): group is (typeof allGroups)[number] => Boolean(group));
  const selectedGroups =
    requestedGroups.length >= 2
      ? requestedGroups.slice(0, 2)
      : allGroups.filter((group) =>
          requestedNames.includes(group.name),
        ).length >= 2
        ? allGroups.filter((group) => requestedNames.includes(group.name)).slice(0, 2)
        : allGroups.slice(0, 2);

  if (selectedGroups.length < 2) {
    throw new Error("برای شبیه‌سازی حداقل دو گروه لازم است.");
  }

  const groupStudents = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.workspaceId, workspace.id),
        eq(students.status, "active"),
        inArray(
          students.groupId,
          selectedGroups.map((group) => group.id),
        ),
      ),
    )
    .orderBy(asc(students.name));

  if (groupStudents.length === 0) throw new Error("دانش‌آموزی در گروه‌های انتخابی پیدا نشد.");

  const tests = await db
    .select()
    .from(psychTests)
    .where(and(eq(psychTests.workspaceId, workspace.id), eq(psychTests.status, "published")))
    .orderBy(asc(psychTests.createdAt));
  if (tests.length === 0) throw new Error("هیچ آزمون منتشرشده‌ای پیدا نشد.");

  const testIds = tests.map((test) => test.id);
  const [dimensionRows, questionRows, optionRows] = await Promise.all([
    db
      .select()
      .from(psychDimensions)
      .where(inArray(psychDimensions.testId, testIds))
      .orderBy(asc(psychDimensions.sortOrder)),
    db
      .select()
      .from(psychQuestions)
      .where(inArray(psychQuestions.testId, testIds))
      .orderBy(asc(psychQuestions.sortOrder)),
    db
      .select({ option: psychOptions })
      .from(psychOptions)
      .innerJoin(psychQuestions, eq(psychOptions.questionId, psychQuestions.id))
      .where(inArray(psychQuestions.testId, testIds))
      .orderBy(asc(psychOptions.sortOrder)),
  ]);

  const dimensionsByTest = new Map<string, typeof dimensionRows>();
  for (const dimension of dimensionRows) {
    const list = dimensionsByTest.get(dimension.testId) ?? [];
    list.push(dimension);
    dimensionsByTest.set(dimension.testId, list);
  }

  const questionsByTest = new Map<string, typeof questionRows>();
  for (const question of questionRows) {
    const list = questionsByTest.get(question.testId) ?? [];
    list.push(question);
    questionsByTest.set(question.testId, list);
  }

  const optionsByQuestion = new Map<string, typeof optionRows>();
  for (const row of optionRows) {
    const list = optionsByQuestion.get(row.option.questionId) ?? [];
    list.push(row);
    optionsByQuestion.set(row.option.questionId, list);
  }

  let simulated = 0;
  let skipped = 0;
  const usersByStudent = new Map<string, string>();

  for (const group of selectedGroups) {
    const members = groupStudents.filter((student) => student.groupId === group.id);
    console.log(`\nگروه «${group.name}» — ${members.length.toLocaleString("fa-IR")} دانش‌آموز`);

    for (const student of members) {
      let userId = student.userId;
      if (!userId) {
        const [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.phone, student.phone))
          .limit(1);
        if (existingUser) {
          userId = existingUser.id;
        } else {
          const [createdUser] = await db
            .insert(users)
            .values({
              workspaceId: workspace.id,
              role: "student",
              name: student.name,
              phone: student.phone,
              passwordHash: hashPassword(DEMO_PASSWORD),
            })
            .returning();
          userId = createdUser.id;
        }
        await db.update(students).set({ userId }).where(eq(students.id, student.id));
      }
      usersByStudent.set(student.id, userId);

      const persona = buildPersona(`${student.id}:${student.name}`);
      let studentSimulated = 0;

      for (const test of tests) {
        const [existing] = await db
          .select({ id: psychAttempts.id })
          .from(psychAttempts)
          .where(
            and(
              eq(psychAttempts.workspaceId, workspace.id),
              eq(psychAttempts.testId, test.id),
              eq(psychAttempts.userId, userId),
              eq(psychAttempts.status, "submitted"),
            ),
          )
          .limit(1);
        if (existing) {
          skipped += 1;
          continue;
        }

        const dimensions = dimensionsByTest.get(test.id) ?? [];
        const questions = questionsByTest.get(test.id) ?? [];
        if (dimensions.length === 0 || questions.length === 0) continue;

        const dimensionById = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
        const answers: { questionId: string; optionId: string }[] = [];
        const selectedScores: Record<string, number>[] = [];

        for (const question of questions) {
          const options = optionsByQuestion.get(question.id) ?? [];
          if (options.length === 0) continue;
          const optionScores = options.map((row) => {
            const scores = row.option.scoresJson ?? {};
            return Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);
          });
          const scoredKey = options
            .flatMap((row) => Object.keys(row.option.scoresJson ?? {}))
            .find(Boolean);
          const relevantDimension = scoredKey ? dimensionById.get(scoredKey) : undefined;
          const title =
            relevantDimension?.title ??
            dimensions[Math.floor(rand(`${student.id}:${test.id}:${question.id}`) * dimensions.length)]
              ?.title ??
            "";
          const target = targetFor(persona, title, `${student.id}:${question.id}`);
          const optionIndex = pickOptionIndex(
            optionScores,
            target,
            `${student.id}:${test.id}:${question.id}`,
          );
          const chosen = options[Math.min(optionIndex, options.length - 1)];
          answers.push({ questionId: question.id, optionId: chosen.option.id });
          selectedScores.push(chosen.option.scoresJson ?? {});
        }

        if (answers.length === 0) continue;

        const scoringDimensions: PsychScoringDimension[] = dimensions.map((dimension) => ({
          id: dimension.id,
          title: dimension.title,
          description: dimension.description,
          bands: (dimension.bandsJson ?? []) as PsychBand[],
        }));
        const result = scorePsychAttempt(
          scoringDimensions,
          selectedScores,
          test.resultRulesJson ?? [],
        );

        const daysAgo = 4 + Math.floor(rand(`${student.id}:${test.id}:date`) * 55);
        const startedAt = new Date(
          Date.now() -
            daysAgo * 24 * 60 * 60 * 1000 -
            Math.floor(rand(`${student.id}:${test.id}:hour`) * 8) * 60 * 60 * 1000,
        );
        const submittedAt = new Date(
          startedAt.getTime() +
            (8 + Math.floor(rand(`${student.id}:${test.id}:duration`) * 20)) * 60 * 1000,
        );

        const [attempt] = await db
          .insert(psychAttempts)
          .values({
            workspaceId: workspace.id,
            testId: test.id,
            userId,
            studentId: student.id,
            participantRole: "student",
            status: "submitted",
            startedAt,
            submittedAt,
            scoresJson: result.scores,
            resultCode: result.code,
            resultTitle: result.title,
            resultBody: result.body,
            createdAt: submittedAt,
          })
          .returning({ id: psychAttempts.id });

        await db.insert(psychAnswers).values(
          answers.map((answer) => ({
            attemptId: attempt.id,
            questionId: answer.questionId,
            optionId: answer.optionId,
          })),
        );

        simulated += 1;
        studentSimulated += 1;
      }

      console.log(
        `  ${student.name}: ${studentSimulated.toLocaleString("fa-IR")} آزمون ثبت شد`,
      );
    }
  }

  console.log(
    `\nتمام شد: ${simulated.toLocaleString("fa-IR")} نتیجه جدید برای ${groupStudents.length.toLocaleString(
      "fa-IR",
    )} دانش‌آموز در ${selectedGroups.length.toLocaleString("fa-IR")} گروه؛ ${skipped.toLocaleString(
      "fa-IR",
    )} نتیجه از قبل موجود بود.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
