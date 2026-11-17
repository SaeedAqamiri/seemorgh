// Academic counseling report: combines psych-test profile, mock-exam results,
// resource progress and adherence into strengths / weaknesses / recommendations.
// Used by the "مشاوره تحصیلی" button and by the automatic-planning pipeline.
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  aiRuns as aiRunsTable,
  counselingReports,
  type CounselingReportData,
  type PsychProfileSummaryData,
} from "@/db/schema";
import { aiClientConfigured, chatJson, type ChatMessage } from "./ai-client";
import { addDays, startOfWeekSaturday, todayISO } from "./dates";
import { getPeriodReport } from "./counselor";
import { listStudentExamResults } from "./exam-analysis";
import { getStudentResourceProgress } from "./resource-progress";
import { getStudentPsychProfile } from "./psych-profile";
import { getPsychProfileSummary } from "./psych-ai";

const PROMPT_VERSION = "counseling-report-v1";

export type CounselingReport = CounselingReportData & {
  source: "ai" | "fallback";
  createdAt: Date;
};

function cleanStrings(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, 240))
    .slice(0, limit);
}

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

export async function getLatestCounselingReport(studentId: string): Promise<CounselingReport | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(counselingReports)
    .where(eq(counselingReports.studentId, studentId))
    .orderBy(desc(counselingReports.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    summary: row.summary,
    strengths: row.reportJson?.strengths ?? [],
    weaknesses: row.reportJson?.weaknesses ?? [],
    recommendations: row.reportJson?.recommendations ?? [],
    planningAdvice: row.reportJson?.planningAdvice ?? [],
    source: row.source === "ai" ? "ai" : "fallback",
    createdAt: row.createdAt,
  };
}

export async function saveCounselingReport(input: {
  workspaceId: string;
  studentId: string;
  data: CounselingReportData;
  source: "ai" | "fallback";
}): Promise<void> {
  const db = await getDb();
  await db.insert(counselingReports).values({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    summary: input.data.summary,
    reportJson: input.data,
    source: input.source,
  });
}

export function buildCounselingPayload(input: {
  psychSummary: PsychProfileSummaryData | null;
  psychRecommendations: { title: string; body: string; sourceTest: string }[];
  examResults: {
    title: string;
    date: string;
    overallPercent: number;
    subjects: { title: string; percent: number }[];
  }[];
  resourceProgress: {
    percent: number;
    remainingUnits: number;
    bySubject: { title: string; percent: number; remainingUnits: number }[];
  };
  adherence: { plannedMinutes: number; doneMinutes: number; doneTasks: number; totalTasks: number };
}): Record<string, unknown> {
  return {
    psych_summary: input.psychSummary
      ? {
          summary: input.psychSummary.summary,
          personality_traits: input.psychSummary.personalityTraits,
          academic_traits: input.psychSummary.academicTraits,
          strengths: input.psychSummary.strengths,
          weaknesses: input.psychSummary.weaknesses,
        }
      : null,
    psych_recommendations: input.psychRecommendations,
    exam_results: input.examResults,
    resource_progress: input.resourceProgress,
    adherence: {
      percent:
        input.adherence.plannedMinutes === 0
          ? 0
          : Math.round((input.adherence.doneMinutes / input.adherence.plannedMinutes) * 100),
      done_tasks: input.adherence.doneTasks,
      total_tasks: input.adherence.totalTasks,
    },
  };
}

