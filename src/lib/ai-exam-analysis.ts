import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { aiRuns, type ExamAnalysisCauseRow } from "@/db/schema";
import { chatJson } from "./ai-client";
import { buildGoalBaseline } from "./exam-analysis-wizard";
import type { ExamResultView } from "./exam-analysis";

const PROMPT_VERSION = "exam-analysis-v1";

export type ExamAiKind = "actions" | "advice" | "goals";

async function logRun(input: {
  workspaceId: string;
  studentId: string;
  kind: ExamAiKind;
  model: string;
  inputHash: string;
  output: string;
  tokens?: number;
  status: "success" | "fallback" | "error";
  error?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(aiRuns).values({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    kind: `exam_analysis_${input.kind}`,
    model: input.model,
    promptVersion: PROMPT_VERSION,
    inputHash: input.inputHash,
    outputJson: { output: input.output },
    tokens: input.tokens ?? 0,
    cost: "0",
    status: input.status,
    error: input.error ?? null,
  });
}

function examPayload(exam: ExamResultView) {
  return {
    title: exam.title,
    date: exam.examDate,
    overallPercent: exam.overallPercent,
    subjects: exam.subjects.map((subject) => ({
      subject: subject.subjectTitle,
      percent: subject.percent,
      correct: subject.correct,
      wrong: subject.wrong,
      blank: subject.blank,
      total: subject.total,
    })),
  };
}

export type ExamActionSuggestion = { subjectTitle: string; action: string };

export async function generateExamActions(input: {
  workspaceId: string;
  studentId: string;
  exam: ExamResultView;
  causes: ExamAnalysisCauseRow[];
}): Promise<{ actions: ExamActionSuggestion[]; source: "ai" | "fallback" }> {
  const payload = {
    exam: examPayload(input.exam),
    causes: input.causes.map((row) => ({
      subject: row.subjectTitle,
      percent: row.percent,
      wrong: row.wrong,
      blank: row.blank,
      cause: row.cause,
    })),
  };
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const response = await chatJson<{ actions?: unknown }>({
    messages: [
      {
        role: "system",
        content:
          "تو مشاور تحصیلی کنکور هستی. دانش‌آموز علت غلط و نزده زدن تست‌هایش را خودش نوشته است. فقط JSON برگردان با کلید actions: آرایه‌ای از {subject, action}. برای هر درس یک «اقدام و راهبرد» فارسی، مشخص و قابل اجرا (دو جمله حداکثر، خطاب به دانش‌آموز و با لحن «تو») بنویس که مستقیماً به علت نوشته‌شده پاسخ می‌دهد؛ تکرار کلی‌گویی ممنوع. هیچ متن اضافه‌ای برنگردان.",
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.4,
    maxTokens: 1600,
  });

  if (response.ok) {
    try {
      const parsed = response.data as { actions?: unknown };
      const list = Array.isArray(parsed.actions) ? parsed.actions : [];
      const actions = list
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => typeof entry.subject === "string" && typeof entry.action === "string")
        .map((entry) => ({
          subjectTitle: String(entry.subject),
          action: String(entry.action).slice(0, 500),
        }));
      if (actions.length > 0) {
        await logRun({
          workspaceId: input.workspaceId,
          studentId: input.studentId,
          kind: "actions",
          model: response.model,
          inputHash,
          output: JSON.stringify(actions),
          tokens: response.tokens,
          status: "success",
        }).catch(() => undefined);
        return { actions, source: "ai" };
      }
      throw new Error("empty actions");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      await logRun({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        kind: "actions",
        model: response.model,
        inputHash,
        output: "",
        status: "error",
        error: message,
      }).catch(() => undefined);
    }
  }

  const fallback = input.causes.map((row) => {
    const weak = row.percent < 50;
    return {
      subjectTitle: row.subjectTitle,
      action: weak
        ? `برای «${row.subjectTitle}» ابتدا مباحث پرتکرار را مرور کن، بعد روزی ${row.blank > row.wrong ? "یک ست تایم‌دار" : "۲۰ تست"} از همان مباحث بزن و اشتباهات را دفترچه کن.`
        : `برای «${row.subjectTitle}» همین روند را حفظ کن؛ روی علت نوشته‌شده (${row.cause.slice(0, 40)}) کار کن و تست‌های ترکیبی و زمان‌دار بیشتری بزن.`,
    };
  });
  await logRun({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    kind: "actions",
    model: response.ok ? response.model : "deterministic",
    inputHash,
    output: JSON.stringify(fallback),
    status: "fallback",
    error: response.ok ? undefined : response.error,
  }).catch(() => undefined);
  return { actions: fallback, source: "fallback" };
}

export async function generateExamAdvice(input: {
  workspaceId: string;
  studentId: string;
  exam: ExamResultView;
  preparation: {
    subject: string;
    topicTests: number;
    timedTests: number;
    avgPercent: number | null;
    percent: number;
  }[];
  previousAverage: number | null;
}): Promise<{ advice: string; source: "ai" | "fallback" }> {
  const payload = {
    exam: examPayload(input.exam),
    preparation: input.preparation,
    previousAverage: input.previousAverage,
  };
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const response = await chatJson<{ advice?: unknown }>({
    messages: [
      {
        role: "system",
        content:
          "تو مشاور ارشد تحصیلی هستی و باید بخش «توصیه‌های مشاور برای این آزمون» را بنویسی. فقط JSON برگردان با کلید advice. متن فارسی، ۳ تا ۵ جمله، خطاب به دانش‌آموز و با لحن صمیمی «تو». به حجم واقعی آماده‌سازی (تست مبحثی، تست زمان‌دار) و فاصلهٔ درصد فعلی با میانگین آزمون‌های قبلی اشاره کن و ۲ تا ۳ اقدام مشخص برای آزمون‌های بعدی بده. هیچ متن اضافه‌ای برنگردان.",
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.4,
    maxTokens: 900,
  });

  if (response.ok) {
    const advice = typeof response.data.advice === "string" ? response.data.advice.trim() : "";
    if (advice.length >= 40) {
      await logRun({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        kind: "advice",
        model: response.model,
        inputHash,
        output: advice,
        tokens: response.tokens,
        status: "success",
      }).catch(() => undefined);
      return { advice, source: "ai" };
    }
  }

  const avg = input.previousAverage;
  const fallback =
    `با بررسی کارنامه «${input.exam.title}»، درصد وزنی تو ${input.exam.overallPercent}٪ بوده است` +
    (avg === null ? "." : ` و نسبت به میانگین قبلی‌ات (${avg}٪) فاصله معناداری داری.`) +
    ` حجم آماده‌سازی ثبت‌شده برای این آزمون کمتر از آن چیزی است که برای جبران فاصله‌ها لازم است؛ پیش از آزمون بعدی برای هر درس حداقل ${input.preparation.length > 0 ? "دو ست تست مبحثی و یک آزمون زمان‌دار" : "یک برنامه تست هفتگی"} روی برنامه بگذار.` +
    ` علت‌های ثبت‌شده‌ات را با دفترچه اشتباهات تطبيق بده و برای درس‌های زیر ۳۰ درصد زودتر از بقیه شروع کن.`;

  await logRun({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    kind: "advice",
    model: response.ok ? response.model : "deterministic",
    inputHash,
    output: fallback,
    status: "fallback",
    error: response.ok ? undefined : response.error,
  }).catch(() => undefined);
  return { advice: fallback, source: "fallback" };
}

export type ExamGoalSuggestion = {
  subjectTitle: string;
  targetPercent: number;
  note: string;
};

export async function generateExamGoals(input: {
  workspaceId: string;
  studentId: string;
  exam: ExamResultView;
  previousAverages: { subject: string; average: number | null }[];
}): Promise<{ goals: ExamGoalSuggestion[]; source: "ai" | "fallback" }> {
  const payload = {
    exam: examPayload(input.exam),
    previousAverages: input.previousAverages,
  };
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const response = await chatJson<{ goals?: unknown }>({
    messages: [
      {
        role: "system",
        content:
          "تو مشاور تحصیلی کنکور هستی و باید برای آزمون بعدی هدف‌گذاری کنی. فقط JSON برگردان با کلید goals: آرایه‌ای از {subject, targetPercent, note}. targetPercent عدد صحیح بین 0 تا 100 و واقع‌بینانه (رشد ۵ تا ۱۵ واحدی نسبت به درصد فعلی، بسته به روند) باشد. note یک جمله فارسی کوتاه و مشخص دربارهٔ اینکه برای رسیدن به این هدف چه چیزی عوض شود. هیچ متن اضافه‌ای برنگردان.",
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.4,
    maxTokens: 1400,
  });

  if (response.ok) {
    try {
      const list = Array.isArray(response.data.goals) ? response.data.goals : [];
      const goals = list
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => typeof entry.subject === "string" && Number.isFinite(Number(entry.targetPercent)))
        .map((entry) => ({
          subjectTitle: String(entry.subject),
          targetPercent: Math.max(0, Math.min(100, Math.round(Number(entry.targetPercent)))),
          note: typeof entry.note === "string" ? entry.note.slice(0, 300) : "",
        }));
      if (goals.length > 0) {
        await logRun({
          workspaceId: input.workspaceId,
          studentId: input.studentId,
          kind: "goals",
          model: response.model,
          inputHash,
          output: JSON.stringify(goals),
          tokens: response.tokens,
          status: "success",
        }).catch(() => undefined);
        return { goals, source: "ai" };
      }
      throw new Error("empty goals");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      await logRun({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        kind: "goals",
        model: response.model,
        inputHash,
        output: "",
        status: "error",
        error: message,
      }).catch(() => undefined);
    }
  }

  const baseline = buildGoalBaseline(input.exam).map((row) => ({
    subjectTitle: row.subjectTitle,
    targetPercent: row.targetPercent ?? row.currentPercent,
    note: "هدف داده‌محور بر پایهٔ روند آزمون‌های قبلی؛ در صورت نیاز دستی تنظیم کن.",
  }));
  await logRun({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    kind: "goals",
    model: response.ok ? response.model : "deterministic",
    inputHash,
    output: JSON.stringify(baseline),
    status: "fallback",
    error: response.ok ? undefined : response.error,
  }).catch(() => undefined);
  return { goals: baseline, source: "fallback" };
}
