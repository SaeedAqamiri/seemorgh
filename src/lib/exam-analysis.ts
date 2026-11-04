import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  examAnswers,
  examAttempts,
  exams,
  externalExams,
  performancePanels,
  students,
  subjects,
  type ExamSubjectScore,
} from "@/db/schema";
import { formatISO, startOfWeekSaturday, weekDates } from "./dates";
import { parseSnapshot } from "./exam";
import { normalizePerfGrid } from "./performance";

export type ExamSubjectResult = {
  subjectId: string | null;
  subjectTitle: string;
  percent: number;
  correct: number;
  wrong: number;
  blank: number;
  total: number;
};

export type ExamResultView = {
  id: string;
  source: "internal" | "external";
  title: string;
  examDate: string;
  examType: string;
  provider: string;
  subjects: ExamSubjectResult[];
  overallPercent: number;
  note: string;
};

export type KonkurBudget = {
  title: string;
  weight: number;
  questions: number;
};

const BUDGETS: { match: RegExp; budget: KonkurBudget }[] = [
  { match: /زیست/, budget: { title: "زیست‌شناسی", weight: 12, questions: 45 } },
  { match: /شیمی/, budget: { title: "شیمی", weight: 9, questions: 35 } },
  { match: /فیزیک/, budget: { title: "فیزیک", weight: 7, questions: 30 } },
  { match: /ریاضی/, budget: { title: "ریاضی", weight: 7, questions: 30 } },
];

export function konkurBudgetFor(subjectTitle: string): KonkurBudget | null {
  return BUDGETS.find((entry) => entry.match.test(subjectTitle))?.budget ?? null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeSubject(result: ExamSubjectScore): ExamSubjectResult {
  return {
    subjectId: result.subjectId ?? null,
    subjectTitle: result.subjectTitle,
    percent: clampPercent(result.percent),
    correct: result.correct ?? 0,
    wrong: result.wrong ?? 0,
    blank: result.blank ?? 0,
    total: result.total ?? 0,
  };
}

export function computeExamOverallPercent(subjects: ExamSubjectResult[]): number {
  return weightedOverall(subjects);
}

function weightedOverall(subjects: ExamSubjectResult[]): number {
  const weighted = subjects
    .map((subject) => ({ subject, budget: konkurBudgetFor(subject.subjectTitle) }))
    .filter((entry) => entry.budget !== null) as {
    subject: ExamSubjectResult;
    budget: KonkurBudget;
  }[];
  if (weighted.length === 0) {
    if (subjects.length === 0) return 0;
    return Math.round(
      subjects.reduce((sum, subject) => sum + subject.percent, 0) / subjects.length,
    );
  }
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.budget.weight, 0);
  const total = weighted.reduce(
    (sum, entry) => sum + entry.subject.percent * entry.budget.weight,
    0,
  );
  return totalWeight > 0 ? Math.round(total / totalWeight) : 0;
}

