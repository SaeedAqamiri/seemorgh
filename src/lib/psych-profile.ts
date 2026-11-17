import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PsychBand } from "@/db/schema";
import { psychAttempts, psychDimensions, psychTests } from "@/db/schema";
import { getDb } from "@/db/client";
import type { PlanningPolicy } from "./auto-plan";
import { findPsychBand, scorePsychAttempt, type PsychScoringDimension } from "./psych";

export type PsychSignalLevel = "low" | "mid" | "high";

export type PsychSignal = {
  area: string;
  title: string;
  level: PsychSignalLevel;
  label: string;
  analysis: string;
  sourceTest: string;
  sourceUrl: string | null;
};

export type PsychProfileAttempt = {
  attemptId: string;
  testId: string;
  testTitle: string;
  category: string;
  sourceUrl: string | null;
  resultCode: string;
  resultTitle: string;
  resultBody: string;
  submittedAt: Date;
  dimensions: {
    title: string;
    score: number;
    bandLabel: string;
    bandAnalysis: string;
    level: PsychSignalLevel;
  }[];
};

export type PsychPlanningRecommendation = {
  title: string;
  body: string;
  sourceTest: string;
  level: PsychSignalLevel;
};

export type StudentPsychProfile = {
  attempts: PsychProfileAttempt[];
  signals: PsychSignal[];
  recommendations: PsychPlanningRecommendation[];
  careerInterests: { title: string; label: string }[];
  strengths: string[];
  policyAdjustments: Partial<PlanningPolicy>;
};

const CAUTION_PATTERN =
  /حواس.?پرتی|اهمال|تعویق|اضطراب|نگرانی|استرس|فشار|تردید|بی.?انگیزگی|کمال|اثر بر|روان.?رنجوری|اجتناب|بیزاری|دشواری/;

const areaForTitle = (title: string): string => {
  if (/تمرکز|حواس|توجه|محیط مطالعه|یادداشت|مرور/.test(title)) return "focus";
  if (/برنامه|مدیریت زمان|اولویت|پیگیری|نظم|وجدان/.test(title)) return "planning";
  if (/اهمال|تعویق|بیزاری|شروع/.test(title)) return "procrastination";
  if (/اضطراب|نگرانی|استرس|فشار|واکنش بدنی|اجتناب/.test(title)) return "stress";
  if (/انگیزه|بی.?انگیزگی|هدف|تلاش/.test(title)) return "motivation";
  if (/تاب.?آوری|بازیابی|خوش.?بینی|استقامت|پذیرش چالش/.test(title)) return "resilience";
  if (/عزت|اعتماد|پذیرش خود|ارزش شخصی/.test(title)) return "selfEsteem";
  if (/کمال/.test(title)) return "perfectionism";
  if (/خواب|انرژی روزانه|نظم خواب/.test(title)) return "sleep";
  if (/فضای مجازی|گوشی|شبکه|تعادل استفاده/.test(title)) return "digital";
  if (/هوش هیجانی|همدلی|تنظیم هیجان|مهارت اجتماعی|خودآگاهی/.test(title)) return "eq";
  if (/ارتباط|گوش دادن|ابراز نظر|همکاری/.test(title)) return "communication";
  if (/تصمیم|مسیر|کاوش|تردید|وضوح/.test(title)) return "career";
  if (/واقع.?گرا|جستجوگر|هنری|متهور|قراردادی|علاقه/.test(title)) return "interest";
  if (/گشودگی|وجدان|برون.?گرایی|توافق.?پذیری|روان.?رنجوری/.test(title)) return "bigFive";
  return "general";
};

function levelFromBand(band: PsychBand | null, bands: PsychBand[]): PsychSignalLevel {
  if (!band) return "mid";
  const label = band.label ?? "";
  if (/بالا|قوی|شدید|زیاد|نقطه قوت|علاقه بالا/.test(label)) return "high";
  if (/پایین|ضعیف|کم|خفیف|علاقه کم/.test(label)) return "low";
  if (/متوسط|میانه|متعادل/.test(label)) return "mid";

  const sorted = [...bands].sort((first, second) => first.min - second.min);
  const index = sorted.findIndex((entry) => entry.min === band.min && entry.max === band.max);
  if (sorted.length <= 1 || index < 0) return "mid";
  if (index === 0) return "low";
  if (index === sorted.length - 1) return "high";
  return "mid";
}

