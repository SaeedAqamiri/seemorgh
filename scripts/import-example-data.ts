import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../src/db/client";
import {
  aiRuns,
  auditLogs,
  availability,
  contentItems,
  dailyLogs,
  examAnswers,
  examAssignments,
  examAttempts,
  examTargets,
  exams,
  externalExams,
  notifications,
  performancePanels,
  plans,
  questionBanks,
  questions,
  reports,
  resources,
  studentConstraints,
  students,
  subjects,
  tasks,
  users,
  weeklyPanels,
  workspaces,
} from "../src/db/schema";

const TABLES = [
  ["workspaces", workspaces],
  ["users", users],
  ["students", students],
  ["subjects", subjects],
  ["resources", resources],
  ["availability", availability],
  ["student_constraints", studentConstraints],
  ["exam_targets", examTargets],
  ["external_exams", externalExams],
  ["question_banks", questionBanks],
  ["questions", questions],
  ["exams", exams],
  ["exam_assignments", examAssignments],
  ["exam_attempts", examAttempts],
  ["exam_answers", examAnswers],
  ["plans", plans],
  ["tasks", tasks],
  ["weekly_panels", weeklyPanels],
  ["performance_panels", performancePanels],
  ["daily_logs", dailyLogs],
  ["content_items", contentItems],
  ["reports", reports],
  ["notifications", notifications],
  ["audit_logs", auditLogs],
  ["ai_runs", aiRuns],
] as const;

const DATE_FIELDS: Record<string, string[]> = {
  workspaces: ["createdAt"],
  users: ["createdAt"],
  students: ["createdAt"],
  subjects: ["createdAt"],
  resources: ["createdAt"],
  availability: ["createdAt"],
  student_constraints: [],
  exam_targets: ["createdAt"],
  external_exams: ["createdAt"],
  question_banks: ["createdAt"],
  questions: ["createdAt"],
  exams: ["startAt", "endAt", "publishedAt", "createdAt"],
  exam_assignments: ["createdAt"],
  exam_attempts: ["startedAt", "deadlineAt", "submittedAt", "createdAt"],
  exam_answers: ["gradedAt", "createdAt"],
  plans: ["createdAt", "approvedAt"],
  tasks: ["actualStartedAt", "actualEndedAt", "createdAt"],
  weekly_panels: ["updatedAt"],
  performance_panels: ["narrativeAt", "updatedAt"],
  daily_logs: ["firstStartedAt", "createdAt"],
  content_items: ["createdAt"],
  reports: ["createdAt"],
  notifications: ["readAt", "createdAt"],
  audit_logs: ["createdAt"],
  ai_runs: ["createdAt"],
};

type Row = Record<string, unknown>;

function reviveDates(name: string, rows: Row[]): Row[] {
  const fields = DATE_FIELDS[name] ?? [];
  if (fields.length === 0) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const field of fields) {
      const value = copy[field];
      if (typeof value === "string" && value) copy[field] = new Date(value);
    }
    return copy;
  });
}

async function main() {
  const db = await getDb();
  const inDir = join(process.cwd(), "data", "example");
  readFileSync(join(inDir, "manifest.json"), "utf8");

  for (const [name, table] of TABLES) {
    const content = readFileSync(join(inDir, `${name}.json`), "utf8");
    const rows = reviveDates(name, JSON.parse(content) as Row[]);
    if (rows.length === 0) {
      console.log(`${name}: 0`);
      continue;
    }
    await db.insert(table as never).values(rows as never).onConflictDoNothing();
    console.log(`${name}: ${rows.length}`);
  }

  console.log("example data imported from data/example");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
