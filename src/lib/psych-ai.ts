// Psychological AI analysis: per-test personality analysis and overall profile summary.
// No "server-only" import so offline scripts (tsx) can reuse the same logic.
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  aiRuns,
  psychAttempts,
  psychProfileSummaries,
  type PsychAiAnalysis,
  type PsychBand,
  type PsychProfileSummaryData,
} from "@/db/schema";
import { aiClientConfigured, chatJson, type ChatMessage } from "./ai-client";

const PROMPT_ANALYSIS = "psych-analysis-v1";
const PROMPT_PROFILE = "psych-profile-v1";

const CAUTION_PATTERN =
  /حواس.?پرتی|اهمال|تعویق|اضطراب|نگرانی|استرس|فشار|تردید|بی.?انگیزگی|کمال|روان.?رنجوری|اجتناب|بیزاری|دشواری|تعارض|زمان صفحه|گوشی|نوسان/;

export type AnalysisDimensionInput = {
  title: string;
  score: number;
  max: number;
  bandLabel: string;
  bandAnalysis: string;
  level: "low" | "mid" | "high";
};

export function levelFromBands(band: PsychBand | null, bands: PsychBand[]): "low" | "mid" | "high" {
  if (!band) return "mid";
  const sorted = [...bands].sort((first, second) => first.min - second.min);
  const index = sorted.findIndex((entry) => entry.min === band.min && entry.max === band.max);
  if (sorted.length <= 1 || index < 0) return "mid";
  if (index === 0) return "low";
  if (index === sorted.length - 1) return "high";
  return "mid";
}

export function isCautionDimension(title: string): boolean {
  return CAUTION_PATTERN.test(title);
}

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

function cleanStrings(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, 240))
    .slice(0, limit);
}

function cleanTitle(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : "";
}

export function buildAnalysisPayload(input: {
  testTitle: string;
  category: string;
  resultCode: string;
  resultTitle: string;
  dimensions: AnalysisDimensionInput[];
}): Record<string, unknown> {
  return {
    test_title: input.testTitle,
    category: input.category,
    result_type: { code: input.resultCode, title: input.resultTitle },
    dimensions: input.dimensions.map((dimension) => ({
      title: dimension.title,
      score: dimension.score,
      max: dimension.max,
      level:
        dimension.level === "low" ? "کم" : dimension.level === "high" ? "بالا" : "متوسط",
      band_label: dimension.bandLabel,
    })),
  };
}

export function fallbackPsychAnalysis(input: {
  testTitle: string;
  resultCode: string;
  resultTitle: string;
  dimensions: AnalysisDimensionInput[];
}): PsychAiAnalysis {
  const strong = input.dimensions.filter(
    (dimension) => dimension.level === "high" && !isCautionDimension(dimension.title),
  );
  const weak = input.dimensions.filter(
    (dimension) => dimension.level === "low" && !isCautionDimension(dimension.title),
  );
  const caution = input.dimensions.filter(
    (dimension) =>
      (isCautionDimension(dimension.title) && dimension.level === "high") ||
      (!isCautionDimension(dimension.title) && dimension.level === "low"),
  );

  const summaryParts: string[] = [];
  summaryParts.push(
    `نتیجه ${input.resultTitle || input.testTitle} نشان می‌دهد ${
      strong.length > 0
        ? `قوت اصلی این دانش‌آموز در «${strong.map((item) => item.title).join("، ")}» است`
        : "هیچ بُعدی در سطح برجسته دیده نمی‌شود"
    }.`,
  );
  if (weak.length > 0) {
    summaryParts.push(`بُعد «${weak.map((item) => item.title).join("، ")}» فعلاً فرصت رشد است.`);
  }
  if (caution.length > 0) {
    summaryParts.push(
      `الگوی نیازمند توجه: ${caution.map((item) => item.title).join("، ")} — مدیریت این موارد روی عملکرد تحصیلی اثر مستقیم دارد.`,
    );
  }
  summaryParts.push(
    "این تحلیل بر پایه نتیجه خودگزارشی است و برای تصمیم برنامه‌ریزی آموزشی ساخته شده، نه تشخیص بالینی.",
  );

  return {
    title: input.resultTitle || input.testTitle,
    summary: summaryParts.join(" "),
    traits: input.dimensions.map((dimension) => ({
      title: dimension.title,
      level: dimension.bandLabel || (dimension.level === "high" ? "بالا" : dimension.level === "low" ? "کم" : "متوسط"),
      note: dimension.bandAnalysis,
    })),
    strengths: strong.map((item) => `${item.title} (${item.bandLabel})`).slice(0, 4),
    cautions: caution.map((item) => `${item.title} — ${item.bandAnalysis}`.slice(0, 200)).slice(0, 4),
    recommendations: caution
      .map((item) => item.bandAnalysis)
      .filter(Boolean)
      .slice(0, 4),
  };
}