function isBadSignal(signal: PsychSignal): boolean {
  const caution = CAUTION_PATTERN.test(signal.title);
  if (caution) return signal.level === "high";
  return signal.level === "low";
}

const RECOMMENDATION_TEXT: Record<
  string,
  { title: string; body: string; policy?: Partial<PlanningPolicy> }
> = {
  focus: {
    title: "بلوک‌های مطالعه کوتاه‌تر",
    body: "تمرکز پایدار در سطح فعلی محدود است؛ بلوک‌های ۲۵ تا ۴۵ دقیقه‌ای با استراحت پنج دقیقه‌ای و حذف مزاحمت‌ها مؤثرتر است.",
    policy: { maxBlockMinutes: 45, minBlockMinutes: 25 },
  },
  planning: {
    title: "برنامه‌ریزی بیرونی و مرور بیشتر",
    body: "برای جبران ضعف برنامه‌ریزی، اولویت‌های هر روز را از قبل مشخص کن و مرور کوتاه را در برنامه ثابت نگه دار.",
    policy: { reviewRatioPct: 15 },
  },
  procrastination: {
    title: "شروع‌های کوچک و مهلت کوتاه",
    body: "اهمالکاری بالا نشان می‌دهد شروع کار سخت است؛ تکالیف را به قدم‌های کوچک با مهلت‌های کوتاه تقسیم کن.",
    policy: { maxSubjectsPerDay: 2 },
  },
  stress: {
    title: "کاهش فشار آزمون",
    body: "اضطراب و فشار روانی بالا می‌تواند عملکرد را پایین بیاورد؛ سهم آزمون‌های سنگین را کمتر و آزمون‌های کوچک تمرینی را بیشتر کن.",
    policy: { testRatioPct: 60 },
  },
  motivation: {
    title: "هدف‌های کوچک و قابل دیدن",
    body: "انگیزه در سطح فعلی نیاز به تقویت دارد؛ نتیجه‌های کوچک هفتگی و پاداش‌های کوتاه‌مدت را در برنامه بگنجان.",
    policy: { maxSubjectsPerDay: 2 },
  },
  resilience: {
    title: "برنامه بازیابی و فشار قابل تحمل",
    body: "تاب‌آوری پایین یعنی برنامه باید جا برای بازیابی داشته باشد؛ تعداد درس‌های هم‌زمان را کم و فعالیت بازیابی را ثابت کن.",
    policy: { maxSubjectsPerDay: 2 },
  },
  selfEsteem: {
    title: "هدف‌گذاری واقع‌بینانه",
    body: "اعتماد به خود در سطح پایین است؛ هدف‌ها را کوچک و قابل دستیابی انتخاب کن و پیشرفت را با خودت مقایسه کن.",
  },
  perfectionism: {
    title: "جلوگیری از وسواس مرور",
    body: "کمال‌گرایی بالا می‌تواند باعث مرور بی‌پایان و از دست رفتن زمان شود؛ برای هر کار استاندارد «خوب کافی» تعریف کن.",
    policy: { reviewRatioPct: 8 },
  },
  sleep: {
    title: "حفاظت از خواب و انرژی",
    body: "کیفیت خواب یا انرژی روزانه پایین است؛ ساعت مطالعه شب را محدود کن و بلوک‌های سخت را در ساعات پرانرژی بگذار.",
  },
  digital: {
    title: "مدیریت گوشی و فضای مجازی",
    body: "استفاده از گوشی در حال حاضر تمرکز یا خواب را مختل می‌کند؛ در بلوک‌های مطالعه گوشی را دور و اعلان‌ها را خاموش کن.",
  },
  eq: {
    title: "تمرین مهارت هیجانی",
    body: "مهارت‌های هیجانی نیاز به تمرین دارند؛ نام‌گذاری احساس و تمرین گفت‌وگوی همدلانه را در جلسات مشاوره بگنجان.",
  },
  communication: {
    title: "تمرین بیان و گوش دادن",
    body: "مهارت ارتباطی پایین‌تر است؛ در کار گروهی نقش مشخص بردار و قبل از پاسخ، حرف طرف مقابل را خلاصه کن.",
  },
  career: {
    title: "کاوش بیشتر مسیر شغلی",
    body: "برای تصمیم شغلی به اطلاعات و تجربه بیشتری نیاز است؛ با افراد شاغل گفت‌وگو کن و گزینه‌ها را محدود و مقایسه کن.",
  },
};

