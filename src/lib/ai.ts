import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { aiRuns } from "@/db/schema";

export type NarrativeMetrics = {
  plannedMinutes: number;
  doneMinutes: number;
  doneTasks: number;
  totalTasks: number;
  activeDays: number;
  eligibleDays: number;
  correctStarts: number;
  testsDone: number;
  remainingUnits: number;
  byWeek: { total: number; done: number; minutes: number }[];
};

const PROMPT_VERSION = "report-narrative-v1";

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL);
}

export function deterministicNarrative(metrics: NarrativeMetrics): string {
  const adherence =
    metrics.plannedMinutes === 0
      ? 0
      : Math.round((metrics.doneMinutes / metrics.plannedMinutes) * 100);
  const startRate =
    metrics.eligibleDays === 0
      ? 0
      : Math.round((metrics.correctStarts / metrics.eligibleDays) * 100);

  const lines: string[] = [];
  lines.push(
    `در این دوره ${metrics.doneTasks} از ${metrics.totalTasks} تسک انجام شد؛ پایبندی زمانی ${adherence}٪ و نرخ شروع درست ${startRate}٪ بود.`,
  );

  if (metrics.activeDays === 0) {
    lines.push("هیچ روز فعالی ثبت نشده است؛ ابتدا یک بلوک کوتاه و ثابت روزانه تعیین کنید.");
  } else if (adherence < 60) {
    lines.push("پایبندی زیر ۶۰٪ است؛ طول بلوک‌ها یا تعداد دروس روزانه را کاهش دهید و روی تداوم تمرکز کنید.");
  } else {
    lines.push("پایبندی در محدوده قابل قبول است؛ ساختار فعلی را حفظ کنید و کیفیت تمرین را بالا ببرید.");
  }

  if (startRate < 50) {
    lines.push("شروع درست ناپایدار است؛ اولین تسک روز را کوتاه، مشخص و در ساعت ثابت قرار دهید.");
  } else {
    lines.push("شروع درست پایدار بوده است؛ همان لنگر زمانی را برای هفته بعد نگه دارید.");
  }

  if (metrics.remainingUnits > 0) {
    lines.push(
      `هنوز ${metrics.remainingUnits.toLocaleString("fa-IR")} واحد از منابع باقی مانده است؛ توزیع آن را با ظرفیت هفته‌های آینده بسنجید.`,
    );
  } else {
    lines.push("منابع تکمیل شده‌اند؛ تمرکز هفته بعد را به مرور فاصله‌دار و آزمون منتقل کنید.");
  }

  if (metrics.testsDone === 0) {
    lines.push("در این دوره تستی ثبت نشده است؛ حداقل یک بلوک تست کوتاه در برنامه بگذارید.");
  }

  return lines.join(" ");
}

async function logAiRun(input: {
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
    kind: "report_narrative",
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

export async function generateNarrative(input: {
  workspaceId: string;
  studentId: string;
  metrics: NarrativeMetrics;
}): Promise<{ narrative: string; source: "ai" | "fallback" }> {
  const payload = {
    planned_minutes: input.metrics.plannedMinutes,
    done_minutes: input.metrics.doneMinutes,
    done_tasks: input.metrics.doneTasks,
    total_tasks: input.metrics.totalTasks,
    active_days: input.metrics.activeDays,
    eligible_days: input.metrics.eligibleDays,
    correct_starts: input.metrics.correctStarts,
    tests_done: input.metrics.testsDone,
    remaining_units: input.metrics.remainingUnits,
    weekly: input.metrics.byWeek,
  };

  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const fallback = deterministicNarrative(input.metrics);

  if (!aiConfigured()) {
    await logAiRun({
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
              "تو دستیار مشاور تحصیلی هستی. فقط یک JSON با کلید narrative برگردان. متن فارسی، حداکثر ۱۸۰ کلمه، بدون نام یا داده هویتی، و شامل ۲ تا ۴ اقدام مشخص برای هفته بعد باشد.",
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

    await logAiRun({
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
    await logAiRun({
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