export function parsePsychAnalysis(
  raw: unknown,
  fallback: PsychAiAnalysis,
): PsychAiAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const summary = cleanTitle(data.summary);
  if (summary.length < 20) return null;
  const rawTraits = Array.isArray(data.traits) ? data.traits : [];
  const traits = rawTraits
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      title: cleanTitle(entry.title),
      level: cleanTitle(entry.level),
      note: cleanTitle(entry.note),
    }))
    .filter((entry) => entry.title)
    .slice(0, 10);
  return {
    title: cleanTitle(data.title) || fallback.title,
    summary,
    traits: traits.length > 0 ? traits : fallback.traits,
    strengths: cleanStrings(data.strengths, 5),
    cautions: cleanStrings(data.cautions, 5),
    recommendations: cleanStrings(data.recommendations, 5),
  };
}

async function logPsychRun(input: {
  workspaceId: string;
  studentId: string | null;
  kind: string;
  promptVersion: string;
  model: string;
  inputHash: string;
  output: unknown;
  tokens: number;
  status: "success" | "fallback" | "error";
  error?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(aiRuns).values({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    kind: input.kind,
    model: input.model,
    promptVersion: input.promptVersion,
    inputHash: input.inputHash,
    outputJson: { output: input.output },
    tokens: input.tokens,
    cost: "0",
    status: input.status,
    error: input.error ?? null,
  });
}

function hashOf(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function generatePsychAttemptAnalysis(input: {
  workspaceId: string;
  studentId: string | null;
  attemptId: string;
  testTitle: string;
  category: string;
  resultCode: string;
  resultTitle: string;
  dimensions: AnalysisDimensionInput[];
}): Promise<{ analysis: PsychAiAnalysis; source: "ai" | "fallback"; model: string }> {
  const payload = buildAnalysisPayload(input);
  const fallback = fallbackPsychAnalysis(input);
  const inputHash = hashOf(payload);

  if (!aiClientConfigured()) {
    await logPsychRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      kind: "psych_analysis",
      promptVersion: PROMPT_ANALYSIS,
      model: "deterministic",
      inputHash,
      output: fallback,
      tokens: 0,
      status: "fallback",
    }).catch(() => undefined);
    return { analysis: fallback, source: "fallback", model: "deterministic" };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "تو روان‌شناس تربیتی هستی. فقط یک JSON معتبر فارسی با این کلیدها برگردان: title (جمله کوتاه عنوان تیپ)، summary (تحلیل ۳ تا ۵ جمله‌ای ویژگی‌های شخصیتی و تحصیلی)، traits (آرایه‌ای از {title, level, note} برای هر بُعد)، strengths (حداکثر ۴ مورد)، cautions (حداکثر ۴ مورد)، recommendations (حداکثر ۴ توصیه عملی کوتاه). لحن محترمانه و دوم‌شخص برای نتیجه‌ای که به دانش‌آموز نشان داده می‌شود؛ بدون نام یا داده هویتی؛ بدون تشخیص بالینی. فقط از داده‌های داده‌شده استفاده کن.",
    },
    { role: "user", content: JSON.stringify(payload) },
  ];
  const response = await chatJson<Record<string, unknown>>({ messages, maxTokens: 4000, timeoutMs: 45_000 });

  if (!response.ok) {
    await logPsychRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      kind: "psych_analysis",
      promptVersion: PROMPT_ANALYSIS,
      model: response.model,
      inputHash,
      output: fallback,
      tokens: 0,
      status: response.error === "unconfigured" ? "fallback" : "error",
      error: response.error,
    }).catch(() => undefined);
    return { analysis: fallback, source: "fallback", model: response.model };
  }

  const analysis = parsePsychAnalysis(response.data, fallback);
  if (!analysis) {
    await logPsychRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      kind: "psych_analysis",
      promptVersion: PROMPT_ANALYSIS,
      model: response.model,
      inputHash,
      output: response.data,
      tokens: response.tokens,
      status: "fallback",
      error: "invalid ai analysis shape",
    }).catch(() => undefined);
    return { analysis: fallback, source: "fallback", model: response.model };
  }

  await logPsychRun({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    kind: "psych_analysis",
    promptVersion: PROMPT_ANALYSIS,
    model: response.model,
    inputHash,
    output: analysis,
    tokens: response.tokens,
    status: "success",
  }).catch(() => undefined);

  return { analysis, source: "ai", model: response.model };
}

