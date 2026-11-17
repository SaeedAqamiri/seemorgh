import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { planningSettings, studyGoals } from "@/db/schema";
import {
  DEFAULT_PLANNING_POLICY,
  normalizePolicy,
  type PlanningPolicy,
  type StudyGoalInput,
} from "./auto-plan";
import { getStudentDetail, type StudentDetail } from "./counselor";
import { todayISO } from "./dates";
import { listStudentExamResults } from "./exam-analysis";
import { ensureSystemSubject } from "./subject-catalog";
import { getSchoolIntervals } from "./school-schedule";
import {
  ensureGroupMockExamPlan,
  latestSelectedExam,
  listMockExamPrograms,
  studentMockExamPrograms,
} from "./mock-exams";
import type { MockExamProgram } from "@/db/schema";
import type { PlanningLevel, PlannerExamAnchor, PlannerSchoolPeriod, SubjectSpeed } from "./auto-plan";
import {
  applyPsychProfileToPolicy,
  getStudentPsychProfile,
  type StudentPsychProfile,
} from "./psych-profile";

export type AutoPlanContext = {
  detail: StudentDetail;
  goals: StudyGoalInput[];
  targetDate: string | null;
  policy: PlanningPolicy;
  currentPercentBySubject: Map<string, number>;
  mockExams: MockExamProgram[];
  allMockExams: MockExamProgram[];
  goalExamId: string | null;
  schoolPeriods: PlannerSchoolPeriod[];
  level: PlanningLevel;
  subjectSpeeds: Record<string, SubjectSpeed>;
  analysisMinutesPerExam: number;
  replanFromDate: string | null;
  systemSubjectId: string;
  psychProfile: StudentPsychProfile;
};

export async function getAutoPlanContext(
  workspaceId: string,
  studentId: string,
): Promise<AutoPlanContext | null> {
  const detail = await getStudentDetail(workspaceId, studentId);
  if (!detail) return null;

  const db = await getDb();
  const [goalRows, settingRows, examResults, psychProfile] = await Promise.all([
    db.select().from(studyGoals).where(eq(studyGoals.studentId, studentId)),
    db
      .select()
      .from(planningSettings)
      .where(eq(planningSettings.studentId, studentId))
      .limit(1),
    listStudentExamResults(studentId).catch(() => []),
    getStudentPsychProfile(workspaceId, studentId).catch(() => ({
      attempts: [],
      signals: [],
      recommendations: [],
      careerInterests: [],
      strengths: [],
      policyAdjustments: {},
    })),
  ]);

  const subjectTitles = new Map(detail.subjects.map((subject) => [subject.id, subject.title]));
  const goals: StudyGoalInput[] = goalRows
    .map((goal) => ({
      subjectId: goal.subjectId,
      subjectTitle: subjectTitles.get(goal.subjectId) ?? goal.subjectId,
      metric: goal.metric,
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      weight: goal.weight,
    }))
    .filter((goal) => subjectTitles.has(goal.subjectId));

  const currentPercentBySubject = new Map<string, number>();
  const byTitle = new Map(detail.subjects.map((subject) => [subject.title, subject.id]));

  for (const result of examResults) {
    for (const subject of result.subjects) {
      const subjectId =
        subject.subjectId && subjectTitles.has(subject.subjectId)
          ? subject.subjectId
          : byTitle.get(subject.subjectTitle);
      if (!subjectId || currentPercentBySubject.has(subjectId)) continue;
      currentPercentBySubject.set(subjectId, subject.percent);
    }
  }

  const settings = settingRows[0];
  if (detail.group) await ensureGroupMockExamPlan(workspaceId, detail.group.id);
  const [selectedPrograms, schoolPeriods, systemSubjectId, allMockExams] = await Promise.all([
    studentMockExamPrograms(studentId, { fromDate: todayISO() }).catch(() => []),
    getSchoolIntervals(studentId).catch(() => []),
    ensureSystemSubject(workspaceId),
    listMockExamPrograms(workspaceId, { field: detail.student.field }).catch(() => []),
  ]);
  const goalExam = settings?.goalMockExamId
    ? allMockExams.find((exam) => exam.id === settings.goalMockExamId) ?? (await latestSelectedExam(studentId))
    : await latestSelectedExam(studentId);
  const subjectSpeeds: Record<string, SubjectSpeed> =
    (settings?.subjectSpeedsJson as Record<string, SubjectSpeed> | null | undefined) ?? {};

  return {
    detail,
    goals,
    targetDate: goalExam?.examDate ?? settings?.targetDate ?? null,
    policy: applyPsychProfileToPolicy(
      settings?.policyJson
        ? normalizePolicy(settings.policyJson)
        : { ...DEFAULT_PLANNING_POLICY },
      psychProfile,
    ),
    currentPercentBySubject,
    mockExams: selectedPrograms,
    allMockExams,
    goalExamId: goalExam?.id ?? null,
    schoolPeriods,
    level: (settings?.studentLevel as PlanningLevel | undefined) ?? "normal",
    subjectSpeeds,
    analysisMinutesPerExam: settings?.analysisMinutesPerExam ?? 120,
    replanFromDate: settings?.replanFromDate ?? null,
    systemSubjectId,
    psychProfile,
  };
}

export function examAnchorFor(
  program: MockExamProgram,
  analysisMinutes: number,
): PlannerExamAnchor {
  return {
    id: program.id,
    title: program.title,
    date: program.examDate,
    startMin: program.startMin,
    durationMinutes: program.durationMinutes,
    analysisMinutes: analysisMinutes || program.analysisMinutes,
    budget: (program.budgetJson ?? []).map((item) => ({
      subjectTitle: item.subjectTitle,
      chapters: item.chapters,
      weight: item.weight,
    })),
  };
}

export function defaultCurrentFor(
  context: Pick<AutoPlanContext, "currentPercentBySubject">,
  subjectId: string,
  metric: "percent" | "score",
): number {
  const percent = context.currentPercentBySubject.get(subjectId);
  if (percent === undefined) return 0;
  return metric === "score" ? Math.round((percent / 5) * 10) / 10 : percent;
}

export function defaultTargetFor(current: number, metric: "percent" | "score"): number {
  return metric === "score"
    ? Math.min(20, Math.round((current + 2) * 10) / 10)
    : Math.min(100, current + 10);
}
