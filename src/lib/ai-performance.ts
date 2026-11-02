import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { aiRuns } from "@/db/schema";
import { formatTime } from "./dates";
import { WEEKDAY_LABELS } from "./dates";
import type { PerformanceAnalysis } from "./performance";

const PROMPT_VERSION = "performance-analysis-v1";

export function aiPerformanceConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL);
}

export type PerformanceNarrativeInput = {
  workspaceId: string;
  studentId: string;
  analysis: PerformanceAnalysis;
  plannedSubjectsByDay: string[][];
  notes: { weekday: number; slot: number; text: string }[];
  dailyRoutine: string;
};

export function deterministicPerformanceNarrative(input: PerformanceNarrativeInput): string {
  const { analysis } = input;
  const lines: string[] = [];

  if (!analysis.hasAnyData) {
    return "برای این هفته عملکردی ثبت نشده است. با ثبت ساعت شروع و پایان هر خانه، پایه تحلیل هفته‌های بعد ساخته می‌شود.";
  }

  const startRate = Math.round((analysis.onplanDays / analysis.activeDays) * 100);
  const startedDays = analysis.days.filter((day) => day.performedStartMin !== null);
  const avgStart =
    startedDays.length === 0
      ? null
      : Math.round(
          startedDays.reduce((sum, day) => sum + (day.performedStartMin ?? 0), 0) /
            startedDays.length,
        );

  lines.push(
    `در ${analysis.activeDays} روز فعال، نرخ شروع طبق برنامه ${startRate}٪ بوده و مجموع ${analysis.totalMinutes.toLocaleString("fa-IR")} دقیقه فعالیت با ${analysis.totalPractice.toLocaleString("fa-IR")} تمرین ثبت شده است.`,
  );

  if (avgStart !== null) {
    lines.push(`میانگین ساعت شروع روزها حدود ${formatTime(avgStart)} است.`);
  }

  const lateDays = analysis.days.filter((day) => day.status === "offplan");
  if (lateDays.length > 0) {
    const labels = lateDays.map((day) => WEEKDAY_LABELS[day.weekday]).join("، ");
    lines.push(`شروع خارج از برنامه در ${labels} دیده می‌شود؛ اولین بلوک روز را کوتاه‌تر و ساعتش را ثابت‌تر کنید.`);
  } else {
    lines.push("شروع روزها هماهنگ با برنامه بوده است؛ همین لنگر زمانی را برای هفته بعد حفظ کنید.");
  }

  const strongDays = analysis.days
    .filter((day) => day.practiceCount > 0)
    .sort((a, b) => b.practiceCount - a.practiceCount)
    .slice(0, 2);
  if (strongDays.length > 0) {
    const labels = strongDays
      .map((day) => `${WEEKDAY_LABELS[day.weekday]} (${day.practiceCount.toLocaleString("fa-IR")} تمرین)`)
      .join(" و ");
    lines.push(`بیشترین حجم تمرین در ${labels} بوده است؛ الگوی موفق آن روزها را به روزهای ضعیف‌تر بکشید.`);
  }

  if (input.notes.length > 0) {
    lines.push(
      `${input.notes.length.toLocaleString("fa-IR")} یادداشت از دانش‌آموز ثبت شده است؛ این توضیحات را در جلسه مشاوره مرور کنید.`,
    );
  } else {
    lines.push("هیچ یادداشتی ثبت نشده است؛ نوشتن یک خط توضیح برای هر خانه، کیفیت تحلیل را بالا می‌برد.");
  }

  if (input.dailyRoutine.trim()) {
    lines.push("روتین روزانه ثبت شده است؛ پایبندی به آن را جدا از بلوک‌های مطالعه بسنجید.");
  }

  lines.push("اقدام هفته بعد: ساعت شروع ثابت، اولین بلوک کوتاه، و ثبت به‌موقع عملکرد در همان روز.");
  return lines.join(" ");
}

async function logRun(input: {
  workspaceId: string;
  studentId: string;
  status: "success" | "fallback" | "error";
  model: string;
  inputHash: string;
  output: string;
  tokens?: number;
  error?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(aiRuns).values({
    workspaceId: input.workspaceId,
    studentId: input.studentId,
    kind: "performance_analysis",
    model: input.model,
    promptVersion: PROMPT_VERSION,
    inputHash: input.inputHash,
    outputJson: { narrative: input.output },
    tokens: input.tokens ?? 0,
    cost: "0",
    status: input.status,
    error: input.error ?? null,
  });
}

function buildPayload(input: PerformanceNarrativeInput) {
  const { analysis } = input;
  return {
    week_start: analysis.weekStart,
    days: analysis.days.map((day) => ({
      weekday: WEEKDAY_LABELS[day.weekday],
      date: day.date,
      planned_start_min: day.plannedStartMin,
      performed_start_min: day.performedStartMin,
      performed_end_min: day.performedEndMin,
      status: day.status,
      performed_minutes: day.performedMinutes,
      practice_count: day.practiceCount,
    })),
    totals: {
      active_days: analysis.activeDays,
      onplan_days: analysis.onplanDays,
      offplan_days: analysis.offplanDays,
      total_minutes: analysis.totalMinutes,
      total_practice: analysis.totalPractice,
    },
    planned_subjects_by_day: input.plannedSubjectsByDay,
    student_notes: input.notes,
    daily_routine: input.dailyRoutine.trim().slice(0, 400),
  };
}

export async function generatePerformanceNarrative(
  input: PerformanceNarrativeInput,
): Promise<{ narrative: string; source: "ai" | "fallback" }> {
  const payload = buildPayload(input);
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const fallback = deterministicPerformanceNarrative(input);

  if (!aiPerformanceConfigured()) {
    await logRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      status: "fallback",
      model: "deterministic",
      inputHash,
      output: fallback,
    }).catch(() => undefined);
    return { narrative: fallback, source: "fallback" };
  }

  const baseUrl = process.env.AI_BASE_URL!.replace(/\/+$/, "");
  const model = process.env.AI_MODEL!;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "تو مشاور تحصیلی و تحلیلگر عملکرد دانش‌آموز هستی. فقط یک JSON با کلید narrative برگردان. متن فارسی، حداکثر ۲۰۰ کلمه، درباره الگوی ساعت شروع و پایان، هماهنگی با برنامه، حجم تمرین و یادداشت‌های دانش‌آموز تحلیل بده و ۲ تا ۳ اقدام مشخص برای هفته بعد پیشنهاد کن. بدون نام یا داده هویتی.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as { narrative?: unknown };
    const narrative = typeof parsed.narrative === "string" ? parsed.narrative.trim() : "";

    if (narrative.length < 40) throw new Error("narrative too short");

    await logRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      status: "success",
      model,
      inputHash,
      output: narrative,
      tokens: data.usage?.total_tokens ?? 0,
    }).catch(() => undefined);

    return { narrative, source: "ai" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown ai error";
    await logRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      status: "error",
      model,
      inputHash,
      output: fallback,
      error: message,
    }).catch(() => undefined);
    return { narrative: fallback, source: "fallback" };
  }
}