export type ProfileAttemptInput = {
  testTitle: string;
  category: string;
  resultCode: string;
  resultTitle: string;
  dimensions: { title: string; level: "low" | "mid" | "high"; bandLabel: string }[];
};

export function buildProfilePayload(input: {
  attempts: ProfileAttemptInput[];
}): Record<string, unknown> {
  return {
    tests: input.attempts.map((attempt) => ({
      test_title: attempt.testTitle,
      category: attempt.category,
      result: { code: attempt.resultCode, title: attempt.resultTitle },
      dimensions: attempt.dimensions.map((dimension) => ({
        title: dimension.title,
        level:
          dimension.level === "low" ? "کم" : dimension.level === "high" ? "بالا" : "متوسط",
        band_label: dimension.bandLabel,
      })),
    })),
  };
}

export function fallbackProfileSummary(input: {
  attempts: ProfileAttemptInput[];
}): PsychProfileSummaryData {
  const flat = input.attempts.flatMap((attempt) =>
    attempt.dimensions.map((dimension) => ({ ...dimension, testTitle: attempt.testTitle })),
  );
  const strengths = flat
    .filter((item) => item.level === "high" && !isCautionDimension(item.title))
    .map((item) => `${item.title} — ${item.bandLabel}`)
    .slice(0, 6);
  const weaknesses = flat
    .filter(
      (item) =>
        (isCautionDimension(item.title) && item.level === "high") ||
        (!isCautionDimension(item.title) && item.level === "low"),
    )
    .map((item) => `${item.title} — ${item.bandLabel}`)
    .slice(0, 6);
  const personality = input.attempts
    .filter((attempt) => attempt.category === "personal" || attempt.category === "career")
    .map((attempt) => `${attempt.resultTitle || attempt.testTitle}${attempt.resultCode ? ` (${attempt.resultCode})` : ""}`)
    .slice(0, 6);
  const academic = input.attempts
    .filter((attempt) => attempt.category === "academic")
    .flatMap((attempt) =>
      attempt.dimensions
        .filter((dimension) => dimension.level === "high" && !isCautionDimension(dimension.title))
        .map((dimension) => `${dimension.title} (${attempt.testTitle})`),
    )
    .slice(0, 6);
  const summaryParts: string[] = [];
  summaryParts.push(
    `پروفایل بر پایه ${fa(input.attempts.length)} آزمون روان‌شناسی ساخته شده است.`,
  );
  if (strengths.length > 0) {
    summaryParts.push(`نقاط قوت برجسته: ${strengths.slice(0, 3).join("، ")}.`);
  }
  if (weaknesses.length > 0) {
    summaryParts.push(`موارد نیازمند توجه: ${weaknesses.slice(0, 3).join("، ")}.`);
  }
  summaryParts.push(
    "این جمع‌بندی مبنای توصیه‌های مشاوره و تنظیم برنامه‌ریزی خودکار است و جای ارزیابی تخصصی را نمی‌گیرد.",
  );
  return {
    summary: summaryParts.join(" "),
    personalityTraits: personality,
    academicTraits: academic,
    strengths,
    weaknesses,
    recommendations: weaknesses.slice(0, 4),
  };
}

export function parseProfileSummary(
  raw: unknown,
  fallback: PsychProfileSummaryData,
): PsychProfileSummaryData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const summary = cleanTitle(data.summary);
  if (summary.length < 30) return null;
  const merge = (value: unknown, back: string[]): string[] => {
    const parsed = cleanStrings(value, 6);
    return parsed.length > 0 ? parsed : back;
  };
  return {
    summary,
    personalityTraits: merge(data.personalityTraits, fallback.personalityTraits),
    academicTraits: merge(data.academicTraits, fallback.academicTraits),
    strengths: merge(data.strengths, fallback.strengths),
    weaknesses: merge(data.weaknesses, fallback.weaknesses),
    recommendations: merge(data.recommendations, fallback.recommendations),
  };
}

