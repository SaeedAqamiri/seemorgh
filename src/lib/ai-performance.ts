import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { aiRuns } from "@/db/schema";
import { formatTime } from "./dates";
import { WEEKDAY_LABELS } from "./dates";
import type { PerformanceAnalysis, PlanningInsights } from "./performance";

const PROMPT_VERSION = "performance-analysis-v3";

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
  subjectSummary?: {
    title: string;
    practiceMinutes: number;
    studyMinutes: number;
    testMinutes?: number;
    exerciseMinutes?: number;
  }[];
  resourceProgress?: {
    subjectTitle: string;
    title: string;
    percent: number;
    remainingUnits: number;
    remainingTests: number;
  }[];
  planningInsights?: PlanningInsights;
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function deterministicPerformanceNarrative(input: PerformanceNarrativeInput): string {
  const { analysis } = input;

  if (!analysis.hasAnyData) {
    return "برای این بازه عملکردی ثبت نشده است. با ثبت ساعت شروع و حجم کار هر خانه، پایه تحلیل بازه‌های بعدی ساخته می‌شود.";
  }

  const fa = (value: number) => Math.round(value).toLocaleString("fa-IR");
  const faTime = (minutes: number) =>
    formatTime(minutes).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  const dayLabel = (day: PerformanceAnalysis["days"][number]) =>
    `${WEEKDAY_LABELS[day.weekday]}`;
  const paragraphs: string[] = [];

  const startedDays = analysis.days.filter((day) => day.performedStartMin !== null);
  const startValues = startedDays.map((day) => day.performedStartMin as number);
  const avgStart = startValues.length > 0 ? average(startValues) : null;
  const startSpread =
    startValues.length > 1 ? Math.max(...startValues) - Math.min(...startValues) : 0;
  const startRate =
    analysis.activeDays > 0
      ? Math.round((analysis.onplanDays / analysis.activeDays) * 100)
      : 0;

  const studyMinutes = analysis.days.reduce(
    (sum, day) => sum + day.studyMinutes + day.reviewMinutes,
    0,
  );
  const testMinutes = analysis.days.reduce((sum, day) => sum + day.testMinutes, 0);
  const workMinutes = Math.max(1, studyMinutes + testMinutes);
  const testShare = Math.round((testMinutes / workMinutes) * 100);

  const startSentence =
    avgStart === null
      ? "برای بخشی از روزها ساعت شروع ثبت نشده است."
      : startSpread <= 45
        ? `شروع روز پایدار است؛ میانگین ${faTime(avgStart)} و فاصلهٔ زودترین و دیرترین شروع فقط ${fa(startSpread)} دقیقه است.`
        : `شروع روز ناپایدار است؛ میانگین ${faTime(avgStart)} است اما بین زودترین و دیرترین شروع ${fa(startSpread)} دقیقه فاصله هست.`;
  paragraphs.push(
    `در ${fa(analysis.activeDays)} روز فعال، ${fa(analysis.totalMinutes)} دقیقه کار ثبت شده و ${fa(analysis.onplanDays)} روز طبق برنامه شروع شده است (${fa(startRate)}٪). ${startSentence}`,
  );

  if (testShare < 25) {
    paragraphs.push(
      `فقط حدود ${fa(testShare)}٪ از زمان کار صرف تست و تمرین شده و باقی آن مطالعه بوده است. این الگو می‌تواند تسلط کاغذی بسازد بدون این‌که سرعت و دقت آزمون بالا برود؛ اولین جای اصلاح، تبدیل بخشی از بلوک‌های مطالعه به تست هدفمند از همان مبحث است.`,
    );
  } else if (testShare > 55) {
    paragraphs.push(
      `حدود ${fa(testShare)}٪ زمان به تست و تمرین گذشته و سهم مطالعه پایین است. اگر دقت آزمون‌ها هم‌زمان بالا نرفته، احتمالاً جای فهم اولیه با تمرین زیاد پر شده؛ یک بلوک کوتاه مطالعهٔ مفهومی قبل از تست‌های هر درس می‌تواند بازده را بهتر کند.`,
    );
  } else {
    paragraphs.push(
      `تعادل مطالعه و تست حدود ${fa(testShare)} به ${fa(100 - testShare)} است؛ این نسبت برای تثبیت و سنجش هم‌زمان مناسب است و بهتر است به‌جای تغییر کلی، فقط برای درس‌های عقب‌تر جابه‌جا شود.`,
    );
  }

  const activeWithMinutes = analysis.days.filter((day) => day.performedMinutes > 0);
  const strongestDay = [...activeWithMinutes].sort(
    (a, b) => b.performedMinutes - a.performedMinutes,
  )[0];
  const weakestDay = [...activeWithMinutes].sort(
    (a, b) => a.performedMinutes - b.performedMinutes,
  )[0];
  if (
    strongestDay &&
    weakestDay &&
    weakestDay.performedMinutes > 0 &&
    strongestDay.performedMinutes >= weakestDay.performedMinutes * 1.8
  ) {
    paragraphs.push(
      `حجم کار روزها یکدست نیست: ${dayLabel(strongestDay)} با ${fa(strongestDay.performedMinutes)} دقیقه حدود ${fa(strongestDay.performedMinutes / weakestDay.performedMinutes)} برابر ${dayLabel(weakestDay)} است. این نوسان معمولاً نشانهٔ برنامهٔ واقع‌بینانه‌نبودن یا خستگی انباشته است، نه کم‌کاری یک روز خاص.`,
    );
  }

  const onplanDays = analysis.days.filter((day) => day.status === "onplan");
  const offplanDays = analysis.days.filter((day) => day.status === "offplan");
  if (onplanDays.length > 0 && offplanDays.length > 0) {
    const onplanAvg = average(onplanDays.map((day) => day.performedMinutes));
    const offplanAvg = average(offplanDays.map((day) => day.performedMinutes));
    if (offplanAvg > onplanAvg * 1.2) {
      paragraphs.push(
        `نکتهٔ غیربدیهی این است که روزهای دیرشروع، به‌طور میانگین ${fa(offplanAvg)} دقیقه کار داشته‌اند در برابر ${fa(onplanAvg)} دقیقه در روزهای به‌موقع؛ یعنی دیر شروع‌کردن لزوماً کم‌کاری نبوده. اگر برنامه عقب می‌افتد، احتمالاً ظرفیت روز بیش از حد خوش‌بینانه بسته شده است.`,
      );
    } else if (onplanAvg > offplanAvg * 1.2) {
      paragraphs.push(
        `روزهایی که طبق برنامه شروع شده‌اند به‌طور میانگین ${fa(onplanAvg)} دقیقه کار داشته‌اند در برابر ${fa(offplanAvg)} دقیقه در روزهای دیرشروع. لنگر ساعت شروع، ظاهراً فقط نظم نیست و روی حجم کار هم اثر می‌گذارد.`,
      );
    }
  }

  const subjects = (input.subjectSummary ?? [])
    .map((row) => ({
      ...row,
      total: row.practiceMinutes + row.studyMinutes,
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
  if (subjects.length > 0) {
    const top = subjects[0];
    const topShare = Math.round((top.total / workMinutes) * 100);
    if (topShare >= 45 && subjects.length > 1) {
      paragraphs.push(
        `حدود ${fa(topShare)}٪ از کل زمان روی ${top.title} متمرکز شده است. تمرکز زیاد روی یک درس وقتی بقیهٔ درس‌ها هم عقب‌اند، می‌تواند هزینهٔ فرصت باشد؛ بهتر است سهم ${top.title} کمی کم و به دروس کم‌کارتر اضافه شود.`,
      );
    }
    const topTest = [...subjects].sort(
      (a, b) => (b.testMinutes ?? b.practiceMinutes) - (a.testMinutes ?? a.practiceMinutes),
    )[0];
    if (topTest && topTest.title !== top.title) {
      paragraphs.push(
        `بیشترین حجم تست/تمرین روی ${topTest.title} بوده است، در حالی که بیشترین زمان مطالعه روی ${top.title} گذشته است. این تفاوت نشان می‌دهد روش کار با این دو درس یکسان نیست و ارزش دارد آگاهانه انتخاب شود.`,
      );
    }
  }

  const plannedSet = new Set(input.plannedSubjectsByDay.flat());
  const performedSet = new Set(subjects.map((row) => row.title));
  const plannedButMissing = [...plannedSet].filter((title) => title && !performedSet.has(title));
  const performedButUnplanned = [...performedSet].filter((title) => !plannedSet.has(title));
  if (plannedButMissing.length > 0) {
    paragraphs.push(
      `این درس‌ها در برنامه آمده‌اند ولی در عمل اثری از آن‌ها نیست: ${plannedButMissing.slice(0, 3).join("، ")}. تکرار این شکاف نشان می‌دهد برنامه در بخش‌هایی آرزومحور است، نه ظرفیت‌محور.`,
    );
  } else if (performedButUnplanned.length > 0) {
    paragraphs.push(
      `برخی کارها خارج از برنامه انجام شده‌اند: ${performedButUnplanned.slice(0, 3).join("، ")}. این انعطاف بد نیست، ولی اگر زیاد شود یعنی برنامه با واقعیت روزانه هم‌خوان نیست.`,
    );
  }

  const progress = input.resourceProgress ?? [];
  if (progress.length > 0) {
    const bySubject = new Map<string, { percentSum: number; count: number; remaining: number }>();
    for (const row of progress) {
      const current = bySubject.get(row.subjectTitle) ?? {
        percentSum: 0,
        count: 0,
        remaining: 0,
      };
      current.percentSum += row.percent;
      current.count += 1;
      current.remaining += row.remainingUnits;
      bySubject.set(row.subjectTitle, current);
    }
    const ranked = [...bySubject.entries()]
      .map(([title, value]) => ({
        title,
        percent: value.count ? Math.round(value.percentSum / value.count) : 0,
        remaining: value.remaining,
      }))
      .sort((a, b) => a.percent - b.percent);
    const weakest = ranked[0];
    const strongest = ranked.at(-1);
    if (weakest && strongest && weakest.title !== strongest.title) {
      paragraphs.push(
        `در منابع، ${strongest.title} جلوتر است (حدود ${fa(strongest.percent)}٪) و ${weakest.title} عقب‌تر (حدود ${fa(weakest.percent)}٪). این شکاف با یک بلوک ثابت هفتگی برای ${weakest.title} بهتر جمع می‌شود تا با چند روز فشرده و پراکنده.`,
      );
    }

    const overallPercent = average(ranked.map((row) => row.percent));
    const timeBySubject = new Map(subjects.map((row) => [row.title, row.total]));
    const mismatch = ranked.find((row) => {
      const minutes = timeBySubject.get(row.title) ?? 0;
      return (
        minutes / workMinutes >= 0.15 &&
        row.percent + 10 < overallPercent &&
        row.remaining > 0
      );
    });
    if (mismatch) {
      paragraphs.push(
        `زمان قابل‌توجهی صرف ${mismatch.title} شده اما پیشرفت منبعش فقط حدود ${fa(mismatch.percent)}٪ است. این معمولاً یعنی زمان صرف مرور پراکنده یا کار بدون ثبت پیشرفت شده؛ یا روش مطالعه کارآمد نیست یا پیشرفت منبع به‌روز ثبت نمی‌شود.`,
      );
    }
  }

  const planning = input.planningInsights;
  if (planning && planning.firstSubjectByDay.length >= 3) {
    const counts = new Map<string, number>();
    for (const item of planning.firstSubjectByDay) {
      counts.set(item.title, (counts.get(item.title) ?? 0) + 1);
    }
    const [firstTitle, firstCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (firstCount >= 3) {
      paragraphs.push(
        `در ${fa(firstCount)} روز، روز با ${firstTitle} شروع شده است؛ یعنی موفقیت شروع روز به یک درس خاص گره خورده. اگر آن درس سنگین باشد، کل روز شکننده می‌شود.`,
      );
    }
  }

  if (input.dailyRoutine.trim()) {
    paragraphs.push(
      "روتین روزانه ثبت شده است؛ اثر آن را جدا از بلوک‌های مطالعه بسنجید. روتین فقط وقتی مفید است که روزهای شلوغ هم بدون تصمیم‌گیری اضافی اجرا شود.",
    );
  }

  if (input.notes.length > 0) {
    paragraphs.push(
      `${fa(input.notes.length)} یادداشت از دانش‌آموز ثبت شده است؛ این یادداشت‌ها معمولاً دلیل واقعی نوسان‌ها را نشان می‌دهند و ارزش مرور در جلسهٔ مشاوره را دارند.`,
    );
  } else {
    paragraphs.push(
      "هیچ یادداشتی ثبت نشده است؛ یک خط توضیح برای هر خانه، تفاوت بین «کم‌کاری» و «خستگی» را در تحلیل بعدی روشن می‌کند.",
    );
  }

  const actions: string[] = [];
  if (startSpread > 45) {
    actions.push("ساعت شروع را برای یک هفته روی یک عدد ثابت قفل کنید و اختلاف شروع را زیر ۳۰ دقیقه نگه دارید");
  } else if (avgStart !== null) {
    actions.push(`ساعت شروع فعلی (حدود ${faTime(avgStart)}) را به‌عنوان لنگر ثابت هفتهٔ بعد حفظ کنید`);
  }
  if (testShare < 25) {
    actions.push("دست‌کم یک‌سوم بلوک‌های مطالعه را به تست هدفمند از همان مبحث تبدیل کنید");
  }
  if (plannedButMissing.length > 0) {
    actions.push(`برای ${plannedButMissing[0]} یک بلوک کوچک اما ثابت در برنامه بگذارید`);
  }
  if (actions.length < 3) {
    actions.push("حجم کار روزهای ضعیف را با نصف کردن بلوک‌ها بالا ببرید، نه با طولانی‌کردن یک بلوک");
  }
  if (actions.length < 3) {
    actions.push("پیشرفت منابع را همان روز ثبت کنید تا تحلیل بعدی با واقعیت هم‌خوان باشد");
  }
  const actionNumbers = ["۱", "۲", "۳"];
  paragraphs.push(
    `اقدام هفتهٔ بعد: ${actions
      .slice(0, 3)
      .map((item, index) => `${actionNumbers[index]}) ${item}`)
      .join(" ")}.`,
  );

  return paragraphs.join("\n\n");
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
              "تو مشاور تحصیلی و تحلیلگر عملکرد دانش‌آموز هستی. فقط یک JSON با کلید narrative برگردان. متن فارسی، بین ۲۰۰ تا ۳۰۰ کلمه، در ۳ تا ۵ پاراگراف که با \\n\\n از هم جدا شده‌اند. قاعدهٔ اصلی: آمار خام جدول‌ها را بازگو نکن؛ به‌جای آن ۲ تا ۴ نکتهٔ غیربدیهی و رابطه‌محور پیدا کن، مثلاً رابطهٔ ساعت شروع با حجم کار، تمرکز بیش از حد روی یک درس، فاصلهٔ بین برنامه و عملکرد واقعی، تناسب مطالعه با تست، یا ناهم‌خوانی زمان صرف‌شده با پیشرفت منابع. حداقل یک تناقض یا هزینهٔ پنهان را صریح نام ببر و علت محتمل آن را حدس بزن. اگر داده‌ها کم است، صادقانه بگو و از حدس قطعی پرهیز کن. در پایان دقیقاً ۳ اقدام مشخص، عددی و قابل اندازه‌گیری برای بازهٔ بعد بده. بدون نام یا داده هویتی.",
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
