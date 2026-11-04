import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ExamAnalysisView } from "@/components/exam-analysis-view";
import { getDb } from "@/db/client";
import { subjects } from "@/db/schema";
import { requireCounselor } from "@/lib/auth";
import { getStudentDetail } from "@/lib/counselor";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import {
  buildSingleExamAnalysis,
  getExamCohortStats,
  getStudentTrendAnalysis,
  listStudentExamResults,
} from "@/lib/exam-analysis";

export default async function CounselorExamAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    exam?: string;
    from?: string;
    to?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { exam, from: fromParam, to: toParam, success, error } = await searchParams;

  const detail = await getStudentDetail(counselor.workspaceId, id);
  if (!detail) notFound();

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
      .where(eq(subjects.workspaceId, counselor.workspaceId))
      .orderBy(subjects.title),
    listStudentExamResults(id),
    getStudentTrendAnalysis({
      studentId: id,
      workspaceId: counselor.workspaceId,
      from: rangeFrom,
      to: rangeTo,
    }),
  ]);

  let selectedExam = null;
  if (exam) {
    const [source, examId] = exam.split(":");
    if ((source === "internal" || source === "external") && examId) {
      selectedExam = results.find((result) => result.source === source && result.id === examId) ?? null;
    }
  }

  const selectedAnalysis = selectedExam
    ? buildSingleExamAnalysis(
        selectedExam,
        selectedExam.source === "external"
          ? await getExamCohortStats({
              workspaceId: counselor.workspaceId,
              title: selectedExam.title,
              examDate: selectedExam.examDate,
            })
          : [],
      )
    : null;

  return (
    <ExamAnalysisView
      studentId={id}
      studentName={detail.student.name}
      basePath={`/counselor/students/${id}/exam-analysis`}
      backHref={`/counselor/students/${id}`}
      backLabel={`بازگشت به ${detail.student.name}`}
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
