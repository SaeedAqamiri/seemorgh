import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/client";
import {
  availability,
  bellSchedules,
  dailyLogs,
  examTargets,
  externalExams,
  performancePanels,
  plans,
  resourceChapters,
  resourcePool,
  resourcePoolChapters,
  resources,
  studentConstraints,
  students,
  subjects,
  tasks,
  users,
  weeklyPanels,
  workspaces,
} from "../db/schema";

export const EXAMPLE_TABLES = [
  ["workspaces", workspaces],
  ["users", users],
  ["students", students],
  ["subjects", subjects],
  ["resource_pool", resourcePool],
  ["resource_pool_chapters", resourcePoolChapters],
  ["resources", resources],
  ["resource_chapters", resourceChapters],
  ["bell_schedules", bellSchedules],
  ["availability", availability],
  ["student_constraints", studentConstraints],
  ["exam_targets", examTargets],
  ["external_exams", externalExams],
  ["plans", plans],
  ["tasks", tasks],
  ["weekly_panels", weeklyPanels],
  ["performance_panels", performancePanels],
  ["daily_logs", dailyLogs],
] as const;

export const EXAMPLE_DATE_FIELDS: Record<string, string[]> = {
  workspaces: ["createdAt"],
  users: ["createdAt"],
  students: ["createdAt"],
  subjects: ["createdAt"],
  resource_pool: ["createdAt"],
  resource_pool_chapters: ["createdAt"],
  resources: ["createdAt"],
  resource_chapters: ["createdAt"],
  bell_schedules: ["createdAt"],
  availability: ["createdAt"],
  student_constraints: [],
  exam_targets: ["createdAt"],
  external_exams: ["createdAt"],
  plans: ["createdAt", "approvedAt"],
  tasks: ["actualStartedAt", "actualEndedAt", "createdAt"],
  weekly_panels: ["updatedAt"],
  performance_panels: ["narrativeAt", "updatedAt"],
  daily_logs: ["firstStartedAt", "firstOpenedAt", "challengeCompletedAt", "createdAt"],
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
