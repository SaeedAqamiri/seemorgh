import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/client";
import {
  availability,
  bellSchedules,
  dailyLogs,
  examTargets,
  externalExams,
  groupMockExams,
  mockExamPrograms,
  performancePanels,
  planningSettings,
  plans,
  psychAnswers,
  psychAttempts,
  psychDimensions,
  psychOptions,
  psychQuestions,
  psychTests,
  reports,
  resourceChapters,
  resourcePool,
  resourcePoolChapters,
  resources,
  schoolLessons,
  studentConstraints,
  studentGroups,
  studentMockExams,
  students,
  studyGoals,
  subjects,
  tasks,
  users,
  weeklyPanels,
  workspaces,
} from "../db/schema";

export const EXAMPLE_TABLES = [
  ["workspaces", workspaces],
  ["users", users],
  ["student_groups", studentGroups],
  ["students", students],
  ["subjects", subjects],
  ["resource_pool", resourcePool],
  ["resource_pool_chapters", resourcePoolChapters],
  ["resources", resources],
  ["resource_chapters", resourceChapters],
  ["bell_schedules", bellSchedules],
  ["school_lessons", schoolLessons],
  ["availability", availability],
  ["student_constraints", studentConstraints],
  ["study_goals", studyGoals],
  ["planning_settings", planningSettings],
  ["exam_targets", examTargets],
  ["mock_exam_programs", mockExamPrograms],
  ["external_exams", externalExams],
  ["student_mock_exams", studentMockExams],
  ["group_mock_exams", groupMockExams],
  ["plans", plans],
  ["tasks", tasks],
  ["weekly_panels", weeklyPanels],
  ["performance_panels", performancePanels],
  ["reports", reports],
  ["daily_logs", dailyLogs],
  ["psych_tests", psychTests],
  ["psych_dimensions", psychDimensions],
  ["psych_questions", psychQuestions],
  ["psych_options", psychOptions],
  ["psych_attempts", psychAttempts],
  ["psych_answers", psychAnswers],
] as const;

export const EXAMPLE_DATE_FIELDS: Record<string, string[]> = {
  workspaces: ["createdAt"],
  users: ["createdAt"],
  student_groups: ["createdAt"],
  students: ["createdAt"],
  subjects: ["createdAt"],
  resource_pool: ["createdAt"],
  resource_pool_chapters: ["createdAt"],
  resources: ["createdAt"],
  resource_chapters: ["createdAt"],
  bell_schedules: ["createdAt"],
  school_lessons: ["createdAt"],
  availability: ["createdAt"],
  student_constraints: [],
  study_goals: ["createdAt"],
  planning_settings: ["updatedAt"],
  exam_targets: ["createdAt"],
  mock_exam_programs: ["createdAt"],
  external_exams: ["createdAt"],
  student_mock_exams: ["createdAt"],
  group_mock_exams: ["createdAt"],
  plans: ["createdAt", "approvedAt"],
  tasks: ["actualStartedAt", "actualEndedAt", "createdAt"],
  weekly_panels: ["updatedAt"],
  performance_panels: ["narrativeAt", "updatedAt"],
  reports: ["createdAt"],
  daily_logs: ["firstStartedAt", "firstOpenedAt", "challengeCompletedAt", "createdAt"],
  psych_tests: ["publishedAt", "createdAt", "updatedAt"],
  psych_dimensions: [],
  psych_questions: ["createdAt"],
  psych_options: [],
  psych_attempts: ["startedAt", "submittedAt", "createdAt"],
  psych_answers: ["createdAt"],
};

export async function exportExampleData(): Promise<Record<string, number>> {
  const db = await getDb();
  const outDir = join(process.cwd(), "data", "example");
  mkdirSync(outDir, { recursive: true });

  const counts: Record<string, number> = {};
  const included = new Set(EXAMPLE_TABLES.map(([name]) => `${name}.json`));
  for (const [name, table] of EXAMPLE_TABLES) {
    const rows = (await db.select().from(table as never)) as unknown as Record<string, unknown>[];
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(rows)}\n`, "utf8");
    counts[name] = rows.length;
  }
  for (const file of readdirSync(outDir)) {
    if (file.endsWith(".json") && file !== "manifest.json" && !included.has(file)) {
      unlinkSync(join(outDir, file));
    }
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    note: "Demo data for Seemorgh. All demo passwords are seemorgh123.",
    tables: counts,
  };
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return counts;
}