async function internalExamResults(studentId: string): Promise<ExamResultView[]> {
  const db = await getDb();
  const rows = await db
    .select({ attempt: examAttempts, exam: exams })
    .from(examAttempts)
    .innerJoin(exams, eq(examAttempts.examId, exams.id))
    .where(
      and(
        eq(examAttempts.studentId, studentId),
        inArray(examAttempts.status, ["submitted", "graded"]),
      ),
    )
    .orderBy(desc(examAttempts.submittedAt));

  const results: ExamResultView[] = [];

  for (const row of rows) {
    let snapshot;
    try {
      snapshot = parseSnapshot(row.exam.questionSnapshotJson);
    } catch {
      continue;
    }

    const answers = await db
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.attemptId, row.attempt.id));
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));

    type Aggregate = {
      subjectId: string | null;
      subjectTitle: string;
      maxScore: number;
      score: number;
      correct: number;
      wrong: number;
      blank: number;
      total: number;
    };
    const bySubject = new Map<string, Aggregate>();

    for (const item of snapshot.items) {
      const key = item.subjectId ?? item.subjectTitle;
      const current = bySubject.get(key) ?? {
        subjectId: item.subjectId,
        subjectTitle: item.subjectTitle,
        maxScore: 0,
        score: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        total: 0,
      };
      const answer = answerByQuestion.get(item.id);
      current.maxScore += item.score;
      current.score += answer?.score ?? 0;
      current.total += 1;
      if (!answer || answer.answerJson === null || answer.answerJson === undefined) {
        current.blank += 1;
      } else if (answer.isCorrect) {
        current.correct += 1;
      } else {
        current.wrong += 1;
      }
      bySubject.set(key, current);
    }

    const subjectResults = [...bySubject.values()]
      .map((entry) => ({
        subjectId: entry.subjectId,
        subjectTitle: entry.subjectTitle,
        percent: entry.maxScore > 0 ? clampPercent((entry.score / entry.maxScore) * 100) : 0,
        correct: entry.correct,
        wrong: entry.wrong,
        blank: entry.blank,
        total: entry.total,
      }))
      .sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle, "fa"));

    results.push({
      id: `internal-${row.attempt.id}`,
      source: "internal",
      title: row.exam.title,
      examDate: formatISO(row.attempt.submittedAt ?? row.exam.endAt),
      examType: "internal",
      provider: "سامانه",
      subjects: subjectResults,
      overallPercent:
        row.attempt.maxScore > 0
          ? clampPercent((row.attempt.score / row.attempt.maxScore) * 100)
          : 0,
      note: "",
    });
  }

  return results;
}

export async function listStudentExamResults(studentId: string): Promise<ExamResultView[]> {
  const db = await getDb();
  const externalRows = await db
    .select()
    .from(externalExams)
    .where(eq(externalExams.studentId, studentId))
    .orderBy(desc(externalExams.examDate));

  const externalResults: ExamResultView[] = externalRows.map((row) => {
    const subjectsList = (row.subjectsJson ?? []).map(normalizeSubject);
    return {
      id: row.id,
      source: "external",
      title: row.title,
      examDate: row.examDate,
      examType: row.examType,
      provider: row.provider,
      subjects: subjectsList,
      overallPercent: row.overallPercent || weightedOverall(subjectsList),
      note: row.note,
    };
  });

  const internalResults = await internalExamResults(studentId);

  return [...externalResults, ...internalResults].sort((a, b) =>
    b.examDate.localeCompare(a.examDate),
  );
}

export async function getExamResult(
  studentId: string,
  source: "internal" | "external",
  id: string,
): Promise<ExamResultView | null> {
  const all = await listStudentExamResults(studentId);
  const normalizedId = source === "internal" && id.startsWith("internal-") ? id : id;
  return all.find((result) => result.source === source && result.id === normalizedId) ?? null;
}

export type CohortSubjectStat = {
  subjectTitle: string;
  average: number;
  count: number;
};

export async function getExamCohortStats(input: {
  workspaceId: string;
  title: string;
  examDate: string;
}): Promise<CohortSubjectStat[]> {
  const db = await getDb();
  const rows = await db
    .select({ subjectsJson: externalExams.subjectsJson })
    .from(externalExams)
    .innerJoin(students, eq(externalExams.studentId, students.id))
    .where(
      and(
        eq(students.workspaceId, input.workspaceId),
        eq(externalExams.title, input.title),
        eq(externalExams.examDate, input.examDate),
      ),
    );

  const aggregates = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    for (const subject of row.subjectsJson ?? []) {
      const current = aggregates.get(subject.subjectTitle) ?? { sum: 0, count: 0 };
      current.sum += clampPercent(subject.percent);
      current.count += 1;
      aggregates.set(subject.subjectTitle, current);
    }
  }

  return [...aggregates.entries()]
    .map(([subjectTitle, value]) => ({
      subjectTitle,
      average: value.count === 0 ? 0 : Math.round(value.sum / value.count),
      count: value.count,
    }))
    .sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle, "fa"));
}

export type SingleExamSubjectAnalysis = {
  subjectTitle: string;
  studentPercent: number;
  cohortAverage: number | null;
  diff: number | null;
  difficulty: "سخت" | "متوسط" | "راحت" | "نامشخص";
  comparison: "بالاتر از میانگین" | "نزدیک میانگین" | "پایین‌تر از میانگین" | "نامشخص";
  weight: number;
  questionCount: number;
};

