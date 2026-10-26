import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { aiRuns } from "@/db/schema";
import { weekDates, weekdayIndex } from "./dates";
import type {
  GeneratedPlan,
  PlannerAvailability,
  PlannerConstraints,
  PlannerExamTarget,
  PlannerResource,
  PlannedTask,
} from "./planner";

export type AiPlannerInput = {
  weekStart: string;
  availability: PlannerAvailability[];
  constraints: PlannerConstraints;
  resources: PlannerResource[];
  examTargets: PlannerExamTarget[];
};

const PROMPT_VERSION = "plan-allocation-v1";

type RawBlock = {
  date?: unknown;
  start_min?: unknown;
  minutes?: unknown;
  subject_id?: unknown;
  resource_id?: unknown;
  topic?: unknown;
  type?: unknown;
  target_units?: unknown;
  reason?: unknown;
};

type RawPlan = {
  days?: unknown;
  warnings?: unknown;
};

function isPlannerResource(value: unknown): value is PlannerResource {
  return Boolean(value && typeof value === "object" && "id" in value);
}

function toMinutes(value: unknown): number {
  if (typeof value === "number") return Math.floor(value);
  const text = String(value ?? "").trim();
  const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return Math.floor(Number(text));
}

function anonymizedInput(input: AiPlannerInput) {
  return {
    week_start: input.weekStart,
    availability: input.availability.map((slot) => ({
      weekday: slot.weekday,
      start_min: slot.startMin,
      end_min: slot.endMin,
    })),
    constraints: {
      max_daily_minutes: input.constraints.maxDailyMinutes,
      rest_weekday: input.constraints.restWeekday,
      buffer_pct: input.constraints.bufferPct,
    },
    resources: input.resources.map((resource) => ({
      id: resource.id,
      subject_id: resource.subjectId,
      subject_title: resource.subjectTitle,
      title: resource.title,
      unit_type: resource.unitType,
      total_units: resource.totalUnits,
      completed_units: resource.completedUnits,
      priority: resource.priority,
      chapters: resource.chapters ?? null,
    })),
    exam_targets: input.examTargets.map((target) => ({
      title: target.title,
      exam_date: target.examDate,
      weight: target.weight,
    })),
  };
}

function dayCapacity(input: AiPlannerInput, weekday: number): number {
  if (weekday === input.constraints.restWeekday) return 0;
  const windows = input.availability.filter((slot) => slot.weekday === weekday);
  const total = windows.reduce(
    (sum, slot) => sum + Math.max(0, slot.endMin - slot.startMin),
    0,
  );
  const capped = Math.min(total, Math.max(0, input.constraints.maxDailyMinutes));
  const buffer = Math.max(0, Math.min(80, input.constraints.bufferPct));
  return Math.max(0, Math.floor((capped * (100 - buffer)) / 100));
}

function withinWindow(input: AiPlannerInput, weekday: number, start: number, end: number): boolean {
  return input.availability.some(
    (slot) =>
      slot.weekday === weekday && start >= slot.startMin && end <= slot.endMin && end > start,
  );
}

export type AiPlanResult =
  | { ok: true; plan: GeneratedPlan; runId: string | null; source: "ai" }
  | { ok: false; errors: string[]; runId: string | null; source: "invalid" | "unconfigured" | "error" };

function finalizePlan(
  input: AiPlannerInput,
  tasks: PlannedTask[],
  warnings: string[],
): GeneratedPlan {
  const bySubject: GeneratedPlan["stats"]["bySubject"] = {};
  for (const task of tasks) {
    const title =
      input.resources.find((resource) => resource.subjectId === task.subjectId)?.subjectTitle ??
      task.subjectId;
    bySubject[task.subjectId] ??= { title, minutes: 0, units: 0 };
    bySubject[task.subjectId].minutes += task.estMinutes;
    bySubject[task.subjectId].units += task.targetUnits;
  }

  const capacityMinutes = weekDates(input.weekStart).reduce(
    (sum, _, index) => sum + dayCapacity(input, index),
    0,
  );

  return {
    weekStart: input.weekStart,
    tasks,
    warnings,
    stats: {
      capacityMinutes,
      plannedMinutes: tasks.reduce((sum, task) => sum + task.estMinutes, 0),
      plannedUnits: tasks.reduce((sum, task) => sum + task.targetUnits, 0),
      bySubject,
    },
  };
}