export function fallbackCounselingReport(input: {
  psychSummary: PsychProfileSummaryData | null;
  psychRecommendations: { title: string; body: string; sourceTest: string }[];
  examResults: {
    title: string;
    date: string;
    overallPercent: number;
    subjects: { title: string; percent: number }[];
  }[];
  resourceProgress: {
    percent: number;
    remainingUnits: number;
    bySubject: { title: string; percent: number; remainingUnits: number }[];
  };
  adherence: { plannedMinutes: number; doneMinutes: number; doneTasks: number; totalTasks: number };
}): CounselingReportData {
  const latest = input.examResults[0];
  const weakSubjects = latest
    ? [...latest.subjects].sort((first, second) => first.percent - second.percent).slice(0, 3)
    : [];
  const strongSubjects = latest
    ? [...latest.subjects].sort((first, second) => second.percent - first.percent).slice(0, 3)
    : [];
  const behindResources = [...input.resourceProgress.bySubject]
    .sort((first, second) => first.percent - second.percent)
    .slice(0, 3);
  const adherencePercent =
    input.adherence.plannedMinutes === 0
      ? 0
      : Math.round((input.adherence.doneMinutes / input.adherence.plannedMinutes) * 100);

  const summaryParts: string[] = [];
  if (latest) {
    summaryParts.push(
      `در جدیدترین کارنامه (${latest.title}) میانگین درصد ${fa(latest.overallPercent)} ثبت شده است.`,
    );
  }
  if (strongSubjects.length > 0) {
    summaryParts.push(`درس‌های نسبتاً قوی: ${strongSubjects.map((item) => item.title).join("، ")}.`);
  }
  if (weakSubjects.length > 0) {
    summaryParts.push(
      `درس‌های نیازمند تمرکز: ${weakSubjects.map((item) => `${item.title} (${fa(item.percent)}٪)`).join("، ")}.`,
    );
  }
  summaryParts.push(
    `پیشرفت منابع ${fa(input.resourceProgress.percent)}٪ و پایبندی به برنامه ${fa(adherencePercent)}٪ است.`,
  );
  if (input.psychSummary) {
    summaryParts.push("تحلیل روان‌شناختی در بخش نقاط قوت و ضعف لحاظ شده است.");
  }

  const strengths = [
    ...(input.psychSummary?.strengths ?? []).slice(0, 3),
    ...strongSubjects.map((item) => `درصد相对اً بالا در ${item.title} (${fa(item.percent)}٪)`),
  ].slice(0, 6);

  const weaknesses = [
    ...(input.psychSummary?.weaknesses ?? []).slice(0, 3),
    ...weakSubjects.map((item) => `درصد پایین در ${item.title} (${fa(item.percent)}٪)`),
    ...behindResources.map(
      (item) => `پیشرفت منابع ${item.title} فقط ${fa(item.percent)}٪ است`,
    ),
  ].slice(0, 6);

  const recommendations = [
    ...input.psychRecommendations.slice(0, 3).map((item) => `${item.title}: ${item.body}`),
    ...weakSubjects.map(
      (item) => `برای ${item.title} بلوک‌های تمرین و تست هدفمند با اولویت بالاتر در برنامه بگذارید.`,
    ),
    adherencePercent < 60
      ? "پایبندی پایین است؛ طول بلوک‌ها را کوتاه‌تر و شروع روز را با یک تسک ساده لنگر کنید."
      : "پایبندی قابل قبول است؛ همین ساختار را حفظ و کیفیت تحلیل آزمون‌ها را بالا ببرید.",
  ].slice(0, 6);

  const planningAdvice = [
    ...weakSubjects.map((item) => `سهم زمانی بیشتری به ${item.title} اختصاص یابد.`),
    ...behindResources.slice(0, 2).map(
      (item) => `تکمیل منابع عقب‌مانده ${item.title} در هفته‌های نزدیک در اولویت باشد.`,
    ),
    input.resourceProgress.percent >= 80
      ? "منابع تقریباً کامل‌اند؛ تمرکز برنامه به مرور فاصله‌دار و آزمون منتقل شود."
      : "پیش از هدف، توازن بین پیشرفت منبع و تمرین تست حفظ شود.",
  ].slice(0, 5);

  return { summary: summaryParts.join(" "), strengths, weaknesses, recommendations, planningAdvice };
}

export function parseCounselingReport(
  raw: unknown,
  fallback: CounselingReportData,
): CounselingReportData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const summary = typeof data.summary === "string" ? data.summary.trim() : "";
  if (summary.length < 30) return null;
  const merge = (value: unknown, back: string[]): string[] => {
    const parsed = cleanStrings(value, 6);
    return parsed.length > 0 ? parsed : back;
  };
  return {
    summary: summary.slice(0, 1200),
    strengths: merge(data.strengths, fallback.strengths),
    weaknesses: merge(data.weaknesses, fallback.weaknesses),
    recommendations: merge(data.recommendations, fallback.recommendations),
    planningAdvice: merge(data.planningAdvice, fallback.planningAdvice),
  };
}

export type CounselingInputs = Awaited<ReturnType<typeof gatherCounselingInputs>>;

export async function gatherCounselingInputs(workspaceId: string, studentId: string) {
  const today = todayISO();
  const from = addDays(startOfWeekSaturday(today), -28);
  const to = today;
  const [examResults, resourceProgress, psychProfile, psychSummary, adherence] = await Promise.all([
    listStudentExamResults(studentId).catch(() => []),
    getStudentResourceProgress(studentId, workspaceId).catch(() => ({
      percent: 0,
      remainingUnits: 0,
      bySubject: [] as { subjectId: string; subjectTitle: string; percent: number; remainingUnits: number }[],
    })),
    getStudentPsychProfile(workspaceId, studentId).catch(() => ({
      attempts: [],
      signals: [],
      recommendations: [],
      careerInterests: [],
      strengths: [],
      policyAdjustments: {},
    })),
    getPsychProfileSummary(studentId).catch(() => ({ data: null, source: "", updatedAt: null })),
    getPeriodReport(workspaceId, studentId, from, to).catch(() => ({
      plannedMinutes: 0,
      doneMinutes: 0,
      doneTasks: 0,
      totalTasks: 0,
    })),
  ]);

  return {
    examResults: examResults.slice(0, 3).map((result) => ({
      title: result.title,
      date: result.examDate,
      overallPercent: result.overallPercent,
      subjects: result.subjects.map((subject) => ({ title: subject.subjectTitle, percent: subject.percent })),
    })),
    resourceProgress: {
      percent: resourceProgress.percent,
      remainingUnits: resourceProgress.remainingUnits,
      bySubject: resourceProgress.bySubject.map((subject) => ({
        title: subject.subjectTitle,
        percent: subject.percent,
        remainingUnits: subject.remainingUnits,
      })),
    },
    psychSummary: psychSummary.data,
    psychRecommendations: psychProfile.recommendations.map((recommendation) => ({
      title: recommendation.title,
      body: recommendation.body,
      sourceTest: recommendation.sourceTest,
    })),
    adherence: {
      plannedMinutes: adherence.plannedMinutes,
      doneMinutes: adherence.doneMinutes,
      doneTasks: adherence.doneTasks,
      totalTasks: adherence.totalTasks,
    },
  };
}

