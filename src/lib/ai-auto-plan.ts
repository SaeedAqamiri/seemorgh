import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { aiRuns } from "@/db/schema";
import { chatJson } from "./ai-client";
import { daysBetween, startOfWeekSaturday } from "./dates";
import {
  buildDeterministicAllocation,
  dateCapacity,
  metricScale,
  planDates,
  sanitizeAutoAllocation,
  type AutoAllocation,
  type AutoPlanInput,
} from "./auto-plan";

const PROMPT_VERSION = "goal-allocation-v1";

function weeklyCapacity(input: AutoPlanInput): { weekday: number; minutes: number }[] {
  const sums = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  for (const date of planDates(input)) {
    const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 1) % 7;
    sums[weekday].total += dateCapacity(input.availability, input.constraints, date, input.schoolPeriods ?? [], input.exams ?? []);
    sums[weekday].count += 1;
  }
  return sums.map((sum, weekday) => ({
    weekday,
    minutes: sum.count > 0 ? Math.round(sum.total / sum.count) : 0,
  }));
}

function anonymizedInput(input: AutoPlanInput): Record<string, unknown> {
  const dates = planDates(input);
  const totalCapacity = dates.reduce(
    (sum, date) => sum + dateCapacity(input.availability, input.constraints, date, input.schoolPeriods ?? [], input.exams ?? []),
    0,
  );
  return {
    start_date: input.startDate,
    target_date: input.targetDate,
    horizon_days: Math.max(1, daysBetween(input.startDate, input.targetDate) + 1),
    first_week_start: startOfWeekSaturday(input.startDate),
    total_capacity_minutes: totalCapacity,
    school_periods: input.schoolPeriods ?? [],
    exams: input.exams ?? [],
    student_level: input.level ?? "normal",
    weekly_capacity: weeklyCapacity(input),
    constraints: {
      max_daily_minutes: input.constraints.maxDailyMinutes,
      rest_weekday: input.constraints.restWeekday,
      buffer_pct: input.constraints.bufferPct,
    },
    goals: input.goals.map((goal) => {
      const scale = metricScale(goal.metric);
      return {
        subject_id: goal.subjectId,
        subject_title: goal.subjectTitle,
        metric: goal.metric,
        scale,
        current: goal.currentValue,
        target: goal.targetValue,
        gap_percent: Math.max(0, ((goal.targetValue - goal.currentValue) / scale) * 100),
        weight: goal.weight,
      };
    }),
    resources: input.resources.map((resource) => ({
      id: resource.id,
      subject_id: resource.subjectId,
      title: resource.title,
      unit_type: resource.unitType,
      total_units: resource.totalUnits,
      remaining_units: Math.max(0, resource.totalUnits - resource.completedUnits),
      priority: resource.priority,
      chapters: resource.chapters?.map((chapter) => chapter.title) ?? null,
    })),
    policy: input.policy,
  };
}

async function logRun(input: {
  workspaceId: string;
  studentId: string;
  status: "success" | "fallback" | "error";
  model: string;
  inputHash: string;
  output: unknown;
  tokens?: number;
  error?: string;
}): Promise<string> {
  const db = await getDb();
  const [run] = await db
    .insert(aiRuns)
    .values({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      kind: "goal_plan",
      model: input.model,
      promptVersion: PROMPT_VERSION,
      inputHash: input.inputHash,
      outputJson: { output: input.output },
      tokens: input.tokens ?? 0,
      cost: "0",
      status: input.status,
      error: input.error ?? null,
    })
    .returning();
  return run.id;
}

export function aiAutoPlanningConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL);
}

export type AiAutoAllocationResult =
  | { ok: true; allocation: AutoAllocation; runId: string; source: "ai" }
  | {
      ok: false;
      errors: string[];
      runId: string | null;
      source: "invalid" | "unconfigured" | "error";
      fallback: AutoAllocation;
    };

export async function generateAiAutoAllocation(input: {
  workspaceId: string;
  studentId: string;
  planner: AutoPlanInput;
  counselingNotes?: string[];
}): Promise<AiAutoAllocationResult> {
  const payload = anonymizedInput(input.planner);
  if (input.counselingNotes && input.counselingNotes.length > 0) {
    payload.counseling_notes = input.counselingNotes;
  }
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const model = process.env.AI_MODEL ?? "deterministic";
  const fallback = buildDeterministicAllocation(input.planner);

  if (!aiAutoPlanningConfigured()) {
    return {
      ok: false,
      errors: ["AI پیکربندی نشده است."],
      runId: null,
      source: "unconfigured",
      fallback,
    };
  }

  try {
    const response = await chatJson<unknown>({
      messages: [
        {
          role: "system",
          content:
            "تو برنامه‌ریز تحصیلی هستی. فقط JSON معتبر با کلیدهای subjects و warnings برگردان. برای هر درس یک شیء بده: subject_id، tests (تعداد کل تست در بازه)، study_minutes، review_minutes، distribution (even|front_loaded|back_loaded)، focus (جمله کوتاه فارسی). مجموع زمان تست‌ها (tests × minutesPerTest) + study_minutes + review_minutes را با ظرفیت کل و اهداف هماهنگ کن. منابع لازم نیست کامل شوند؛ تعداد تست را بر اساس فاصله هدف و زمان تعیین کن. هیچ درس یا منبعی خارج از فهرست ورودی نساز. notes سیاست و counseling_notes (توصیه‌های مشاور تحصیلی بر پایه آزمون‌های روان‌شناسی و کارنامه) را در توزیع زمان لحاظ کن. بدون نام یا داده هویتی. warnings فقط جمله‌های فارسی کوتاه.",
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.2,
      maxTokens: 8000,
      timeoutMs: 60_000,
    });

    if (!response.ok) throw new Error(response.error);

    const parsed = response.data as unknown;
    const validated = sanitizeAutoAllocation(input.planner, parsed);

    if (!validated.ok) {
      const runId = await logRun({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        status: "fallback",
        model: response.model,
        inputHash,
        output: parsed,
        tokens: response.tokens,
        error: validated.errors.slice(0, 6).join(" | "),
      });
      return {
        ok: false,
        errors: validated.errors,
        runId,
        source: "invalid",
        fallback,
      };
    }

    const runId = await logRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      status: "success",
      model: response.model,
      inputHash,
      output: parsed,
      tokens: response.tokens,
    });

    return { ok: true, allocation: validated.allocation, runId, source: "ai" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown ai error";
    const runId = await logRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      status: "error",
      model,
      inputHash,
      output: null,
      error: message,
    }).catch(() => null);

    return { ok: false, errors: [message], runId, source: "error", fallback };
  }
}
