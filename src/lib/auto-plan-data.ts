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
import { listStudentExamResults } from "./exam-analysis";

export type AutoPlanContext = {
  detail: StudentDetail;
  goals: StudyGoalInput[];
  targetDate: string | null;
  policy: PlanningPolicy;
  currentPercentBySubject: Map<string, number>;
};

export async function getAutoPlanContext(
  workspaceId: string,
  studentId: string,
): Promise<AutoPlanContext | null> {
  const detail = await getStudentDetail(workspaceId, studentId);
  if (!detail) return null;

  const db = await getDb();
  const [goalRows, settingRows, examResults] = await Promise.all([
    db.select().from(studyGoals).where(eq(studyGoals.studentId, studentId)),
    db
      .select()
      .from(planningSettings)
      .where(eq(planningSettings.studentId, studentId))
      .limit(1),
    listStudentExamResults(studentId).catch(() => []),
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
  return {
    detail,
    goals,
    targetDate: settings?.targetDate ?? null,
    policy: settings?.policyJson
      ? normalizePolicy(settings.policyJson)
      : { ...DEFAULT_PLANNING_POLICY },
    currentPercentBySubject,
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
