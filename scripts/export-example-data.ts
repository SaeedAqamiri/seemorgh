import { mkdirSync, writeFileSync } from "node:fs";
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

async function main() {
  const db = await getDb();
  const outDir = join(process.cwd(), "data", "example");
  mkdirSync(outDir, { recursive: true });

  const counts: Record<string, number> = {};

  for (const [name, table] of TABLES) {
    const rows = (await db.select().from(table as never)) as unknown as Record<string, unknown>[];
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    counts[name] = rows.length;
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    note: "Demo data for Seemorgh. All demo passwords are seemorgh123.",
    tables: counts,
  };
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log("example data exported to data/example");
  for (const [name, count] of Object.entries(counts)) {
    console.log(`${name}: ${count}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
