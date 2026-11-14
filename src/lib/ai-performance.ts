import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { aiRuns } from "@/db/schema";
import { formatTime } from "./dates";
import { WEEKDAY_LABELS } from "./dates";
import type { PerformanceAnalysis, PlanningInsights } from "./performance";

const PROMPT_VERSION = "performance-analysis-v2";

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
  subjectSummary?: { title: string; practiceMinutes: number; studyMinutes: number }[];
  resourceProgress?: {
    subjectTitle: string;
    title: string;
    percent: number;
    remainingUnits: number;
    remainingTests: number;
  }[];
  planningInsights?: PlanningInsights;
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
    lines.push(`میانگین ساعت اولین ورود به برنامه حدود ${formatTime(avgStart)} است.`);
  }

  const lateDays = analysis.days.filter((day) => day.status === "offplan");
  if (lateDays.length > 0) {
    const labels = lateDays.map((day) => WEEKDAY_LABELS[day.weekday]).join("، ");
    lines.push(`اولین ورود خارج از برنامه در ${labels} دیده می‌شود؛ ساعت شروع روز را ثابت‌تر کنید و اولین بلوک را کوتاه بگذارید.`);
  } else {
    lines.push("اولین ورود روزها هماهنگ با برنامه بوده است؛ همین لنگر زمانی را برای هفته بعد حفظ کنید.");
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

  const subjectSummary = input.subjectSummary ?? [];
  if (subjectSummary.length > 0) {
    const topPractice = [...subjectSummary].sort(
      (a, b) => b.practiceMinutes - a.practiceMinutes,
    )[0];
    const topStudy = [...subjectSummary].sort((a, b) => b.studyMinutes - a.studyMinutes)[0];
    if (topPractice && topPractice.practiceMinutes > 0) {
      lines.push(
        `بیشترین حجم تست/تمرین مربوط به ${topPractice.title} بوده و بیشترین زمان مطالعه هم روی ${topStudy?.title ?? topPractice.title} گذشته است.`,
      );
    }
  }

  const planning = input.planningInsights;
  if (planning && planning.subjectTimes.length > 0) {
    const evening = [...planning.subjectTimes].sort((a, b) => b.evening - a.evening)[0];
    const morning = [...planning.subjectTimes].sort((a, b) => b.morning - a.morning)[0];
    if (evening && evening.evening >= 3) {
      lines.push(
        `${evening.title} بیشتر در ساعت‌های پایانی روز برنامه‌ریزی شده است؛ اگر در عمل هم همان‌جا بماند، احتمال خستگی و عقب افتادنش بیشتر است.`,
      );
    }
    if (morning && morning.morning >= 3) {
      lines.push(
        `${morning.title} بیشترین حضور را در ساعت‌های اول روز دارد؛ این الگو می‌تواند نشانه تمرکز یا عادت شروع با همین درس باشد.`,
      );
    }
    if (planning.firstSubjectByDay.length >= 3) {
      const counts = new Map<string, number>();
      for (const item of planning.firstSubjectByDay) {
        counts.set(item.title, (counts.get(item.title) ?? 0) + 1);
      }
      const [firstTitle, firstCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (firstCount >= 3) {
        lines.push(
          `در ${firstCount.toLocaleString("fa-IR")} روز، روز با ${firstTitle} شروع شده است؛ یعنی شروع روز تا حدی به همین درس گره خورده است.`,
        );
      }
    }
  }

  const progress = input.resourceProgress ?? [];
  if (progress.length > 0) {
    const bySubject = new Map<string, { remaining: number; totalPercent: number; count: number }>();
    for (const row of progress) {
      const current = bySubject.get(row.subjectTitle) ?? {
        remaining: 0,
        totalPercent: 0,
        count: 0,
      };
      current.remaining += row.remainingUnits;
      current.totalPercent += row.percent;
      current.count += 1;
      bySubject.set(row.subjectTitle, current);
    }
    const ranked = [...bySubject.entries()]
      .map(([title, value]) => ({
        title,
        remaining: value.remaining,
        percent: value.count ? Math.round(value.totalPercent / value.count) : 0,
      }))
      .sort((a, b) => a.percent - b.percent);
    const weakest = ranked[0];
    const strongest = ranked.at(-1);
    if (weakest && strongest && weakest.title !== strongest.title) {
      lines.push(
        `در منابع، ${strongest.title} وضعیت جلوتری دارد (حدود ${strongest.percent.toLocaleString("fa-IR")}٪) و ${weakest.title} عقب‌تر است (حدود ${weakest.percent.toLocaleString("fa-IR")}٪)؛ این شکاف را با یک بلوک ثابت هفتگی برای ${weakest.title} کم کنید.`,
      );
    }
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
      study_minutes: day.studyMinutes,
      review_minutes: day.reviewMinutes,
      test_minutes: day.testMinutes,
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
    subject_summary: input.subjectSummary ?? [],
    resource_progress: input.resourceProgress ?? [],
    planning_insights: input.planningInsights ?? null,
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
              "تو مشاور تحصیلی و تحلیلگر عملکرد دانش‌آموز هستی. فقط یک JSON با کلید narrative برگردان. متن فارسی، حداکثر ۲۴۰ کلمه. فقط آمار خام را تکرار نکن؛ الگوهای عمیق‌تر را پیدا کن: درس‌هایی که بیشترین/کمترین زمان گرفته‌اند، ترتیب شروع روز، دروس برنامه‌ریزی‌شده در ساعت‌های خسته‌کننده (مثلاً آخر شب)، تعادل تست/تمرین و مطالعه، شکاف بین پیشرفت منابع و زمانی که صرفشان شده، و اثر روتین روزانه. اگر داده منابع و برنامه و عملکرد با هم تناقض دارند آن را صریح بگو و علت محتمل را حدس بزن. در پایان ۳ اقدام مشخص و قابل اندازه‌گیری برای هفته بعد بده. بدون نام یا داده هویتی.",
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