export type SingleExamAnalysis = {
  exam: ExamResultView;
  subjects: SingleExamSubjectAnalysis[];
  weightedPercent: number;
  strongest: SingleExamSubjectAnalysis | null;
  weakest: SingleExamSubjectAnalysis | null;
  summary: string;
};

function difficultyFor(average: number | null): SingleExamSubjectAnalysis["difficulty"] {
  if (average === null) return "نامشخص";
  if (average < 45) return "سخت";
  if (average > 70) return "راحت";
  return "متوسط";
}

function comparisonFor(diff: number | null): SingleExamSubjectAnalysis["comparison"] {
  if (diff === null) return "نامشخص";
  if (diff >= 8) return "بالاتر از میانگین";
  if (diff <= -8) return "پایین‌تر از میانگین";
  return "نزدیک میانگین";
}

export function buildSingleExamAnalysis(
  exam: ExamResultView,
  cohort: CohortSubjectStat[],
): SingleExamAnalysis {
  const cohortByTitle = new Map(cohort.map((stat) => [stat.subjectTitle, stat]));
  const subjectsAnalysis = exam.subjects.map((subject) => {
    const cohortStat = cohortByTitle.get(subject.subjectTitle);
    const cohortAverage = cohortStat?.average ?? null;
    const diff = cohortAverage === null ? null : subject.percent - cohortAverage;
    const budget = konkurBudgetFor(subject.subjectTitle);
    return {
      subjectTitle: subject.subjectTitle,
      studentPercent: subject.percent,
      cohortAverage,
      diff,
      difficulty: difficultyFor(cohortAverage),
      comparison: comparisonFor(diff),
      weight: budget?.weight ?? 1,
      questionCount: budget?.questions ?? subject.total,
    } satisfies SingleExamSubjectAnalysis;
  });

  const sortedByPercent = [...subjectsAnalysis].sort(
    (a, b) => b.studentPercent - a.studentPercent,
  );
  const strongest = sortedByPercent[0] ?? null;
  const weakest = sortedByPercent.at(-1) ?? null;
  const totalWeight = subjectsAnalysis.reduce((sum, subject) => sum + subject.weight, 0);
  const weightedPercent =
    totalWeight > 0
      ? Math.round(
          subjectsAnalysis.reduce(
            (sum, subject) => sum + subject.studentPercent * subject.weight,
            0,
          ) / totalWeight,
        )
      : 0;

  const hardSubjects = subjectsAnalysis.filter((subject) => subject.difficulty === "سخت");
  const easySubjects = subjectsAnalysis.filter((subject) => subject.difficulty === "راحت");
  const parts: string[] = [];
  parts.push(
    `در آزمون «${exam.title}» (${exam.examDate}) درصد وزنی تو ${weightedPercent}٪ است.`,
  );
  if (hardSubjects.length > 0) {
    parts.push(
      `درس‌های ${hardSubjects.map((subject) => subject.subjectTitle).join("، ")} در این آزمون برای جمع سخت‌تر بوده‌اند.`,
    );
  }
  if (easySubjects.length > 0) {
    parts.push(
      `درس‌های ${easySubjects.map((subject) => subject.subjectTitle).join("، ")} نسبتاً راحت بوده‌اند.`,
    );
  }
  if (strongest && weakest) {
    parts.push(
      `قوی‌ترین درس تو ${strongest.subjectTitle} با ${strongest.studentPercent}٪ و ضعیف‌ترین ${weakest.subjectTitle} با ${weakest.studentPercent}٪ است.`,
    );
  }
  parts.push(
    weakest && weakest.studentPercent < 50
      ? `برای آزمون بعدی روی ${weakest.subjectTitle} وقت بیشتری بگذار.`
      : "برای آزمون بعدی همین تعادل را حفظ کن و روی تست‌های ترکیبی کار کن.",
  );

  return {
    exam,
    subjects: subjectsAnalysis,
    weightedPercent,
    strongest,
    weakest,
    summary: parts.join(" "),
  };
}