function recommendationFor(signal: PsychSignal): PsychPlanningRecommendation | null {
  if (!isBadSignal(signal)) return null;
  const template = RECOMMENDATION_TEXT[signal.area];
  if (!template) return null;
  return {
    title: template.title,
    body: `${template.body} (بر پایه «${signal.title}» در آزمون ${signal.sourceTest})`,
    sourceTest: signal.sourceTest,
    level: signal.level,
  };
}

function policyAdjustmentsFor(
  signals: PsychSignal[],
  base: PlanningPolicy,
): Partial<PlanningPolicy> {
  const adjustments: Partial<PlanningPolicy> = {};
  for (const signal of signals) {
    if (!isBadSignal(signal)) continue;
    const template = RECOMMENDATION_TEXT[signal.area];
    if (!template?.policy) continue;
    for (const [key, value] of Object.entries(template.policy)) {
      if (key === "reviewRatioPct") {
        adjustments.reviewRatioPct = Math.min(
          50,
          Math.max(adjustments.reviewRatioPct ?? base.reviewRatioPct, Number(value)),
        );
      } else if (key === "testRatioPct") {
        adjustments.testRatioPct = Math.min(
          base.testRatioPct,
          adjustments.testRatioPct ?? base.testRatioPct,
          Number(value),
        );
      } else if (key === "maxBlockMinutes") {
        adjustments.maxBlockMinutes = Math.min(
          base.maxBlockMinutes,
          adjustments.maxBlockMinutes ?? base.maxBlockMinutes,
          Number(value),
        );
      } else if (key === "minBlockMinutes") {
        adjustments.minBlockMinutes = Math.max(
          15,
          Math.min(
            base.minBlockMinutes,
            adjustments.minBlockMinutes ?? base.minBlockMinutes,
            Number(value),
          ),
        );
      } else if (key === "maxSubjectsPerDay") {
        adjustments.maxSubjectsPerDay = Math.max(
          1,
          Math.min(
            base.maxSubjectsPerDay,
            adjustments.maxSubjectsPerDay ?? base.maxSubjectsPerDay,
            Number(value),
          ),
        );
      }
    }
  }
  return adjustments;
}

export function applyPsychProfileToPolicy(
  base: PlanningPolicy,
  profile: StudentPsychProfile,
): PlanningPolicy {
  const adjustments = policyAdjustmentsFor(profile.signals, base);
  const merged: PlanningPolicy = {
    ...base,
    ...adjustments,
  };
  const notes = profile.recommendations.slice(0, 3).map((item) => item.title);
  if (notes.length > 0) {
    merged.notes = `${base.notes} توصیه‌های روان‌شناختی: ${notes.join("، ")}.`.slice(0, 600);
  }
  return merged;
}