export async function savePsychProfileSummary(input: {
  workspaceId: string;
  studentId: string;
  data: PsychProfileSummaryData;
  source: "ai" | "fallback";
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(psychProfileSummaries)
    .values({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      summary: input.data.summary,
      dataJson: input.data,
      source: input.source,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: psychProfileSummaries.studentId,
      set: {
        summary: input.data.summary,
        dataJson: input.data,
        source: input.source,
        updatedAt: new Date(),
      },
    });
}

export async function getPsychProfileSummary(
  studentId: string,
): Promise<{ data: PsychProfileSummaryData | null; source: string; updatedAt: Date | null }> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(psychProfileSummaries)
    .where(eq(psychProfileSummaries.studentId, studentId))
    .orderBy(desc(psychProfileSummaries.updatedAt))
    .limit(1);
  if (!row) return { data: null, source: "", updatedAt: null };
  return { data: row.dataJson ?? null, source: row.source, updatedAt: row.updatedAt };
}

export async function generatePsychProfileSummary(input: {
  workspaceId: string;
  studentId: string | null;
  attempts: ProfileAttemptInput[];
  persistStudentId?: string;
}): Promise<{ data: PsychProfileSummaryData; source: "ai" | "fallback"; model: string }> {
  const payload = buildProfilePayload({ attempts: input.attempts });
  const fallback = fallbackProfileSummary(input);
  const inputHash = hashOf(payload);

  if (!aiClientConfigured()) {
    if (input.persistStudentId) {
      await savePsychProfileSummary({
        workspaceId: input.workspaceId,
        studentId: input.persistStudentId,
        data: fallback,
        source: "fallback",
      }).catch(() => undefined);
    }
    return { data: fallback, source: "fallback", model: "deterministic" };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "تو روان‌شناس تربیتی و مشاور تحصیلی هستی. فقط یک JSON معتبر فارسی با این کلیدها برگردان: summary (پروفایل جامع ۴ تا ۶ جمله‌ای از ویژگی‌های شخصیتی و تحصیلی دانش‌آموز)، personalityTraits (حداکثر ۶ ویژگی شخصیتی با توضیح کوتاه)، academicTraits (حداکثر ۶ ویژگی تحصیلی/یادگیری)، strengths (حداکثر ۶ مورد)، weaknesses (حداکثر ۶ مورد)، recommendations (حداکثر ۶ توصیه عملی برای مشاور و برنامه‌ریزی). بدون نام یا داده هویتی؛ بر پایه صرف داده‌های آزمون؛ بدون تشخیص بالینی.",
    },
    { role: "user", content: JSON.stringify(payload) },
  ];
  const response = await chatJson<Record<string, unknown>>({ messages, maxTokens: 6000, timeoutMs: 60_000 });

  if (!response.ok) {
    await logPsychRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      kind: "psych_profile",
      promptVersion: PROMPT_PROFILE,
      model: response.model,
      inputHash,
      output: fallback,
      tokens: 0,
      status: response.error === "unconfigured" ? "fallback" : "error",
      error: response.error,
    }).catch(() => undefined);
    if (input.persistStudentId) {
      await savePsychProfileSummary({
        workspaceId: input.workspaceId,
        studentId: input.persistStudentId,
        data: fallback,
        source: "fallback",
      }).catch(() => undefined);
    }
    return { data: fallback, source: "fallback", model: response.model };
  }

  const data = parseProfileSummary(response.data, fallback);
  if (!data) {
    await logPsychRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      kind: "psych_profile",
      promptVersion: PROMPT_PROFILE,
      model: response.model,
      inputHash,
      output: response.data,
      tokens: response.tokens,
      status: "fallback",
      error: "invalid ai profile shape",
    }).catch(() => undefined);
    if (input.persistStudentId) {
      await savePsychProfileSummary({
        workspaceId: input.workspaceId,
        studentId: input.persistStudentId,
        data: fallback,
        source: "fallback",
      }).catch(() => undefined);
    }
    return { data: fallback, source: "fallback", model: response.model };
  }

  await logPsychRun({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    kind: "psych_profile",
    promptVersion: PROMPT_PROFILE,
    model: response.model,
    inputHash,
    output: data,
    tokens: response.tokens,
    status: "success",
  }).catch(() => undefined);

  if (input.persistStudentId) {
    await savePsychProfileSummary({
      workspaceId: input.workspaceId,
      studentId: input.persistStudentId,
      data,
      source: "ai",
    }).catch(() => undefined);
  }

  return { data, source: "ai", model: response.model };
}

export async function markAttemptAnalysis(input: {
  attemptId: string;
  analysis: PsychAiAnalysis;
  source: "ai" | "fallback";
}): Promise<void> {
  const db = await getDb();
  await db
    .update(psychAttempts)
    .set({
      analysisJson: input.analysis,
      analysisSource: input.source,
      analysisAt: new Date(),
    })
    .where(eq(psychAttempts.id, input.attemptId));
}
