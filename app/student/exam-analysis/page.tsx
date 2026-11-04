import { eq } from "drizzle-orm";
import { ExamAnalysisView } from "@/components/exam-analysis-view";
import { getDb } from "@/db/client";
import { subjects } from "@/db/schema";
import { requireStudent } from "@/lib/auth";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import {
  buildSingleExamAnalysis,
  getExamCohortStats,
  getStudentTrendAnalysis,
  listStudentExamResults,
} from "@/lib/exam-analysis";

export default async function StudentExamAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{
    exam?: string;
    from?: string;
    to?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const { user, student } = await requireStudent();
  const { exam, from: fromParam, to: toParam, success, error } = await searchParams;

  const today = todayISO();
  const defaultFrom = addDays(today, -120);
  const from = fromParam && isISODate(fromParam) ? fromParam : defaultFrom;
  const to = toParam && isISODate(toParam) ? toParam : today;
  const rangeFrom = from <= to ? from : defaultFrom;
  const rangeTo = from <= to ? to : today;

  const db = await getDb();
  const [subjectRows, results, trend] = await Promise.all([
    db
      .select({ id: subjects.id, title: subjects.title })
      .from(subjects)
      .where(eq(subjects.workspaceId, user.workspaceId))
      .orderBy(subjects.title),
    listStudentExamResults(student.id),
    getStudentTrendAnalysis({
      studentId: student.id,
      workspaceId: user.workspaceId,
      from: rangeFrom,
      to: rangeTo,
    }),
  ]);

  let selectedExam = null;
  if (exam) {
    const [source, id] = exam.split(":");
    if ((source === "internal" || source === "external") && id) {
      selectedExam = results.find((result) => result.source === source && result.id === id) ?? null;
    }
  }

  const selectedAnalysis = selectedExam
    ? buildSingleExamAnalysis(
        selectedExam,
        selectedExam.source === "external"
          ? await getExamCohortStats({
              workspaceId: user.workspaceId,
              title: selectedExam.title,
              examDate: selectedExam.examDate,
            })
          : [],
      )
    : null;

  return (
    <ExamAnalysisView
      studentId={student.id}
      basePath="/student/exam-analysis"
      backHref="/student"
      backLabel="بازگشت به امروز"
      subjects={subjectRows}
      results={results}
      trend={trend}
      from={rangeFrom}
      to={rangeTo}
      selectedExam={selectedExam}
      selectedAnalysis={selectedAnalysis}
      success={success}
      error={error}
    />
  );
}