export async function generateCounselingReport(input: {
  workspaceId: string;
  studentId: string;
  persist?: boolean;
}): Promise<{ report: CounselingReportData; source: "ai" | "fallback"; model: string }> {
  const inputs = await gatherCounselingInputs(input.workspaceId, input.studentId);
  const payload = buildCounselingPayload({
    psychSummary: inputs.psychSummary,
    psychRecommendations: inputs.psychRecommendations,
    examResults: inputs.examResults,
    resourceProgress: inputs.resourceProgress,
    adherence: inputs.adherence,
  });
  const fallback = fallbackCounselingReport({
    psychSummary: inputs.psychSummary,
    psychRecommendations: inputs.psychRecommendations,
    examResults: inputs.examResults,
    resourceProgress: inputs.resourceProgress,
    adherence: inputs.adherence,
  });
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const persistFallback = async (status: "fallback" | "error", error?: string) => {
    const db = await getDb();
    await db
      .insert(aiRunsTable)
      .values({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        kind: "counseling_report",
        model: "deterministic",
        promptVersion: PROMPT_VERSION,
        inputHash,
        outputJson: { output: fallback },
        tokens: 0,
        cost: "0",
        status,
        error: error ?? null,
      })
      .catch(() => undefined);
    if (input.persist !== false) {
      await saveCounselingReport({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        data: fallback,
        source: "fallback",
      });
    }
  };

  if (!aiClientConfigured()) {
    await persistFallback("fallback", "unconfigured");
    return { report: fallback, source: "fallback", model: "deterministic" };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "تو مشاور تحصیلی باتجربه هستی. با تلفیق نتایج آزمون‌های روان‌شناسی، کارنامه آزمون‌های آزمایشی، پیشرفت منابع و پایبندی به برنامه، فقط یک JSON معتبر فارسی برگردان با کلیدهای: summary (جمع‌بندی ۴ تا ۶ جمله‌ای وضعیت کلی دانش‌آموز)، strengths (حداکثر ۶ نقطه قوت با دلیل کوتاه)، weaknesses (حداکثر ۶ نقطه ضعف با دلیل کوتاه)، recommendations (حداکثر ۶ توصیه مشاوره‌ای مشخص و اجراپذیر)، planningAdvice (حداکثر ۵ توصیه مستقیم برای برنامه‌ریزی خودکار مثل سهم زمانی درس‌ها یا الگوی بلوک‌ها). بدون نام یا داده هویتی؛ لحن حرفه‌ای و امیدوارکننده.",
    },
    { role: "user", content: JSON.stringify(payload) },
  ];
  const response = await chatJson<Record<string, unknown>>({
    messages,
    maxTokens: 5000,
    timeoutMs: 60_000,
  });

  const db = await getDb();
  if (!response.ok) {
    await persistFallback(response.error === "unconfigured" ? "fallback" : "error", response.error);
    return { report: fallback, source: "fallback", model: response.model };
  }

  const parsed = parseCounselingReport(response.data, fallback);
  if (!parsed) {
    await db
      .insert(aiRunsTable)
      .values({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        kind: "counseling_report",
        model: response.model,
        promptVersion: PROMPT_VERSION,
        inputHash,
        outputJson: { output: response.data },
        tokens: response.tokens,
        cost: "0",
        status: "fallback",
        error: "invalid counseling shape",
      })
      .catch(() => undefined);
    if (input.persist !== false) {
      await saveCounselingReport({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        data: fallback,
        source: "fallback",
      });
    }
    return { report: fallback, source: "fallback", model: response.model };
  }

  await db
    .insert(aiRunsTable)
    .values({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      kind: "counseling_report",
      model: response.model,
      promptVersion: PROMPT_VERSION,
      inputHash,
      outputJson: { output: parsed },
      tokens: response.tokens,
      cost: "0",
      status: "success",
      error: null,
    })
    .catch(() => undefined);

  if (input.persist !== false) {
    await saveCounselingReport({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      data: parsed,
      source: "ai",
    });
  }

  return { report: parsed, source: "ai", model: response.model };
}