export function validateAiPlan(input: AiPlannerInput, raw: unknown): {
  ok: boolean;
  tasks: PlannedTask[];
  warnings: string[];
  errors: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dates = weekDates(input.weekStart);
  const resources = new Map(
    input.resources.filter(isPlannerResource).map((resource) => [resource.id, resource]),
  );
  const remaining = new Map(
    input.resources.map((resource) => [
      resource.id,
      Math.max(0, resource.totalUnits - resource.completedUnits),
    ]),
  );
  const dayMinutes = new Map<string, number>();
  const tasks: PlannedTask[] = [];

  const root = (raw ?? {}) as RawPlan;
  const days = Array.isArray(root.days) ? root.days : [];
  if (!Array.isArray(root.warnings)) {
    // warnings are optional
  } else {
    for (const warning of root.warnings.slice(0, 8)) {
      const text = String(warning ?? "").trim();
      if (text) warnings.push(text.slice(0, 300));
    }
  }

  if (days.length === 0) errors.push("خروجی AI هیچ روزی ندارد.");

  for (const day of days) {
    if (!day || typeof day !== "object") {
      errors.push("ساختار یک روز نامعتبر است.");
      continue;
    }
    const dayRecord = day as { date?: unknown; blocks?: unknown };
    const date = String(dayRecord.date ?? "");
    if (!dates.includes(date)) {
      errors.push(`تاریخ ${date || "نامشخص"} در هفته نیست.`);
      continue;
    }
    const weekday = weekdayIndex(date);
    if (weekday === input.constraints.restWeekday) {
      errors.push(`روز ${date} روز تعطیل است اما بلوک دارد.`);
      continue;
    }
    const capacity = dayCapacity(input, weekday);
    const blocks = Array.isArray(dayRecord.blocks) ? dayRecord.blocks : [];

    for (const rawBlock of blocks) {
      const block = (rawBlock ?? {}) as RawBlock;
      const start = toMinutes(block.start_min);
      const minutes = Math.floor(Number(block.minutes));
      const resourceId = String(block.resource_id ?? "");
      const subjectId = String(block.subject_id ?? "");
      const resource = resources.get(resourceId);

      if (!resource) {
        errors.push(`منبع ${resourceId || "نامشخص"} در برنامه وجود ندارد.`);
        continue;
      }
      if (resource.subjectId !== subjectId) {
        errors.push(`درس بلوک با منبع ${resource.title} هم‌خوان نیست.`);
        continue;
      }
      if (!Number.isFinite(start) || start < 0 || start > 24 * 60) {
        errors.push(`ساعت شروع بلوک ${resource.title} نامعتبر است.`);
        continue;
      }
      if (!Number.isFinite(minutes) || minutes < 15 || minutes > 120) {
        errors.push(`مدت بلوک ${resource.title} باید بین ۱۵ تا ۱۲۰ دقیقه باشد.`);
        continue;
      }
      if (!withinWindow(input, weekday, start, start + minutes)) {
        errors.push(`بلوک ${resource.title} داخل زمان آزاد ${date} نیست.`);
        continue;
      }

      const targetUnits = Math.max(0, Math.floor(Number(block.target_units ?? 0)));
      const left = remaining.get(resourceId) ?? 0;
      if (targetUnits > left) {
        errors.push(`واحد درخواستی برای ${resource.title} از باقی‌مانده بیشتر است.`);
        continue;
      }

      const used = dayMinutes.get(date) ?? 0;
      if (used + minutes > capacity) {
        errors.push(`مجموع دقایق ${date} از ظرفیت روز بیشتر است.`);
        continue;
      }

      const typeRaw = String(block.type ?? "study");
      const type = (["study", "review", "test"].includes(typeRaw) ? typeRaw : "study") as
        | "study"
        | "review"
        | "test";

      tasks.push({
        planDate: date,
        plannedStart: start,
        plannedEnd: start + minutes,
        subjectId,
        resourceId,
        topic: String(block.topic ?? resource.title).slice(0, 200),
        type,
        targetUnits,
        estMinutes: minutes,
      });

      remaining.set(resourceId, left - targetUnits);
      dayMinutes.set(date, used + minutes);
    }
  }

  if (tasks.length === 0) errors.push("هیچ بلوک معتبری در خروجی AI نبود.");

  return { ok: errors.length === 0, tasks, warnings, errors };
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
      kind: "plan_allocation",
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

export function aiPlanningConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL);
}

export async function generateAiPlan(input: {
  workspaceId: string;
  studentId: string;
  planner: AiPlannerInput;
}): Promise<AiPlanResult> {
  const payload = anonymizedInput(input.planner);
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const model = process.env.AI_MODEL ?? "deterministic";

  if (!aiPlanningConfigured()) {
    return { ok: false, errors: ["AI پیکربندی نشده است."], runId: null, source: "unconfigured" };
  }

  try {
    const baseUrl = process.env.AI_BASE_URL!.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "تو برنامه‌ریز تحصیلی هستی. فقط JSON معتبر برگردان با کلیدهای days و warnings. هر روز: {date: 'YYYY-MM-DD', blocks: [{start_min: عدد دقیقه از نیمه‌شب یا HH:MM, minutes: عدد, subject_id, resource_id, topic, type: 'study'|'review'|'test', target_units, reason}]}. محدودیت‌های زمان آزاد، سقف روزانه، روز تعطیل و باقی‌مانده واحدها را قطعاً رعایت کن. هیچ منبع یا درسی از فهرست ورودی نساز. minutes بین ۱۵ تا ۱۲۰. reason کوتاه و فارسی. بدون نام یا داده هویتی.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as unknown;
    const validated = validateAiPlan(input.planner, parsed);

    if (!validated.ok) {
      const runId = await logRun({
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        status: "fallback",
        model,
        inputHash,
        output: parsed,
        tokens: data.usage?.total_tokens ?? 0,
        error: validated.errors.slice(0, 6).join(" | "),
      });
      return { ok: false, errors: validated.errors, runId, source: "invalid" };
    }

    const runId = await logRun({
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      status: "success",
      model,
      inputHash,
      output: parsed,
      tokens: data.usage?.total_tokens ?? 0,
    });

    return {
      ok: true,
      runId,
      source: "ai",
      plan: finalizePlan(input.planner, validated.tasks, validated.warnings),
    };
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

    return { ok: false, errors: [message], runId, source: "error" };
  }
}