export type SubjectTrend = {
  subjectTitle: string;
  average: number;
  first: number | null;
  last: number | null;
  delta: number | null;
  trend: "صعودی" | "نزولی" | "ثابت" | "نامشخص";
  studyMinutes: number;
  practiceCount: number;
  recommendation: string;
};

export type TrendAnalysis = {
  from: string;
  to: string;
  exams: ExamResultView[];
  overallSeries: { examId: string; examDate: string; title: string; percent: number }[];
  subjects: SubjectTrend[];
  totalStudyMinutes: number;
  summary: string;
};

function normalizeTitle(title: string): string {
  if (title.includes("زیست")) return "زیست‌شناسی";
  if (title.includes("شیمی")) return "شیمی";
  if (title.includes("فیزیک")) return "فیزیک";
  if (title.includes("ریاضی")) return "ریاضی";
  return title.trim();
}

export async function getStudentTrendAnalysis(input: {
  studentId: string;
  workspaceId: string;
  from: string;
  to: string;
}): Promise<TrendAnalysis> {
  const db = await getDb();
  const all = await listStudentExamResults(input.studentId);
  const examsList = all
    .filter((exam) => exam.examDate >= input.from && exam.examDate <= input.to)
    .sort((a, b) => a.examDate.localeCompare(b.examDate));

  const subjectRows = await db
    .select({ id: subjects.id, title: subjects.title })
    .from(subjects)
    .where(eq(subjects.workspaceId, input.workspaceId));
  const subjectTitles = new Map(subjectRows.map((row) => [row.id, row.title]));

  const weekStartFrom = startOfWeekSaturday(input.from);
  const panelRows = await db
    .select({ weekStart: performancePanels.weekStart, cellsJson: performancePanels.cellsJson })
    .from(performancePanels)
    .where(
      and(
        eq(performancePanels.studentId, input.studentId),
        sql`${performancePanels.weekStart} >= ${weekStartFrom}`,
        sql`${performancePanels.weekStart} <= ${input.to}`,
      ),
    );

  const studyBySubject = new Map<string, { minutes: number; practice: number }>();
  for (const panel of panelRows) {
    const grid = normalizePerfGrid(panel.cellsJson);
    const dates = weekDates(panel.weekStart);
    for (let day = 0; day < grid.length; day += 1) {
      const date = dates[day];
      if (!date || date < input.from || date > input.to) continue;
      for (const cell of grid[day]) {
        if (cell.kind !== "review" && cell.kind !== "practice") continue;
        const title = subjectTitles.get(cell.subjectId);
        if (!title) continue;
        const key = normalizeTitle(title);
        const current = studyBySubject.get(key) ?? { minutes: 0, practice: 0 };
        current.minutes += Math.max(0, cell.endMin - cell.startMin);
        if (cell.kind === "practice") current.practice += Math.max(0, cell.count);
        studyBySubject.set(key, current);
      }
    }
  }

  const subjectSeries = new Map<string, { title: string; values: { date: string; percent: number }[] }>();
  for (const exam of examsList) {
    for (const subject of exam.subjects) {
      const key = normalizeTitle(subject.subjectTitle);
      const current = subjectSeries.get(key) ?? { title: key, values: [] };
      current.values.push({ date: exam.examDate, percent: subject.percent });
      subjectSeries.set(key, current);
    }
  }

  const subjectTrends: SubjectTrend[] = [...subjectSeries.entries()].map(([key, series]) => {
    const values = series.values.sort((a, b) => a.date.localeCompare(b.date));
    const first = values[0]?.percent ?? null;
    const last = values.at(-1)?.percent ?? null;
    const average =
      values.length === 0
        ? 0
        : Math.round(values.reduce((sum, value) => sum + value.percent, 0) / values.length);
    const delta = first !== null && last !== null ? last - first : null;
    const trend: SubjectTrend["trend"] =
      delta === null ? "نامشخص" : delta >= 5 ? "صعودی" : delta <= -5 ? "نزولی" : "ثابت";
    const study = studyBySubject.get(key) ?? { minutes: 0, practice: 0 };

    let recommendation: string;
    if (average < 50) {
      recommendation =
        study.minutes > 0
          ? `⏳ ${series.title}: میانگین ${average}٪ با ${study.minutes.toLocaleString("fa-IR")} دقیقه مطالعه؛ هنوز نیاز به کار جدی‌تر دارد.`
          : `⏳ ${series.title}: میانگین ${average}٪ و مطالعه ثبت‌شده کم است؛ از همین هفته وقت مشخص برایش بگذار.`;
    } else if (trend === "صعودی") {
      recommendation = `📈 ${series.title}: روند رو به بهبود است (${delta !== null ? `+${delta}` : ""} درصد). همین شیوه مطالعه را ادامه بده.`;
    } else if (trend === "نزولی") {
      recommendation = `⚠️ ${series.title}: افت ${delta !== null ? `${delta}` : ""} درصدی دیده می‌شود؛ منابع و ساعت مطالعه را بازبینی کن.`;
    } else if (average >= 70) {
      recommendation = `✅ ${series.title}: وضعیت خوب است (${average}٪)؛ برای تثبیت، تست‌های سطح بالاتر کار کن.`;
    } else {
      recommendation = `🎯 ${series.title}: وضعیت متوسط است (${average}٪)؛ تمرین هدفمند و مرور اشتباهات را جدی بگیر.`;
    }

    return {
      subjectTitle: series.title,
      average,
      first,
      last,
      delta,
      trend,
      studyMinutes: study.minutes,
      practiceCount: study.practice,
      recommendation,
    };
  });

  const orderedSubjects = subjectTrends.sort((a, b) => a.average - b.average);
  const overallSeries = examsList.map((exam) => ({
    examId: exam.id,
    examDate: exam.examDate,
    title: exam.title,
    percent: exam.overallPercent,
  }));
  const totalStudyMinutes = [...studyBySubject.values()].reduce(
    (sum, value) => sum + value.minutes,
    0,
  );

  const best = [...subjectTrends].sort((a, b) => b.average - a.average)[0] ?? null;
  const worst = orderedSubjects[0] ?? null;
  const bestGrowth = [...subjectTrends]
    .filter((subject) => subject.delta !== null)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0] ?? null;
  const worstGrowth = [...subjectTrends]
    .filter((subject) => subject.delta !== null)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0] ?? null;

  const parts: string[] = [];
  if (examsList.length === 0) {
    parts.push("در این بازه آزمونی ثبت نشده است. برای تحلیل روند، نتیجه آزمون‌ها را وارد کنید.");
  } else {
    const avgOverall = Math.round(
      examsList.reduce((sum, exam) => sum + exam.overallPercent, 0) / examsList.length,
    );
    parts.push(
      `در ${examsList.length.toLocaleString("fa-IR")} آزمون این بازه، میانگین کل ${avgOverall}٪ است و ${totalStudyMinutes.toLocaleString("fa-IR")} دقیقه مطالعه ثبت شده است.`,
    );
    if (best && worst) {
      parts.push(
        `قوی‌ترین درس ${best.subjectTitle} (${best.average}٪) و ضعیف‌ترین ${worst.subjectTitle} (${worst.average}٪) است.`,
      );
    }
    if (bestGrowth && (bestGrowth.delta ?? 0) > 0) {
      parts.push(
        `بیشترین رشد در ${bestGrowth.subjectTitle} با ${bestGrowth.delta !== null ? `+${bestGrowth.delta}` : ""} درصد دیده می‌شود.`,
      );
    }
    if (worstGrowth && (worstGrowth.delta ?? 0) < 0) {
      parts.push(
        `بیشترین افت در ${worstGrowth.subjectTitle} با ${worstGrowth.delta} درصد است.`,
      );
    }
    if (worst) {
      parts.push(`پیشنهاد اصلی: این هفته برای ${worst.subjectTitle} وقت مشخص و تست هدفمند بگذار.`);
    }
  }

  return {
    from: input.from,
    to: input.to,
    exams: examsList,
    overallSeries,
    subjects: orderedSubjects,
    totalStudyMinutes,
    summary: parts.join(" "),
  };
}