export async function getStudentPsychProfile(
  workspaceId: string,
  studentId: string,
): Promise<StudentPsychProfile> {
  const db = await getDb();
  const rows = await db
    .select({ attempt: psychAttempts, test: psychTests })
    .from(psychAttempts)
    .innerJoin(psychTests, eq(psychAttempts.testId, psychTests.id))
    .where(
      and(
        eq(psychAttempts.workspaceId, workspaceId),
        eq(psychAttempts.studentId, studentId),
        eq(psychAttempts.status, "submitted"),
      ),
    )
    .orderBy(desc(psychAttempts.submittedAt), desc(psychAttempts.createdAt));

  const latestByTest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByTest.has(row.test.id)) latestByTest.set(row.test.id, row);
  }
  const latestRows = [...latestByTest.values()].sort(
    (first, second) =>
      (second.attempt.submittedAt?.getTime() ?? 0) - (first.attempt.submittedAt?.getTime() ?? 0),
  );

  if (latestRows.length === 0) {
    return {
      attempts: [],
      signals: [],
      recommendations: [],
      careerInterests: [],
      strengths: [],
      policyAdjustments: {},
    };
  }

  const testIds = latestRows.map((row) => row.test.id);
  const dimensionRows = await db
    .select()
    .from(psychDimensions)
    .where(inArray(psychDimensions.testId, testIds))
    .orderBy(asc(psychDimensions.sortOrder));

  const dimensionsByTest = new Map<string, typeof dimensionRows>();
  for (const dimension of dimensionRows) {
    const list = dimensionsByTest.get(dimension.testId) ?? [];
    list.push(dimension);
    dimensionsByTest.set(dimension.testId, list);
  }

  const attempts: PsychProfileAttempt[] = [];
  const signals: PsychSignal[] = [];

  for (const row of latestRows) {
    const dimensions = dimensionsByTest.get(row.test.id) ?? [];
    const scoringDimensions: PsychScoringDimension[] = dimensions.map((dimension) => ({
      id: dimension.id,
      title: dimension.title,
      description: dimension.description,
      bands: dimension.bandsJson ?? [],
    }));
    const result = scorePsychAttempt(
      scoringDimensions,
      [row.attempt.scoresJson ?? {}],
      row.test.resultRulesJson ?? [],
    );

    const attemptDimensions: PsychProfileAttempt["dimensions"] = [];
    for (const [index, dimension] of dimensions.entries()) {
      const score = row.attempt.scoresJson?.[dimension.id] ?? 0;
      const bands = dimension.bandsJson ?? [];
      const band = findPsychBand(bands, score);
      const level = levelFromBand(band, bands);
      attemptDimensions.push({
        title: dimension.title,
        score,
        bandLabel: band?.label ?? "",
        bandAnalysis: band?.analysis ?? "",
        level,
      });
      if (band) {
        signals.push({
          area: areaForTitle(dimension.title),
          title: dimension.title,
          level,
          label: band.label,
          analysis: band.analysis,
          sourceTest: row.test.title,
          sourceUrl: row.test.sourceUrl,
        });
      }
    }

    attempts.push({
      attemptId: row.attempt.id,
      testId: row.test.id,
      testTitle: row.test.title,
      category: row.test.category,
      sourceUrl: row.test.sourceUrl,
      resultCode: result.code || row.attempt.resultCode,
      resultTitle: result.title || row.attempt.resultTitle,
      resultBody: result.body || row.attempt.resultBody,
      submittedAt: row.attempt.submittedAt ?? row.attempt.startedAt,
      dimensions: attemptDimensions,
    });
  }

  const recommendations: PsychPlanningRecommendation[] = [];
  const seenRecommendations = new Set<string>();
  for (const signal of signals) {
    const recommendation = recommendationFor(signal);
    if (!recommendation) continue;
    if (seenRecommendations.has(recommendation.title)) continue;
    seenRecommendations.add(recommendation.title);
    recommendations.push(recommendation);
  }

  const interestSignals = signals
    .filter((signal) => signal.area === "interest" && signal.level === "high")
    .sort((first, second) => first.title.localeCompare(second.title));
  const careerInterests = interestSignals.slice(0, 3).map((signal) => ({
    title: signal.title,
    label: signal.label,
  }));

  const strengths = signals
    .filter((signal) => {
      if (signal.level !== "high") return false;
      if (signal.area === "interest") return false;
      return !CAUTION_PATTERN.test(signal.title);
    })
    .map((signal) => signal.title)
    .filter((title, index, all) => all.indexOf(title) === index)
    .slice(0, 6);

  return {
    attempts,
    signals,
    recommendations,
    careerInterests,
    strengths,
    policyAdjustments: policyAdjustmentsFor(signals, {
      strategy: "balanced",
      minutesPerPercentPoint: 60,
      minutesPerTest: 1.5,
      testsPerHour: 40,
      exercisesPerHour: 30,
      testRatioPct: 75,
      reviewRatioPct: 10,
      maxSubjectsPerDay: 3,
      minBlockMinutes: 30,
      maxBlockMinutes: 90,
      fillCapacity: true,
      notes: "",
    } as PlanningPolicy),
  };
}
